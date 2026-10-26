//! Meter frames: the Spectrum and Level meter measured from the audio leaving the app. A frame
//! measures a moment, not state: a missed frame is skipped, never kept or replayed.
//!
//! The output callback copies what it wrote into a lock-free ring through a [`MeterTap`], and only
//! while the Meter runs. It never waits. An analysis thread reads the ring, measures one
//! [`MeterFrame`] per 1/60 s, and passes it to the callback. The thread parks while the Meter does
//! not run or has no callback, so a paused or unlistened player measures nothing.

use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, Thread};
use std::time::Duration;

use ringbuf::traits::{Consumer, Producer, Split};

use ringbuf::{HeapCons, HeapProd, HeapRb};

/// One-third-octave bands, base 10, centred on `1000 Hz * 10^(n/10)` for n = -16..=13 (25 Hz to
/// 20 kHz).
pub(crate) const BAND_COUNT: usize = 30;
/// Levels never go below this, in dBFS.
pub(crate) const FLOOR_DB: f32 = -90.0;
/// Frames per second the analysis produces.
pub(crate) const FRAMES_PER_SECOND: u32 = 60;
const FRAME_PERIOD: Duration = Duration::from_micros(1_000_000 / FRAMES_PER_SECOND as u64);

/// Stereo samples the ring holds: a quarter second at 48 kHz.
const RING_SAMPLES: usize = 24_000;

/// One measurement of the output. Levels are dBFS in `FLOOR_DB..=0`-ish (a band can read above 0
/// only for a signal beyond full scale). A band level is the amplitude of the sine that would
/// give that band energy, so a full-scale sine reads 0; left and right are combined per band as
/// the louder of the two ("Max LR"), so mono is not 6 dB louder and an inverted pair does not
/// cancel. Peak and RMS are per channel; RMS is of the samples as they are, so a full-scale sine
/// reads -3 dBFS. Clip is per channel: its peak reached full scale (`peak >= 1.0`).
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
pub struct MeterFrame {
    // Every level is finite (floored at `FLOOR_DB`), so the contract says `number`, not the
    // `number | null` that a float gets for a NaN, and the Channel needs no decoding on arrival.
    #[specta(type = Vec<specta_typescript::Number>)]
    pub bands: Vec<f32>,
    #[specta(type = [specta_typescript::Number; 2])]
    pub peak: [f32; 2],
    #[specta(type = [specta_typescript::Number; 2])]
    pub rms: [f32; 2],
    pub clip: [bool; 2],
}

impl MeterFrame {
    pub fn silent() -> Self {
        Self {
            bands: vec![FLOOR_DB; BAND_COUNT],
            peak: [FLOOR_DB; 2],
            rms: [FLOOR_DB; 2],
            clip: [false; 2],
        }
    }
}

fn to_db(value: f64) -> f32 {
    if value.is_nan() || value <= 0.0 {
        return FLOOR_DB;
    }
    (10.0 * value.log10()).max(f64::from(FLOOR_DB)) as f32
}

// --- Filters --------------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    z1: f64,
    z2: f64,
}

impl Biquad {
    /// RBJ low-pass (`high == false`) or high-pass, corner `freq`, Butterworth-style `q`.
    fn new(high: bool, freq: f64, q: f64, sample_rate: f64) -> Self {
        let w = 2.0 * std::f64::consts::PI * freq / sample_rate;
        let (sin, cos) = w.sin_cos();
        let alpha = sin / (2.0 * q);
        let a0 = 1.0 + alpha;
        let (b0, b1, b2) = if high {
            let half = f64::midpoint(1.0, cos);
            (half, -(1.0 + cos), half)
        } else {
            ((1.0 - cos) / 2.0, 1.0 - cos, (1.0 - cos) / 2.0)
        };
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: -2.0 * cos / a0,
            a2: (1.0 - alpha) / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }

    fn flush_denormals(&mut self) {
        if self.z1.abs() < 1e-20 {
            self.z1 = 0.0;
        }
        if self.z2.abs() < 1e-20 {
            self.z2 = 0.0;
        }
    }

