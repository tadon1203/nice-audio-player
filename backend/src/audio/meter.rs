//! Meter frames: the Spectrum and Level meter measured from the audio leaving the app (ADR 0012).
//!
//! The output callback copies what it wrote into a lock-free ring through a [`MeterTap`] and never
//! waits. While a subscriber exists, an analysis thread reads the ring and feeds an [`Analyzer`],
//! which produces one [`MeterFrame`] per ~8 ms and hands it to the subscriber's sink. With no
//! subscriber nothing is copied and nothing is analysed.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};

/// One-third-octave bands, base 10, centred on `1000 Hz * 10^(n/10)` for n = -16..=13 (25 Hz to
/// 20 kHz).
pub const BAND_COUNT: usize = 30;
/// Levels never go below this, in dBFS.
pub const FLOOR_DB: f32 = -90.0;
/// Frames per second the analysis produces.
pub const FRAMES_PER_SECOND: u32 = 120;
/// Size of an encoded frame: 30 band levels, peak L/R, RMS L/R (f32), then a u32 of flags. All
/// little endian.
pub const FRAME_BYTES: usize = (BAND_COUNT + 4 + 1) * 4;
/// Set in the flags word when a sample reached full scale in the frame.
pub const FLAG_FULL_SCALE: u32 = 1;

/// Stereo samples the ring holds: a quarter second at 48 kHz.
const RING_SAMPLES: usize = 24_000;
const IDLE_SLEEP: Duration = Duration::from_millis(2);

/// One measurement of the output. Levels are dBFS in `FLOOR_DB..=0`-ish (a band can read above 0
/// only for a signal beyond full scale). A band level is the amplitude of the sine that would
/// give that band energy, so a full-scale sine reads 0; left and right are combined per band as
/// the louder of the two ("Max LR"), so mono is not 6 dB louder and an inverted pair does not
/// cancel. Peak and RMS are per channel; RMS is of the samples as they are, so a full-scale sine
/// reads -3 dBFS.
#[derive(Debug, Clone, PartialEq)]
pub struct MeterFrame {
    pub bands: [f32; BAND_COUNT],
    pub peak: [f32; 2],
    pub rms: [f32; 2],
    pub full_scale: bool,
}

impl MeterFrame {
    pub fn silent() -> Self {
        Self {
            bands: [FLOOR_DB; BAND_COUNT],
            peak: [FLOOR_DB; 2],
            rms: [FLOOR_DB; 2],
            full_scale: false,
        }
    }