    /// Gain at `freq`, to normalise a band to unity at its centre.
    fn magnitude(&self, freq: f64, sample_rate: f64) -> f64 {
        let w = 2.0 * std::f64::consts::PI * freq / sample_rate;
        let (s1, c1) = w.sin_cos();
        let (s2, c2) = (2.0 * w).sin_cos();
        let num_re = self.b0 + self.b1 * c1 + self.b2 * c2;
        let num_im = -(self.b1 * s1 + self.b2 * s2);
        let den_re = 1.0 + self.a1 * c1 + self.a2 * c2;
        let den_im = -(self.a1 * s1 + self.a2 * s2);
        (num_re.hypot(num_im)) / den_re.hypot(den_im)
    }
}

/// First-order section (bilinear), the odd order of a third-order Butterworth.
#[derive(Clone, Copy)]
struct OnePole {
    b0: f64,
    b1: f64,
    a1: f64,
    z: f64,
}

impl OnePole {
    fn new(high: bool, freq: f64, sample_rate: f64) -> Self {
        let k = (std::f64::consts::PI * freq / sample_rate).tan();
        let a0 = 1.0 + k;
        let (b0, b1) = if high { (1.0, -1.0) } else { (k, k) };
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            a1: (k - 1.0) / a0,
            z: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.z;
        self.z = self.b1 * x - self.a1 * y;
        y
    }

    fn flush_denormals(&mut self) {
        if self.z.abs() < 1e-20 {
            self.z = 0.0;
        }
    }
}

type Complex = (f64, f64);

fn csqrt((re, im): Complex) -> Complex {
    let r = re.hypot(im);
    let root = f64::midpoint(r, re).max(0.0).sqrt();
    let imag = ((r - re) / 2.0).max(0.0).sqrt();
    (root, if im < 0.0 { -imag } else { imag })
}

/// A third-order Butterworth band-pass between `lower` and `upper` (so sixth order): the low-pass
/// prototype's poles moved to the band and mapped to the z-plane, one biquad per conjugate pair
/// with zeros at DC and Nyquist, each scaled to unity gain at `centre`.
fn butterworth_bandpass(lower: f64, upper: f64, centre: f64, rate: f64) -> Vec<Biquad> {
    const ORDER: usize = 3;
    let prewarp = |f: f64| 2.0 * rate * (std::f64::consts::PI * f / rate).tan();
    let (low, high) = (prewarp(lower), prewarp(upper));
    let (w0_squared, bandwidth) = (low * high, high - low);
    let mut sections = Vec::new();
    for k in 0..ORDER {
        let angle = std::f64::consts::PI * (2 * k + ORDER + 1) as f64 / (2 * ORDER) as f64;
        let pole = (angle.cos() * bandwidth, angle.sin() * bandwidth);
        let squared = (pole.0 * pole.0 - pole.1 * pole.1, 2.0 * pole.0 * pole.1);
        let root = csqrt((squared.0 - 4.0 * w0_squared, squared.1));
        for sign in [1.0, -1.0] {
            let s = (
                f64::midpoint(pole.0, sign * root.0),
                f64::midpoint(pole.1, sign * root.1),
            );
            if s.1 <= 0.0 {
                continue;
            }
            // Bilinear: z = (2 fs + s) / (2 fs - s).
            let (n, d) = ((2.0 * rate + s.0, s.1), (2.0 * rate - s.0, -s.1));
            let norm = d.0 * d.0 + d.1 * d.1;
            let z = (
                (n.0 * d.0 + n.1 * d.1) / norm,
                (n.1 * d.0 - n.0 * d.1) / norm,
            );
            let mut section = Biquad {
                b0: 1.0,
                b1: 0.0,
                b2: -1.0,
                a1: -2.0 * z.0,
                a2: z.0 * z.0 + z.1 * z.1,
                z1: 0.0,
                z2: 0.0,
            };
            let gain = 1.0 / section.magnitude(centre, rate);
            section.b0 = gain;
            section.b2 = -gain;
            sections.push(section);
        }
    }
    sections
}

/// One band: a sixth-order Butterworth band-pass; the lowest band is a third-order low-pass at
/// its upper edge instead, so DC and sub-bass show.
#[derive(Clone)]
struct Band {
    sections: Vec<Biquad>,
    pole: Option<OnePole>,
}

impl Band {
    fn new(index: usize, sample_rate: f64) -> Option<Self> {
        let centre = 1000.0 * 10_f64.powf((index as f64 - 16.0) / 10.0);
        // Half a third-octave in the base-10 system is 10^(1/20).
        let edge = 10_f64.powf(0.05);
        let nyquist = sample_rate / 2.0;
        if centre >= nyquist * 0.95 {
            return None;
        }
        // A top band whose upper edge is past the Nyquist frequency stops short of it.
        let (lower, upper) = (centre / edge, (centre * edge).min(nyquist * 0.98));
        Some(if index == 0 {
            Self {
                sections: vec![Biquad::new(false, upper, 1.0, sample_rate)],
                pole: Some(OnePole::new(false, upper, sample_rate)),
            }
        } else {
            Self {
                sections: butterworth_bandpass(lower, upper, centre, sample_rate),
                pole: None,
            }
        })
    }

    #[inline]
    fn process(&mut self, x: f64) -> f64 {
        let mut y = x;
        for section in &mut self.sections {
            y = section.process(y);
        }
        match &mut self.pole {
            Some(pole) => pole.process(y),
            None => y,
        }
    }

    fn flush_denormals(&mut self) {
        self.sections.iter_mut().for_each(Biquad::flush_denormals);
        if let Some(pole) = &mut self.pole {
            pole.flush_denormals();
        }
    }
}

// --- Analysis -------------------------------------------------------------------------------

/// Turns interleaved stereo samples into Meter frames, one per `sample_rate / 60` frames of
/// audio, whatever the chunking of the input.
pub(crate) struct Analyzer {
    /// `bands[channel][band]`; a band the sample rate cannot carry is `None` and reads the floor.
    bands: [Vec<Option<Band>>; 2],
    frame_len: usize,
    filled: usize,
    energy: [[f64; BAND_COUNT]; 2],
    sum_squares: [f64; 2],
    peak: [f32; 2],
}

impl Analyzer {
    pub(crate) fn new(sample_rate: u32) -> Self {
        let rate = f64::from(sample_rate.max(1));
        let make = || {
            (0..BAND_COUNT)
                .map(|i| Band::new(i, rate))
                .collect::<Vec<_>>()
        };
        Self {
            bands: [make(), make()],
            frame_len: (sample_rate / FRAMES_PER_SECOND).max(1) as usize,
            filled: 0,
            energy: [[0.0; BAND_COUNT]; 2],
            sum_squares: [0.0; 2],
            peak: [0.0; 2],
        }
    }

    /// Feeds interleaved stereo samples (a trailing half frame is ignored) and calls `emit` for
    /// every frame they complete.
    pub(crate) fn process(&mut self, samples: &[f32], emit: &mut impl FnMut(MeterFrame)) {
        for pair in samples.as_chunks::<2>().0 {
            for (((&sample, peak), sum_squares), (bands, channel_energy)) in pair
                .iter()
                .zip(&mut self.peak)
                .zip(&mut self.sum_squares)
                .zip(self.bands.iter_mut().zip(&mut self.energy))
            {
                let sample = if sample.is_finite() { sample } else { 0.0 };
                *peak = peak.max(sample.abs());
                let x = f64::from(sample);
                *sum_squares += x * x;
                for (band, energy) in bands.iter_mut().zip(channel_energy) {
                    if let Some(band) = band {
                        let y = band.process(x);
                        *energy += y * y;
                    }
                }
            }
            self.filled += 1;
            if self.filled == self.frame_len {
                emit(self.finish_frame());
            }
        }
    }

    fn finish_frame(&mut self) -> MeterFrame {
        let len = self.filled as f64;
        let mut frame = MeterFrame::silent();
        let [left_energy, right_energy] = &self.energy;
        for ((level, left), right) in frame.bands.iter_mut().zip(left_energy).zip(right_energy) {
            let louder = left.max(*right);
            // A sine of amplitude A has mean square A^2 / 2.
            *level = to_db(2.0 * louder / len);
        }
        for ((peak, rms), (&channel_peak, &sum_squares)) in frame
            .peak
            .iter_mut()
            .zip(&mut frame.rms)
            .zip(self.peak.iter().zip(&self.sum_squares))
        {
            *peak = to_db(f64::from(channel_peak).powi(2));
            *rms = to_db(sum_squares / len);
        }
        frame.clip = self.peak.map(|peak| peak >= 1.0);
        self.filled = 0;
        self.energy = [[0.0; BAND_COUNT]; 2];
        self.sum_squares = [0.0; 2];
        self.peak = [0.0; 2];
        for band in self.bands.iter_mut().flatten().flatten() {
            band.flush_denormals();
        }
        frame
    }
}