    /// The wire form sent to the renderer; see [`FRAME_BYTES`].
    pub fn to_bytes(&self) -> [u8; FRAME_BYTES] {
        let mut bytes = [0_u8; FRAME_BYTES];
        let floats = self
            .bands
            .iter()
            .chain(&self.peak)
            .chain(&self.rms)
            .copied();
        for (slot, value) in bytes.as_chunks_mut::<4>().0.iter_mut().zip(floats) {
            *slot = value.to_le_bytes();
        }
        let flags = if self.full_scale { FLAG_FULL_SCALE } else { 0 };
        bytes[FRAME_BYTES - 4..].copy_from_slice(&flags.to_le_bytes());
        bytes
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
            ((1.0 + cos) / 2.0, -(1.0 + cos), (1.0 + cos) / 2.0)
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
    let root = ((r + re) / 2.0).max(0.0).sqrt();
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
                (pole.0 + sign * root.0) / 2.0,
                (pole.1 + sign * root.1) / 2.0,
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

/// Turns interleaved stereo samples into Meter frames, one per `sample_rate / 120` frames of
/// audio, whatever the chunking of the input.
pub struct Analyzer {
    /// `bands[channel][band]`; a band the sample rate cannot carry is `None` and reads the floor.
    bands: [Vec<Option<Band>>; 2],
    frame_len: usize,
    filled: usize,
    energy: [[f64; BAND_COUNT]; 2],
    sum_squares: [f64; 2],
    peak: [f32; 2],
}

impl Analyzer {
    pub fn new(sample_rate: u32) -> Self {
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
    pub fn process(&mut self, samples: &[f32], emit: &mut impl FnMut(MeterFrame)) {
        for pair in samples.as_chunks::<2>().0 {
            for (channel, &sample) in pair.iter().enumerate() {
                let sample = if sample.is_finite() { sample } else { 0.0 };
                self.peak[channel] = self.peak[channel].max(sample.abs());
                let x = f64::from(sample);
                self.sum_squares[channel] += x * x;
                for (band, energy) in self.bands[channel]
                    .iter_mut()
                    .zip(&mut self.energy[channel])
                {
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
        for (band, level) in frame.bands.iter_mut().enumerate() {
            let louder = self.energy[0][band].max(self.energy[1][band]);
            // A sine of amplitude A has mean square A^2 / 2.
            *level = to_db(2.0 * louder / len);
        }
        for channel in 0..2 {
            frame.peak[channel] = to_db(f64::from(self.peak[channel]).powi(2));
            frame.rms[channel] = to_db(self.sum_squares[channel] / len);
        }
        frame.full_scale = self.peak.iter().any(|peak| *peak >= 1.0);
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

// --- The tap and the hub --------------------------------------------------------------------

struct Source {
    consumer: HeapCons<f32>,
    sample_rate: u32,
}

struct Shared {
    /// The id of the live subscription, 0 for none. The callback reads it to skip its copy.
    active: Arc<AtomicU32>,
    /// The newest stream's ring, waiting for the analysis thread (or parked here while there is
    /// none).
    source: Mutex<Option<Source>>,
    session: Mutex<Option<Session>>,
    next_id: AtomicU32,
}

struct Session {
    id: u32,
    thread: JoinHandle<()>,
}

/// Where Meter frames go. Returns `false` when nobody is listening any more, which ends the
/// subscription.
pub type FrameSink = Box<dyn FnMut(&MeterFrame) -> bool + Send>;

/// Hands out taps for output streams and runs the one subscription at a time.
#[derive(Clone)]
pub struct MeterHub {
    shared: Arc<Shared>,
}

impl Default for MeterHub {
    fn default() -> Self {
        Self::new()
    }
}

impl MeterHub {
    pub fn new() -> Self {
        Self {
            shared: Arc::new(Shared {
                active: Arc::new(AtomicU32::new(0)),
                source: Mutex::new(None),
                session: Mutex::new(None),
                next_id: AtomicU32::new(1),
            }),
        }
    }

    /// A tap for a stream playing at `sample_rate`. Not for the output callback: it allocates.
    /// The stream's ring replaces the previous stream's.
    pub(crate) fn tap(&self, sample_rate: u32, channel_count: usize) -> MeterTap {
        let (producer, consumer) = HeapRb::<f32>::new(RING_SAMPLES).split();
        *lock(&self.shared.source) = Some(Source {
            consumer,
            sample_rate,
        });
        MeterTap {
            producer,
            active: Arc::clone(&self.shared.active),
            channel_count: channel_count.max(1),
            phase: 0,
            left: 0.0,
            dropped: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Starts measuring and sending frames to `sink`, replacing any earlier subscription. Returns
    /// its id. Joins the replaced analysis thread, which ends within a few milliseconds.
    pub fn subscribe(&self, sink: FrameSink) -> u32 {
        let mut session = lock(&self.shared.session);
        self.stop(&mut session, None);
        // What the callback copied while nobody listened (a stream built since) is old.
        if let Some(source) = lock(&self.shared.source).as_mut() {
            source.consumer.clear();
        }
        let id = self.shared.next_id.fetch_add(1, Ordering::Relaxed);
        let shared = Arc::clone(&self.shared);
        self.shared.active.store(id, Ordering::Release);
        let thread = thread::Builder::new()
            .name("meter-analysis".into())
            .spawn(move || run_analysis(&shared, id, sink));
        match thread {
            Ok(thread) => *session = Some(Session { id, thread }),
            Err(_) => self.shared.active.store(0, Ordering::Release),
        }
        id
    }

    /// Ends subscription `id`; a stale id (already replaced or ended) changes nothing. Joins the
    /// analysis thread, so it can wait a few milliseconds.
    pub fn unsubscribe(&self, id: u32) {
        let mut session = lock(&self.shared.session);
        self.stop(&mut session, Some(id));
    }

    /// Ends whatever subscription there is, for a renderer that went away without saying so.
    pub fn unsubscribe_all(&self) {
        let mut session = lock(&self.shared.session);
        self.stop(&mut session, None);
    }

    /// Whether anything is being measured.
    pub fn is_active(&self) -> bool {
        self.shared.active.load(Ordering::Acquire) != 0
    }

    fn stop(&self, session: &mut Option<Session>, only: Option<u32>) {
        if only.is_some_and(|id| session.as_ref().map(|s| s.id) != Some(id)) {
            return;
        }
        if let Some(old) = session.take() {
            let _ =
                self.shared
                    .active
                    .compare_exchange(old.id, 0, Ordering::AcqRel, Ordering::Acquire);
            let _ = old.thread.join();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn run_analysis(shared: &Shared, id: u32, mut sink: FrameSink) {
    let mut current: Option<(Source, Analyzer)> = None;
    let mut buffer = [0.0_f32; 2048];
    let mut open = true;
    while open && shared.active.load(Ordering::Acquire) == id {
        if let Some(fresh) = lock(&shared.source).take() {
            let analyzer = Analyzer::new(fresh.sample_rate);
            current = Some((fresh, analyzer));
        }
        let Some((source, analyzer)) = &mut current else {
            thread::sleep(IDLE_SLEEP);
            continue;
        };
        let read = source.consumer.pop_slice(&mut buffer);
        if read == 0 {
            thread::sleep(IDLE_SLEEP);
            continue;
        }
        analyzer.process(&buffer[..read], &mut |frame| {
            if open && !sink(&frame) {
                open = false;
            }
        });
    }
    // Park the ring for the next subscription, unless a newer stream already brought its own.
    if let Some((source, _)) = current {
        let mut slot = lock(&shared.source);
        if slot.is_none() {
            *slot = Some(source);
        }
    }
    let _ = shared
        .active
        .compare_exchange(id, 0, Ordering::AcqRel, Ordering::Acquire);
}

/// The output callback's end of the ring. Copies stereo samples while a subscriber exists and
/// drops them when the ring is full; it never waits, allocates, locks or analyses.
pub(crate) struct MeterTap {
    producer: HeapProd<f32>,
    active: Arc<AtomicU32>,
    channel_count: usize,
    /// Position within the interleaved frame being copied; chunks may end mid-frame.
    phase: usize,
    left: f32,
    dropped: Arc<AtomicU64>,
}

impl MeterTap {
    /// Copies `samples`, interleaved with the stream's channel count: mono is duplicated, and
    /// channels after the first two are skipped.
    pub(crate) fn push(&mut self, samples: &[f32]) {
        if self.active.load(Ordering::Relaxed) == 0 {
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
                if self.producer.push_slice(&pair) < pair.len() {
                    self.dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
    }

    #[cfg(test)]
    fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
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
    fn silence_gives_the_floor_everywhere() {
        let frame = measure(&vec![0.0; 2 * 4_800]);
        assert_eq!(frame, MeterFrame::silent());
        assert!(!frame.full_scale);
    }

    #[test]
    fn full_scale_gives_0_dbfs_and_the_flag() {
        let mut samples = vec![0.0_f32; 2 * 800];
        samples[10] = 1.0;
        let mut analyzer = Analyzer::new(RATE);
        let mut first = None;
        analyzer.process(&samples, &mut |frame| {
            first.get_or_insert(frame);
        });
        let frame = first.unwrap();
        assert_eq!(frame.peak, [0.0, FLOOR_DB]);
        assert!(frame.full_scale);
        let quiet = measure(&interleave(
            &sine(1000.0, 0.5, 4_800),
            &sine(1000.0, 0.5, 4_800),
        ));
        assert!(!quiet.full_scale);
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
        assert!(left.peak[0] > -7.0 && left.peak[1] == FLOOR_DB);
        assert!(left.rms[1] == FLOOR_DB);
        assert!(left.bands[band] > -8.0);

        let right = measure(&interleave(&silence, &tone));
        assert!(right.peak[1] > -7.0 && right.peak[0] == FLOOR_DB);
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
        assert_eq!(frames, 120);
    }

    #[test]
    fn a_band_the_sample_rate_cannot_carry_reads_the_floor() {
        let mut analyzer = Analyzer::new(22_050);
        let mut last = None;
        analyzer.process(&vec![0.5; 2 * 2_205], &mut |frame| last = Some(frame));
        assert_eq!(last.unwrap().bands[BAND_COUNT - 1], FLOOR_DB);
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
    fn a_frame_encodes_to_its_wire_layout() {
        let mut frame = MeterFrame::silent();
        frame.bands[0] = -12.5;
        frame.peak[1] = -3.0;
        frame.rms[0] = -20.0;
        frame.full_scale = true;
        let bytes = frame.to_bytes();
        let float =
            |index: usize| f32::from_le_bytes(bytes[index * 4..index * 4 + 4].try_into().unwrap());
        assert_eq!(bytes.len(), FRAME_BYTES);
        assert_eq!(float(0), -12.5);
        assert_eq!(float(BAND_COUNT + 1), -3.0);
        assert_eq!(float(BAND_COUNT + 2), -20.0);
        assert_eq!(
            u32::from_le_bytes(bytes[FRAME_BYTES - 4..].try_into().unwrap()),
            FLAG_FULL_SCALE
        );
    }

    // --- tap and hub ---

    #[test]
    fn a_full_ring_drops_samples_and_returns() {
        let hub = MeterHub::new();
        let mut tap = hub.tap(RATE, 2);
        hub.shared.active.store(1, Ordering::Release);
        let burst = vec![0.25_f32; RING_SAMPLES];
        tap.push(&burst);
        assert_eq!(tap.vacant(), 0);
        assert_eq!(tap.dropped(), 0);
        tap.push(&burst);
        assert_eq!(tap.dropped(), (RING_SAMPLES / 2) as u64);
    }

    #[test]
    fn mono_is_duplicated_and_extra_channels_are_skipped() {
        let hub = MeterHub::new();
        let mut mono = hub.tap(RATE, 1);
        hub.shared.active.store(1, Ordering::Release);
        mono.push(&[0.1, 0.2]);
        let mut source = lock(&hub.shared.source).take().unwrap();
        let mut out = [0.0; 4];
        assert_eq!(source.consumer.pop_slice(&mut out), 4);
        assert_eq!(out, [0.1, 0.1, 0.2, 0.2]);

        let mut surround = hub.tap(RATE, 6);
        // Chunks that end mid-frame must not shift the channels.
        surround.push(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        surround.push(&[6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0]);
        let mut source = lock(&hub.shared.source).take().unwrap();
        let mut out = [0.0; 4];
        assert_eq!(source.consumer.pop_slice(&mut out), 4);
        assert_eq!(out, [1.0, 2.0, 7.0, 8.0]);
    }

    #[test]
    fn with_no_subscriber_nothing_is_copied_and_nothing_runs() {
        let hub = MeterHub::new();
        let mut tap = hub.tap(RATE, 2);
        tap.push(&[0.5; 64]);
        assert_eq!(tap.vacant(), RING_SAMPLES, "nothing was copied");
        assert!(!hub.is_active());
        assert!(lock(&hub.shared.session).is_none(), "no analysis thread");
    }

    #[test]
    fn a_subscriber_gets_frames_until_it_unsubscribes() {
        let hub = MeterHub::new();
        let mut tap = hub.tap(RATE, 2);
        let (sender, receiver) = mpsc::channel();
        let id = hub.subscribe(Box::new(move |frame| sender.send(frame.clone()).is_ok()));
        assert!(hub.is_active());

        let tone = sine(1000.0, 0.5, 4_800);
        tap.push(&interleave(&tone, &tone));
        let frame = receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("a frame arrives");
        assert!(frame.peak[0] > -7.0);

        hub.unsubscribe(id);
        assert!(!hub.is_active());
        let vacant = tap.vacant();
        tap.push(&[0.5; 64]);
        assert_eq!(tap.vacant(), vacant, "nothing is copied once unsubscribed");
    }

    #[test]
    fn a_closed_sink_ends_the_subscription() {
        let hub = MeterHub::new();
        let mut tap = hub.tap(RATE, 2);
        let (sender, receiver) = mpsc::channel::<MeterFrame>();
        drop(receiver);
        hub.subscribe(Box::new(move |frame| sender.send(frame.clone()).is_ok()));
        let tone = sine(1000.0, 0.5, 4_800);
        tap.push(&interleave(&tone, &tone));
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while hub.is_active() && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert!(!hub.is_active());
    }

    #[test]
    fn a_new_subscription_replaces_the_old_and_a_stale_unsubscribe_is_ignored() {
        let hub = MeterHub::new();
        let _tap = hub.tap(RATE, 2);
        let first = hub.subscribe(Box::new(|_| true));
        let second = hub.subscribe(Box::new(|_| true));
        assert_ne!(first, second);
        hub.unsubscribe(first);
        assert!(hub.is_active(), "the newer subscription survives");
        hub.unsubscribe(second);
        assert!(!hub.is_active());
    }
}