/// Holds back a frame that is silent right after a silent frame: nothing changed, so nothing is
/// sent. `last_sent_silent` starts as true, because the renderer starts from the floor.
fn held_back(frame: &MeterFrame, last_sent_silent: &mut bool) -> bool {
    let silent = *frame == MeterFrame::silent();
    let held = silent && *last_sent_silent;
    *last_sent_silent = silent;
    held
}

// --- The tap and the Meter ------------------------------------------------------------------

struct Source {
    consumer: HeapCons<f32>,
    sample_rate: u32,
}

/// Where Meter frames go. Called on the analysis thread for each frame that is sent.
pub type FrameCallback = Box<dyn Fn(&MeterFrame) + Send>;

struct Shared {
    /// Whether the Player runs the output. The output callback copies only while it is set.
    running: Arc<AtomicBool>,
    /// The newest stream's ring, until the analysis thread takes it.
    source: Mutex<Option<Source>>,
    callback: Mutex<Option<FrameCallback>>,
}

/// The Meter: the frames measured from the output, for the one callback that listens.
#[derive(Clone)]
pub struct Meter {
    shared: Arc<Shared>,
    /// The analysis thread, to unpark it.
    analysis: Thread,
}

impl Default for Meter {
    fn default() -> Self {
        Self::new()
    }
}

impl Meter {
    /// Starts the analysis thread, which parks until the Meter runs and has a callback.
    pub fn new() -> Self {
        let shared = Arc::new(Shared {
            running: Arc::new(AtomicBool::new(false)),
            source: Mutex::new(None),
            callback: Mutex::new(None),
        });
        let analysis = thread::Builder::new()
            .name("meter-analysis".into())
            .spawn({
                let shared = Arc::clone(&shared);
                move || run_analysis(&shared)
            })
            .expect("the meter thread starts with the app");
        Self {
            shared,
            analysis: analysis.thread().clone(),
        }
    }

    /// Sends frames to `callback`, replacing any earlier callback.
    pub fn start(&self, callback: FrameCallback) {
        *self.shared.callback.lock() = Some(callback);
        self.analysis.unpark();
    }

    /// Stops sending frames. The analysis thread parks until the next `start`.
    pub fn stop(&self) {
        *self.shared.callback.lock() = None;
    }

    /// Runs or parks the measurement. The Player calls it on start, pause, resume, stop and
    /// failure.
    pub(crate) fn set_running(&self, running: bool) {
        self.shared.running.store(running, Ordering::Release);
        if running {
            self.analysis.unpark();
        }
    }

    /// A tap for a stream playing at `sample_rate`. Not for the output callback: it allocates.
    /// The stream's ring replaces the previous stream's.
    pub(crate) fn tap(&self, sample_rate: u32, channel_count: usize) -> MeterTap {
        let (producer, consumer) = HeapRb::<f32>::new(RING_SAMPLES).split();
        *self.shared.source.lock() = Some(Source {
            consumer,
            sample_rate,
        });
        MeterTap {
            producer,
            running: Arc::clone(&self.shared.running),
            channel_count: channel_count.max(1),
            phase: 0,
            left: 0.0,
        }
    }
}

fn is_wanted(shared: &Shared) -> bool {
    shared.running.load(Ordering::Acquire) && shared.callback.lock().is_some()
}

fn run_analysis(shared: &Shared) {
    let mut source: Option<(Source, Analyzer)> = None;
    let mut buffer = [0.0_f32; 2048];
    let mut last_sent_silent = true;
    loop {
        if !is_wanted(shared) {
            thread::park();
            continue;
        }
        if let Some(fresh) = shared.source.lock().take() {
            let analyzer = Analyzer::new(fresh.sample_rate);
            source = Some((fresh, analyzer));
        }
        let Some((ring, analyzer)) = &mut source else {
            thread::sleep(FRAME_PERIOD);
            continue;
        };
        let read = ring.consumer.pop_slice(&mut buffer);
        if read == 0 {
            thread::sleep(FRAME_PERIOD);
            continue;
        }
        analyzer.process(&buffer[..read], &mut |frame| {
            if held_back(&frame, &mut last_sent_silent) {
                return;
            }
            if let Some(callback) = shared.callback.lock().as_ref() {
                callback(&frame);
            }
        });
    }
}

/// The output callback's end of the ring. Copies stereo samples while the Meter runs and drops
/// them when the ring is full; it never waits, allocates, locks or analyses.
pub(crate) struct MeterTap {
    producer: HeapProd<f32>,
    running: Arc<AtomicBool>,
    channel_count: usize,
    /// Position within the interleaved frame being copied; chunks may end mid-frame.
    phase: usize,
    left: f32,
}

impl MeterTap {
    /// Copies `samples`, interleaved with the stream's channel count: mono is duplicated, and
    /// channels after the first two are skipped.
    pub(crate) fn push(&mut self, samples: &[f32]) {
        if !self.running.load(Ordering::Acquire) {
            return;
        }
        for &sample in samples {
            let pair = match (self.channel_count, self.phase) {
                (1, _) => Some([sample, sample]),
                (_, 0) => {
                    self.left = sample;
                    None
                }
                (_, 1) => Some([self.left, sample]),
                _ => None,
            };
            self.phase = (self.phase + 1) % self.channel_count;
            if let Some(pair) = pair {
                // A full ring drops the pair; the analysis is behind, and a late frame is useless.
                self.producer.push_slice(&pair);
            }
        }
    }

    #[cfg(test)]
    fn vacant(&self) -> usize {
        ringbuf::traits::Observer::vacant_len(&self.producer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    const RATE: u32 = 48_000;

    fn is_floor(db: f32) -> bool {
        (db - FLOOR_DB).abs() < 1e-6
    }

    fn sine(freq: f64, amplitude: f64, frames: usize) -> Vec<f64> {
        (0..frames)
            .map(|n| {
                amplitude * (2.0 * std::f64::consts::PI * freq * n as f64 / f64::from(RATE)).sin()
            })
            .collect()
    }

    fn interleave(left: &[f64], right: &[f64]) -> Vec<f32> {
        left.iter()
            .zip(right)
            .flat_map(|(l, r)| [*l as f32, *r as f32])
            .collect()
    }

    /// The last frame produced by feeding `samples`, once the filters have settled.
    fn measure(samples: &[f32]) -> MeterFrame {
        let mut analyzer = Analyzer::new(RATE);
        let mut last = None;
        analyzer.process(samples, &mut |frame| last = Some(frame));
        last.expect("the input was long enough for a frame")
    }

    fn band_of(freq: f64) -> usize {
        (0..BAND_COUNT)
            .min_by(|a, b| {
                let centre = |i: &usize| 1000.0 * 10_f64.powf((*i as f64 - 16.0) / 10.0);
                (centre(a) - freq)
                    .abs()
                    .total_cmp(&(centre(b) - freq).abs())
            })
            .unwrap()
    }

    #[test]
    fn a_1khz_sine_lands_in_its_band_with_the_neighbours_well_below() {
        let tone = sine(1000.0, 0.5, 48_000);
        let frame = measure(&interleave(&tone, &tone));
        let band = band_of(1000.0);
        let expected = 20.0 * 0.5_f32.log10();
        assert!(
            (frame.bands[band] - expected).abs() < 1.0,
            "band reads {} dB, expected about {expected}",
            frame.bands[band]
        );
        for neighbour in [band - 1, band + 1] {
            assert!(
                frame.bands[neighbour] < frame.bands[band] - 12.0,
                "neighbour {neighbour} reads {} dB",
                frame.bands[neighbour]
            );
        }
        assert!(frame.bands[band - 3] < frame.bands[band] - 35.0);
        assert!(frame.bands[band + 3] < frame.bands[band] - 35.0);
    }

    #[test]
    fn the_lowest_band_is_low_passed_so_sub_bass_shows() {
        let tone = sine(12.0, 0.5, 48_000);
        let frame = measure(&interleave(&tone, &tone));
        assert!(frame.bands[0] > -12.0, "reads {} dB", frame.bands[0]);
    }

    #[test]
    fn the_20khz_band_exists_at_44100_hz() {
        let mut analyzer = Analyzer::new(44_100);
        let tone: Vec<f32> = (0..2 * 4_410)
            .map(|n| {
                (2.0 * std::f32::consts::PI * 19_953.0 * (n / 2) as f32 / 44_100.0).sin() * 0.5
            })
            .collect();
        let mut last = None;
        analyzer.process(&tone, &mut |frame| last = Some(frame));
        assert!(last.unwrap().bands[BAND_COUNT - 1] > -12.0);
    }

    #[test]
    fn a_band_the_sample_rate_cannot_carry_reads_the_floor() {
        let mut analyzer = Analyzer::new(22_050);
        let mut last = None;
        analyzer.process(&vec![0.5; 2 * 2_205], &mut |frame| last = Some(frame));
        assert!(is_floor(last.unwrap().bands[BAND_COUNT - 1]));
    }

    #[test]
    fn silence_gives_the_floor_everywhere() {
        let frame = measure(&vec![0.0; 2 * 4_800]);
        assert_eq!(frame, MeterFrame::silent());
        assert_eq!(frame.clip, [false; 2]);
    }

    #[test]
    fn full_scale_on_one_channel_clips_that_channel_only() {
        let mut samples = vec![0.0_f32; 2 * 800];
        samples[10] = 1.0;
        let mut analyzer = Analyzer::new(RATE);
        let mut first = None;
        analyzer.process(&samples, &mut |frame| {
            first.get_or_insert(frame);
        });
        let frame = first.unwrap();
        assert!(frame.peak[0].abs() < 1e-6 && is_floor(frame.peak[1]));
        assert_eq!(frame.clip, [true, false]);
        let quiet = measure(&interleave(
            &sine(1000.0, 0.5, 4_800),
            &sine(1000.0, 0.5, 4_800),
        ));
        assert_eq!(quiet.clip, [false; 2]);
    }

    #[test]
    fn rms_of_a_constant_signal_is_its_level() {
        let frame = measure(&vec![0.5; 2 * 4_800]);
        assert!((frame.rms[0] - 20.0 * 0.5_f32.log10()).abs() < 0.01);
        assert!((frame.peak[1] - 20.0 * 0.5_f32.log10()).abs() < 0.01);
    }

    #[test]
    fn one_channel_alone_shows_on_its_level_and_in_the_spectrum() {
        let tone = sine(1000.0, 0.5, 48_000);
        let silence = vec![0.0; tone.len()];
        let band = band_of(1000.0);

        let left = measure(&interleave(&tone, &silence));
        assert!(left.peak[0] > -7.0 && is_floor(left.peak[1]));
        assert!(is_floor(left.rms[1]));
        assert!(left.bands[band] > -8.0);

        let right = measure(&interleave(&silence, &tone));
        assert!(right.peak[1] > -7.0 && is_floor(right.peak[0]));
        assert!(right.bands[band] > -8.0);
    }

    #[test]
    fn mono_is_not_louder_than_one_channel_and_an_inverted_pair_does_not_cancel() {
        let tone = sine(1000.0, 0.5, 48_000);
        let silence = vec![0.0; tone.len()];
        let inverted: Vec<f64> = tone.iter().map(|x| -x).collect();
        let band = band_of(1000.0);

        let one = measure(&interleave(&tone, &silence)).bands[band];
        let mono = measure(&interleave(&tone, &tone)).bands[band];
        let pair = measure(&interleave(&tone, &inverted)).bands[band];
        assert!((mono - one).abs() < 0.1, "mono {mono} vs one channel {one}");
        assert!((pair - one).abs() < 0.1, "inverted pair {pair} vs {one}");
    }

    #[test]
    fn frames_come_at_the_frame_rate_whatever_the_chunking() {
        let samples = vec![0.1_f32; 2 * 48_000];
        let mut analyzer = Analyzer::new(RATE);
        let mut frames = 0;
        for chunk in samples.chunks(2 * 37) {
            analyzer.process(chunk, &mut |_| frames += 1);
        }
        assert_eq!(frames, 60);
    }

    #[test]
    fn a_frame_serializes_to_the_json_the_renderer_reads() {
        let mut frame = MeterFrame::silent();
        frame.bands[0] = -12.5;
        frame.peak[1] = -3.0;
        frame.rms[0] = -20.0;
        frame.clip = [false, true];
        let json = serde_json::to_value(&frame).unwrap();
        assert_eq!(json["bands"].as_array().unwrap().len(), BAND_COUNT);
        assert_eq!(json["bands"][0], -12.5);
        assert_eq!(json["peak"], serde_json::json!([-90.0, -3.0]));
        assert_eq!(json["rms"][0], -20.0);
        assert_eq!(json["clip"], serde_json::json!([false, true]));
    }

    // --- held back ---

    fn level(db: f32) -> MeterFrame {
        MeterFrame {
            bands: vec![db; BAND_COUNT],
            peak: [db; 2],
            rms: [db; 2],
            clip: [false; 2],
        }
    }

    #[test]
    fn nothing_is_sent_while_silent_and_unchanged() {
        let mut last_sent_silent = true;
        assert!(held_back(&MeterFrame::silent(), &mut last_sent_silent));
        assert!(!held_back(&level(-20.0), &mut last_sent_silent));
        // The drop to silence is sent once, then nothing again.
        assert!(!held_back(&MeterFrame::silent(), &mut last_sent_silent));
        assert!(held_back(&MeterFrame::silent(), &mut last_sent_silent));
    }

    // --- tap and Meter ---

    #[test]
    fn a_full_ring_drops_samples_and_returns() {
        let meter = Meter::new();
        let mut tap = meter.tap(RATE, 2);
        meter.set_running(true);
        let burst = vec![0.25_f32; RING_SAMPLES];
        tap.push(&burst);
        assert_eq!(tap.vacant(), 0);
        tap.push(&burst);
        assert_eq!(
            tap.vacant(),
            0,
            "the full ring stays full, and the push returns"
        );
    }

    #[test]
    fn mono_is_duplicated_and_extra_channels_are_skipped() {
        let meter = Meter::new();
        let mut mono = meter.tap(RATE, 1);
        meter.set_running(true);
        mono.push(&[0.1, 0.2]);
        let mut source = meter.shared.source.lock().take().unwrap();
        let mut out = [0.0; 4];
        assert_eq!(source.consumer.pop_slice(&mut out), 4);
        assert_eq!(out, [0.1, 0.1, 0.2, 0.2]);

        let mut surround = meter.tap(RATE, 6);
        // Chunks that end mid-frame must not shift the channels.
        surround.push(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        surround.push(&[6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0]);
        let mut source = meter.shared.source.lock().take().unwrap();
        let mut out = [0.0; 4];
        assert_eq!(source.consumer.pop_slice(&mut out), 4);
        assert_eq!(out, [1.0, 2.0, 7.0, 8.0]);
    }

    #[test]
    fn nothing_is_copied_while_the_meter_does_not_run() {
        let meter = Meter::new();
        let mut tap = meter.tap(RATE, 2);
        tap.push(&[0.5; 64]);
        assert_eq!(tap.vacant(), RING_SAMPLES, "nothing was copied");
    }

    #[test]
    fn a_running_meter_sends_frames_to_its_callback_and_a_paused_one_sends_none() {
        let meter = Meter::new();
        let mut tap = meter.tap(RATE, 2);
        let (sender, receiver) = mpsc::channel();
        meter.start(Box::new(move |frame| {
            sender.send(frame.clone()).ok();
        }));
        meter.set_running(true);

        // One tone is six frames: all of it is measured once six frames arrive.
        let tone = sine(1000.0, 0.5, 4_800);
        tap.push(&interleave(&tone, &tone));
        for _ in 0..6 {
            let frame = receiver
                .recv_timeout(Duration::from_secs(5))
                .expect("a frame arrives");
            assert!(frame.peak[0] > -7.0);
        }

        meter.set_running(false);
        tap.push(&interleave(&tone, &tone));
        thread::sleep(Duration::from_millis(100));
        assert!(receiver.try_recv().is_err(), "a paused meter sends nothing");

        meter.set_running(true);
        tap.push(&interleave(&tone, &tone));
        assert!(receiver.recv_timeout(Duration::from_secs(5)).is_ok());
    }

    #[test]
    fn a_second_start_replaces_the_callback() {
        let meter = Meter::new();
        let mut tap = meter.tap(RATE, 2);
        let (first_sender, first) = mpsc::channel();
        let (second_sender, second) = mpsc::channel();
        meter.start(Box::new(move |frame| {
            first_sender.send(frame.clone()).ok();
        }));
        meter.start(Box::new(move |frame| {
            second_sender.send(frame.clone()).ok();
        }));
        meter.set_running(true);

        let tone = sine(1000.0, 0.5, 4_800);
        tap.push(&interleave(&tone, &tone));
        assert!(second.recv_timeout(Duration::from_secs(5)).is_ok());
        assert!(
            first.try_recv().is_err(),
            "the replaced callback hears nothing"
        );
    }
}
