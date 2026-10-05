//! Waveform overview for the dock seek bar: peak and RMS per bucket, computed off the playback
//! path and cached on disk by the library's file identity hash, so moving or renaming a file keeps
//! its waveform.
//!
//! A long file that is not cached yet is shown in two steps: a quick sampled approximation, then
//! the exact waveform, decoded in parallel segments and written to the cache. Analysis runs at
//! background priority, and the next track's analysis starts when its prefetch does.
//!
//! The cache key is the library's identity hash of the file; the hash is computed here only for a
//! file the library has not stored one for.

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::cancellation::Cancellation;
use super::decoding::{open_analysis_decoder, DecodeStep, PcmDecodeError, SeekStep};
use crate::containment::contain;
use crate::events::{BackendEvent, SharedEventSink};
use crate::library::scanner::identity::content_hash;
use crate::library::store::PlayableTrack;
use crate::media::validation::ValidatedAudioFile;

pub const WAVEFORM_BUCKETS: usize = 1000;
const CHUNK_FRAMES: usize = 2048;
const CACHE_MAGIC: &[u8; 5] = b"NAPW2";
const MEMORY_ENTRIES: usize = 16;
/// Segments shorter than this are not worth another decoder and seek.
const MIN_SEGMENT_CHUNKS: usize = 256;
/// Shorter files are decoded exactly right away; sampling them would save nothing.
const MIN_SAMPLED_SECONDS: u64 = 30;
const SAMPLE_BUDGET: Duration = Duration::from_millis(1_500);
/// Analysis never takes more threads than this.
const MAX_ANALYSIS_THREADS: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Waveform {
    pub peaks: Vec<u8>,
    pub rms: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackWaveform {
    /// The playback the waveform belongs to, so a late answer cannot be drawn for another track.
    pub playback_id: String,
    pub peaks: Vec<u8>,
    pub rms: Vec<u8>,
}

#[derive(Debug, Clone, Copy, Default)]
struct ChunkStats {
    peak: f32,
    square_sum: f64,
    samples: u64,
}

/// Accumulates per-chunk peak and square sums over interleaved samples.
struct Chunker {
    chunk_samples: u64,
    current: ChunkStats,
    chunks: Vec<ChunkStats>,
}

impl Chunker {
    fn new(channels: usize) -> Self {
        Self {
            chunk_samples: (CHUNK_FRAMES * channels) as u64,
            current: ChunkStats::default(),
            chunks: Vec::new(),
        }
    }

    /// Returns true once `limit` chunks are complete; the rest of `samples` is then ignored.
    fn push(&mut self, samples: &[f32], limit: Option<usize>) -> bool {
        let mut rest = samples;
        while !rest.is_empty() {
            let room = (self.chunk_samples - self.current.samples) as usize;
            let (part, tail) = rest.split_at(room.min(rest.len()));
            for sample in part {
                let magnitude = sample.abs();
                self.current.peak = self.current.peak.max(magnitude);
                self.current.square_sum += f64::from(magnitude) * f64::from(magnitude);
            }
            self.current.samples += part.len() as u64;
            rest = tail;
            if self.current.samples >= self.chunk_samples {
                self.chunks.push(std::mem::take(&mut self.current));
                if limit.is_some_and(|limit| self.chunks.len() >= limit) {
                    return true;
                }
            }
        }
        false
    }

    fn finish(mut self) -> Vec<ChunkStats> {
        if self.current.samples > 0 {
            self.chunks.push(self.current);
        }
        self.chunks
    }
}

/// Decodes from `start_chunk` for at most `limit` chunks, or to the end of the file when `limit`
/// is `None`.
fn analyze_range(
    file: &ValidatedAudioFile,
    cancellation: &Cancellation,
    start_chunk: usize,
    limit: Option<usize>,
) -> Result<Vec<ChunkStats>, PcmDecodeError> {
    let mut decoder = open_analysis_decoder(file)?;
    let mut chunker = Chunker::new(usize::from(decoder.spec().channel_count().get()));
    if start_chunk > 0 {
        match decoder.seek_to_frame((start_chunk * CHUNK_FRAMES) as u64)? {
            SeekStep::EndOfStream => return Ok(Vec::new()),
            SeekStep::Samples(seek) => {
                if chunker.push(&seek.first_packet, limit) {
                    return Ok(chunker.chunks);
                }
            }
        }
    }
    let mut packet = Vec::new();
    loop {
        if cancellation.is_cancelled() {
            return Err(PcmDecodeError::Cancelled);
        }
        if decoder.decode_next(&mut packet)? == DecodeStep::EndOfStream {
            return Ok(chunker.finish());
        }
        if chunker.push(&packet, limit) {
            return Ok(chunker.chunks);
        }
    }
}

/// Decodes the whole file and reduces it to at most [`WAVEFORM_BUCKETS`] peak/RMS buckets.
/// Long files are split into segments decoded on `threads` threads; the result is identical to
/// a single-threaded pass.
pub fn analyze(
    file: &ValidatedAudioFile,
    cancellation: &Cancellation,
    threads: usize,
) -> Result<Waveform, PcmDecodeError> {
    let chunks = match analyze_parallel(file, cancellation, threads) {
        Some(Ok(chunks)) => chunks,
        Some(Err(PcmDecodeError::Cancelled)) => return Err(PcmDecodeError::Cancelled),
        // Not splittable (unknown length, failed seek, ...): decode it in one pass.
        Some(Err(_)) | None => analyze_range(file, cancellation, 0, None)?,
    };
    if chunks.is_empty() {
        return Err(PcmDecodeError::EmptyAudioStream);
    }
    Ok(reduce(&chunks))
}

fn analyze_parallel(
    file: &ValidatedAudioFile,
    cancellation: &Cancellation,
    threads: usize,
) -> Option<Result<Vec<ChunkStats>, PcmDecodeError>> {
    if threads <= 1 {
        return None;
    }
    let (total_frames, _) = stream_frames(file)?;
    let total_chunks = (total_frames as usize).div_ceil(CHUNK_FRAMES);
    let segments = threads.min(total_chunks / MIN_SEGMENT_CHUNKS);
    if segments <= 1 {
        return None;
    }
    let per_segment = total_chunks / segments;
    let results: Vec<_> = thread::scope(|scope| {
        let handles: Vec<_> = (0..segments)
            .map(|index| {
                let limit = (index + 1 < segments).then_some(per_segment);
                thread::Builder::new()
                    .name("waveform".into())
                    .spawn_scoped(scope, move || {
                        run_in_background();
                        analyze_range(file, cancellation, index * per_segment, limit)
                    })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| match handle {
                Ok(handle) => handle.join().unwrap_or(Err(PcmDecodeError::DecodeFailed)),
                Err(_) => Err(PcmDecodeError::DecodeFailed),
            })
            .collect()
    });
    let mut chunks = Vec::with_capacity(total_chunks);
    for (index, result) in results.into_iter().enumerate() {
        let segment = match result {
            Ok(segment) => segment,
            Err(error) => return Some(Err(error)),
        };
        // A short middle segment means the length estimate or a seek was off; do not stitch it.
        if index + 1 < segments && segment.len() != per_segment {
            return Some(Err(PcmDecodeError::SeekFailed));
        }
        chunks.extend(segment);
    }
    Some(Ok(chunks))
}

/// Estimated total frames and the sample rate, when the container states a length.
fn stream_frames(file: &ValidatedAudioFile) -> Option<(u64, u32)> {
    let decoder = open_analysis_decoder(file).ok()?;
    let rate = decoder.spec().sample_rate().get();
    let duration_ms = decoder.duration_ms()?;
    Some((duration_ms.saturating_mul(u64::from(rate)) / 1_000, rate))
}

/// A quick approximation: one packet decoded at the middle of each bucket. It reads a small part
/// of the file, so the dock can show a waveform while the exact analysis is still running.
pub fn sample(
    file: &ValidatedAudioFile,
    cancellation: &Cancellation,
    budget: Duration,
) -> Result<Waveform, PcmDecodeError> {
    let mut decoder = open_analysis_decoder(file)?;
    let rate = u64::from(decoder.spec().sample_rate().get());
    let total_frames = decoder
        .duration_ms()
        .ok_or(PcmDecodeError::SeekFailed)?
        .saturating_mul(rate)
        / 1_000;
    if total_frames < rate * MIN_SAMPLED_SECONDS {
        return Err(PcmDecodeError::SeekFailed);
    }
    let started = Instant::now();
    let buckets = WAVEFORM_BUCKETS as u64;
    let mut peaks = Vec::with_capacity(WAVEFORM_BUCKETS);
    let mut rms = Vec::with_capacity(WAVEFORM_BUCKETS);
    for bucket in 0..buckets {
        if cancellation.is_cancelled() || started.elapsed() > budget {
            return Err(PcmDecodeError::Cancelled);
        }
        let target = (2 * bucket + 1) * total_frames / (2 * buckets);
        let (peak, mean_square) = match decoder.seek_to_frame(target)? {
            SeekStep::EndOfStream => (0.0, 0.0),
            SeekStep::Samples(seek) => {
                let samples = &seek.first_packet;
                let peak = samples
                    .iter()
                    .fold(0.0f32, |peak, value| peak.max(value.abs()));
                let square_sum: f64 = samples
                    .iter()
                    .map(|value| f64::from(*value) * f64::from(*value))
                    .sum();
                (peak, square_sum / samples.len().max(1) as f64)
            }
        };
        peaks.push(quantize(peak));
        rms.push(quantize(mean_square.sqrt() as f32));
    }
    Ok(Waveform { peaks, rms })
}

fn reduce(chunks: &[ChunkStats]) -> Waveform {
    let buckets = chunks.len().min(WAVEFORM_BUCKETS);
    let mut peaks = Vec::with_capacity(buckets);
    let mut rms = Vec::with_capacity(buckets);
    for bucket in 0..buckets {
        let start = bucket * chunks.len() / buckets;
        let end = ((bucket + 1) * chunks.len() / buckets).max(start + 1);
        let mut peak = 0.0f32;
        let mut square_sum = 0.0f64;
        let mut samples = 0u64;
        for chunk in &chunks[start..end] {
            peak = peak.max(chunk.peak);
            square_sum += chunk.square_sum;
            samples += chunk.samples;
        }
        let mean_square = if samples == 0 {
            0.0
        } else {
            square_sum / samples as f64
        };
        peaks.push(quantize(peak));
        rms.push(quantize(mean_square.sqrt() as f32));
    }
    Waveform { peaks, rms }
}

fn quantize(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

/// Lowers the calling thread to Windows background mode (low CPU, I/O and memory priority), so
/// analysis never competes with playback or other apps. It lasts for the life of the thread.
#[cfg(windows)]
fn run_in_background() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_MODE_BACKGROUND_BEGIN,
    };
    // SAFETY: the pseudo handle of the current thread is always valid.
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_MODE_BACKGROUND_BEGIN);
    }
}

#[cfg(not(windows))]
fn run_in_background() {}

/// Deletes cache files written under another format, silently; they are rebuilt on demand.
fn purge_stale_cache(directory: &Path) {
    let Ok(buckets) = std::fs::read_dir(directory) else {
        return;
    };
    for bucket in buckets.flatten() {
        let Ok(files) = std::fs::read_dir(bucket.path()) else {
            continue;
        };
        for entry in files.flatten() {
            let path = entry.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "napw")
                && !has_current_magic(&path)
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

fn has_current_magic(path: &Path) -> bool {
    use std::io::Read;
    let mut magic = [0u8; CACHE_MAGIC.len()];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .is_ok_and(|()| &magic == CACHE_MAGIC)
}

fn is_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn cache_path(directory: &Path, hash: &str) -> PathBuf {
    directory.join(&hash[..2]).join(format!("{hash}.napw"))
}

fn encode(waveform: &Waveform) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(7 + waveform.peaks.len() * 2);
    bytes.extend_from_slice(CACHE_MAGIC);
    bytes.extend_from_slice(&(waveform.peaks.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&waveform.peaks);
    bytes.extend_from_slice(&waveform.rms);
    bytes
}

fn decode(bytes: &[u8]) -> Option<Waveform> {
    let body = bytes.strip_prefix(CACHE_MAGIC)?;
    let count = usize::from(u16::from_le_bytes([*body.first()?, *body.get(1)?]));
    let data = &body[2..];
    if count == 0 || data.len() != count * 2 {
        return None;
    }
    Some(Waveform {
        peaks: data[..count].to_vec(),
        rms: data[count..].to_vec(),
    })
}

fn read_cache(directory: &Path, hash: &str) -> Option<Waveform> {
    decode(&std::fs::read(cache_path(directory, hash)).ok()?)
}

fn write_cache(directory: &Path, hash: &str, waveform: &Waveform) -> std::io::Result<()> {
    let path = cache_path(directory, hash);
    std::fs::create_dir_all(path.parent().expect("cache path has a parent"))?;
    let temporary = path.with_extension("tmp");
    File::create(&temporary)?.write_all(&encode(waveform))?;
    std::fs::rename(temporary, path)
}

/// Size and modification time: a file replaced at the same path must not show the old waveform.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileStamp {
    length: u64,
    modified: Option<std::time::SystemTime>,
}

fn file_stamp(path: &str) -> Option<FileStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    Some(FileStamp {
        length: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

/// The single slot of waveform work: the job in flight and at most one newer request behind it.
#[derive(Default)]
struct Jobs {
    running: Option<(String, Cancellation)>,
    pending: Option<Request>,
    closed: bool,
}

/// A file to analyze and the library's hash for it, when the library has one.
struct Request {
    file: ValidatedAudioFile,
    hash: Option<String>,
}

struct Shared {
    directory: PathBuf,
    ready: Mutex<HashMap<String, (FileStamp, Arc<Waveform>)>>,
    jobs: Mutex<Jobs>,
    wake: Condvar,
    events: SharedEventSink,
}

impl Shared {
    fn jobs(&self) -> MutexGuard<'_, Jobs> {
        self.jobs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Latest request wins: the job in flight is cancelled and an older queued request is dropped.
    fn request(&self, file: &ValidatedAudioFile, hash: Option<&str>) {
        let mut jobs = self.jobs();
        match &jobs.running {
            Some((path, cancellation)) if *path == file.path && !cancellation.is_cancelled() => {
                jobs.pending = None;
            }
            running => {
                if let Some((_, cancellation)) = running {
                    cancellation.cancel();
                }
                jobs.pending = Some(Request {
                    file: file.clone(),
                    hash: hash.map(str::to_owned),
                });
            }
        }
        self.wake.notify_one();
    }

    /// Asks for the analysis of the track that plays next. It waits behind the job in flight and
    /// behind a request for the track on screen, and cancels neither.
    fn request_ahead(&self, file: &ValidatedAudioFile, hash: Option<&str>) {
        let Some(stamp) = file_stamp(&file.path) else {
            return;
        };
        let ready = self
            .ready
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(&file.path)
            .is_some_and(|(remembered, _)| *remembered == stamp);
        let mut jobs = self.jobs();
        let in_flight = jobs
            .running
            .as_ref()
            .is_some_and(|(path, cancellation)| *path == file.path && !cancellation.is_cancelled());
        if ready || in_flight || jobs.pending.is_some() || jobs.closed {
            return;
        }
        jobs.pending = Some(Request {
            file: file.clone(),
            hash: hash.map(str::to_owned),
        });
        drop(jobs);
        self.wake.notify_one();
    }

    /// Blocks until there is a request, and returns it with the cancellation for its job.
    fn next_job(&self) -> Option<(Request, Cancellation)> {
        let mut jobs = self.jobs();
        loop {
            if jobs.closed {
                return None;
            }
            if let Some(request) = jobs.pending.take() {
                let cancellation = Cancellation::default();
                jobs.running = Some((request.file.path.clone(), cancellation.clone()));
                return Some((request, cancellation));
            }
            jobs = self.wake.wait(jobs).unwrap_or_else(PoisonError::into_inner);
        }
    }
}

/// Background waveform analysis. One worker thread; only the latest request is worth finishing.
pub struct WaveformService {
    shared: Arc<Shared>,
}

impl WaveformService {
    pub fn start(directory: PathBuf, events: SharedEventSink) -> Self {
        let cache_directory = directory.clone();
        let shared = Arc::new(Shared {
            directory,
            ready: Mutex::new(HashMap::new()),
            jobs: Mutex::new(Jobs::default()),
            wake: Condvar::new(),
            events,
        });
        let worker = Arc::clone(&shared);
        let _ = thread::Builder::new()
            .name("waveform".into())
            .spawn(move || {
                run_in_background();
                purge_stale_cache(&cache_directory);
                while let Some((request, cancellation)) = worker.next_job() {
                    // A file that panics the analysis gets no waveform; the worker lives on.
                    contain("waveform.process", || {
                        worker.process(&request.file, request.hash.as_deref(), &cancellation);
                    });
                    worker.jobs().running = None;
                }
            });
        Self { shared }
    }

    /// The waveform if it is ready. Never starts an analysis.
    pub fn get(&self, file: &ValidatedAudioFile) -> Option<Arc<Waveform>> {
        let stamp = file_stamp(&file.path)?;
        let ready = self
            .shared
            .ready
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let (remembered, waveform) = ready.get(&file.path)?;
        (*remembered == stamp).then(|| Arc::clone(waveform))
    }

    /// Returns the waveform if it is ready; otherwise requests analysis and returns `None`.
    pub fn get_or_queue(&self, track: &PlayableTrack) -> Option<Arc<Waveform>> {
        file_stamp(&track.file.path)?;
        let ready = self.get(&track.file);
        if ready.is_none() {
            self.shared
                .request(&track.file, track.content_hash.as_deref());
        }
        ready
    }

    /// What the playback worker calls when it starts opening the next track.
    pub fn prefetcher(&self) -> PrefetchObserver {
        let shared = Arc::clone(&self.shared);
        Arc::new(move |track| shared.request_ahead(&track.file, track.content_hash.as_deref()))
    }
}

/// Hears that a track is about to play next.
pub type PrefetchObserver = Arc<dyn Fn(&PlayableTrack) + Send + Sync>;

impl Drop for WaveformService {
    fn drop(&mut self) {
        let mut jobs = self.shared.jobs();
        jobs.closed = true;
        if let Some((_, cancellation)) = &jobs.running {
            cancellation.cancel();
        }
        drop(jobs);
        self.shared.wake.notify_one();
    }
}

impl Shared {
    /// Publishes a quick approximation first when the file is long and not cached, then the exact
    /// waveform, which is also written to the cache.
    fn process(
        &self,
        file: &ValidatedAudioFile,
        stored_hash: Option<&str>,
        cancellation: &Cancellation,
    ) {
        let Some(stamp) = file_stamp(&file.path) else {
            return;
        };
        let hash = match stored_hash {
            // The cache path is cut from the hash, so a malformed stored one is not trusted.
            Some(hash) if is_hash(hash) => hash.to_owned(),
            _ => match content_hash(Path::new(&file.path)) {
                Ok(hash) => hash,
                Err(_) => {
                    log::warn!("waveform.hash_failed");
                    return;
                }
            },
        };
        if let Some(cached) = read_cache(&self.directory, &hash) {
            self.publish(&file.path, stamp, cached);
            return;
        }
        if let Ok(sampled) = sample(file, cancellation, SAMPLE_BUDGET) {
            self.publish(&file.path, stamp, sampled);
        }
        let threads = thread::available_parallelism()
            .map_or(1, |cores| (cores.get() / 2).clamp(1, MAX_ANALYSIS_THREADS));
        let waveform = match analyze(file, cancellation, threads) {
            Ok(waveform) => waveform,
            Err(PcmDecodeError::Cancelled) => return,
            Err(error) => {
                log::warn!("waveform.analysis_failed error={error:?}");
                return;
            }
        };
        if write_cache(&self.directory, &hash, &waveform).is_err() {
            log::warn!("waveform.cache_write_failed");
        }
        self.publish(&file.path, stamp, waveform);
    }

    fn publish(&self, path: &str, stamp: FileStamp, waveform: Waveform) {
        self.remember(path, stamp, waveform);
        self.events.emit(BackendEvent::WaveformChanged);
    }

    fn remember(&self, path: &str, stamp: FileStamp, waveform: Waveform) {
        let mut ready = self.ready.lock().unwrap_or_else(PoisonError::into_inner);
        if ready.len() >= MEMORY_ENTRIES && !ready.contains_key(path) {
            ready.clear();
        }
        ready.insert(path.to_owned(), (stamp, Arc::new(waveform)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::validation::validate_audio_file;
    use crate::test_support::{write_pcm_i16_wav, TestDirectory};

    fn wav(directory: &TestDirectory, name: &str, samples: &[i16]) -> ValidatedAudioFile {
        let path = directory.file(name);
        write_pcm_i16_wav(&path, 8_000, 1, samples);
        validate_audio_file(path.to_str().unwrap()).unwrap()
    }

    fn track_of(file: &ValidatedAudioFile, hash: Option<&str>) -> PlayableTrack {
        PlayableTrack {
            track_id: "1".into(),
            title: file.file_name.clone(),
            file: file.clone(),
            artist: None,
            album: None,
            album_artist: None,
            artwork: None,
            duration_ms: None,
            track_number: None,
            disc_number: None,
            year: None,
            album_key: None,
            album_track_count: None,
            file_format: None,
            bit_depth: None,
            bitrate_kbps: None,
            content_hash: hash.map(str::to_owned),
        }
    }

    fn varying_wav(directory: &TestDirectory, seconds: usize) -> ValidatedAudioFile {
        let rate = 8_000usize;
        let samples: Vec<i16> = (0..rate * seconds)
            .map(|index| {
                let envelope =
                    4_000.0 + 20_000.0 * ((index as f64 / rate as f64) / 7.0).sin().abs();
                (envelope * (index as f64 * 0.05).sin()) as i16
            })
            .collect();
        let path = directory.file("varying.wav");
        write_pcm_i16_wav(&path, rate as u32, 1, &samples);
        validate_audio_file(path.to_str().unwrap()).unwrap()
    }

    #[test]
    fn quiet_then_loud_reads_back_as_rising_buckets() {
        let directory = TestDirectory::new();
        let mut samples = vec![1_000i16; 8_000];
        samples.extend(vec![30_000i16; 8_000]);
        let file = wav(&directory, "ramp.wav", &samples);
        let waveform = analyze(&file, &Cancellation::default(), 1).unwrap();
        assert_eq!(waveform.peaks.len(), waveform.rms.len());
        assert!(waveform.peaks.len() <= WAVEFORM_BUCKETS);
        let last = waveform.peaks.len() - 1;
        assert!(waveform.peaks[0] < 20);
        assert!(waveform.peaks[last] > 200);
        assert!(waveform.rms[last] > 200);
    }

    #[test]
    fn cache_round_trips_and_rejects_corruption() {
        let waveform = Waveform {
            peaks: vec![1, 2, 3],
            rms: vec![0, 1, 2],
        };
        assert_eq!(decode(&encode(&waveform)), Some(waveform));
        assert_eq!(decode(b"NAPW2\x03\x00\x01"), None);
        assert_eq!(decode(b"nope"), None);
    }

    #[test]
    fn old_cache_files_are_removed_silently_and_current_ones_kept() {
        let directory = TestDirectory::new();
        let cache = directory.file("cache");
        let old = cache.join("ab").join(format!("{}.napw", "a".repeat(64)));
        let current = cache.join("cd").join(format!("{}.napw", "c".repeat(64)));
        std::fs::create_dir_all(old.parent().unwrap()).unwrap();
        std::fs::create_dir_all(current.parent().unwrap()).unwrap();
        std::fs::write(&old, b"NAPW1\x01\x00\x01\x02").unwrap();
        std::fs::write(
            &current,
            encode(&Waveform {
                peaks: vec![1],
                rms: vec![2],
            }),
        )
        .unwrap();

        purge_stale_cache(&cache);

        assert!(!old.exists());
        assert!(current.exists());
    }

    #[test]
    fn a_stored_library_hash_is_the_cache_key() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let stored = "ab".repeat(32);
        let marker = Waveform {
            peaks: vec![7, 8, 9],
            rms: vec![1, 2, 3],
        };
        write_cache(&directory.file("cache"), &stored, &marker).unwrap();
        let shared = idle_shared(&directory);

        shared.process(&file, Some(&stored), &Cancellation::default());

        let ready = shared.ready.lock().unwrap();
        assert_eq!(*ready.get(&file.path).unwrap().1, marker);
    }

    #[test]
    fn a_missing_hash_is_computed_the_way_the_library_computes_it() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let shared = idle_shared(&directory);

        shared.process(&file, None, &Cancellation::default());

        let hash = content_hash(Path::new(&file.path)).unwrap();
        assert!(read_cache(&directory.file("cache"), &hash).is_some());
    }

    #[test]
    fn prefetch_queues_behind_without_cancelling_anything() {
        let directory = TestDirectory::new();
        let current = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let next = wav(&directory, "b.wav", &[100, 200, 300, 400]);
        let after = wav(&directory, "c.wav", &[100, 200, 300, 400]);
        let shared = idle_shared(&directory);
        shared.request(&current, None);
        let (_, in_flight) = shared.next_job().unwrap();

        shared.request_ahead(&next, None);
        assert!(!in_flight.is_cancelled());
        assert_eq!(shared.jobs().pending.as_ref().unwrap().file.path, next.path);

        // A request for the track on screen still wins over a prefetch, and a prefetch never
        // replaces a request that is already waiting.
        shared.request(&after, None);
        assert!(in_flight.is_cancelled());
        shared.request_ahead(&next, None);
        assert_eq!(
            shared.jobs().pending.as_ref().unwrap().file.path,
            after.path
        );
    }

    #[test]
    fn parallel_analysis_matches_a_single_pass_exactly() {
        let directory = TestDirectory::new();
        let file = varying_wav(&directory, 400);
        let cancellation = Cancellation::default();
        let serial = analyze(&file, &cancellation, 1).unwrap();
        let parallel = analyze(&file, &cancellation, 4).unwrap();
        assert_eq!(serial, parallel);
        assert!(serial.peaks.len() > 100);
    }

    #[test]
    fn sampled_waveform_stays_close_to_the_exact_one() {
        let directory = TestDirectory::new();
        let file = varying_wav(&directory, 240);
        let cancellation = Cancellation::default();
        let exact = analyze(&file, &cancellation, 1).unwrap();
        let sampled = sample(&file, &cancellation, Duration::from_secs(10)).unwrap();
        assert_eq!(sampled.peaks.len(), WAVEFORM_BUCKETS);
        // Compare on the exact waveform's bucket grid, as the dock's bars merge buckets anyway.
        let mut worst = 0u8;
        for (index, exact_peak) in exact.peaks.iter().enumerate() {
            let sampled_peak = sampled.peaks[index * sampled.peaks.len() / exact.peaks.len()];
            worst = worst.max(exact_peak.abs_diff(sampled_peak));
        }
        // 24px bar: 255 levels is about 10 levels per pixel; allow about 4px on this signal.
        assert!(worst < 40, "worst peak difference {worst}");
    }

    #[test]
    fn short_files_are_not_sampled() {
        let directory = TestDirectory::new();
        let file = varying_wav(&directory, 10);
        assert!(sample(&file, &Cancellation::default(), Duration::from_secs(1)).is_err());
    }

    #[test]
    fn service_publishes_the_exact_waveform_and_caches_it() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let (recorder, sink) = crate::events::testing::RecordingEventSink::shared();
        let service = WaveformService::start(directory.file("cache"), sink);
        let track = track_of(&file, None);
        assert!(service.get_or_queue(&track).is_none());
        // Background priority: the worker yields to the rest of a busy test run.
        let deadline = Instant::now() + Duration::from_secs(60);
        while recorder.events().is_empty() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            recorder.events().first(),
            Some(&BackendEvent::WaveformChanged)
        );
        assert!(service.get_or_queue(&track).is_some());
        let hash = content_hash(Path::new(&file.path)).unwrap();
        assert!(read_cache(&directory.file("cache"), &hash).is_some());
    }

    fn idle_shared(directory: &TestDirectory) -> Shared {
        let (_, sink) = crate::events::testing::RecordingEventSink::shared();
        Shared {
            directory: directory.file("cache"),
            ready: Mutex::new(HashMap::new()),
            jobs: Mutex::new(Jobs::default()),
            wake: Condvar::new(),
            events: sink,
        }
    }

    #[test]
    fn peeking_never_starts_an_analysis() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let (_, sink) = crate::events::testing::RecordingEventSink::shared();
        let service = WaveformService::start(directory.file("cache"), sink);
        assert!(service.get(&file).is_none());
        assert!(service.shared.jobs().pending.is_none());
        assert!(service.shared.jobs().running.is_none());
    }

    #[test]
    fn skipping_through_tracks_leaves_only_the_latest_request() {
        let directory = TestDirectory::new();
        let files: Vec<_> = (0..5)
            .map(|index| wav(&directory, &format!("{index}.wav"), &[100, 200, 300, 400]))
            .collect();
        let shared = idle_shared(&directory);
        for file in &files {
            shared.request(file, None);
        }
        let (latest, _) = shared.next_job().unwrap();
        assert_eq!(latest.file.path, files[4].path);
        assert!(shared.jobs().pending.is_none());
    }

    #[test]
    fn a_new_request_cancels_the_job_in_flight() {
        let directory = TestDirectory::new();
        let first = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let second = wav(&directory, "b.wav", &[100, 200, 300, 400]);
        let shared = idle_shared(&directory);
        shared.request(&first, None);
        let (_, in_flight) = shared.next_job().unwrap();
        shared.request(&first, None);
        assert!(!in_flight.is_cancelled());
        shared.request(&second, None);
        assert!(in_flight.is_cancelled());
        let (next, _) = shared.next_job().unwrap();
        assert_eq!(next.file.path, second.path);
    }

    #[test]
    fn a_file_replaced_at_the_same_path_is_analyzed_again() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let (recorder, sink) = crate::events::testing::RecordingEventSink::shared();
        let service = WaveformService::start(directory.file("cache"), sink);
        let track = track_of(&file, None);
        assert!(service.get_or_queue(&track).is_none());
        let deadline = Instant::now() + Duration::from_secs(60);
        while recorder.events().is_empty() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(service.get_or_queue(&track).is_some());

        write_pcm_i16_wav(Path::new(&file.path), 8_000, 1, &vec![9_000i16; 24_000]);
        assert!(service.get_or_queue(&track).is_none());
    }

    #[test]
    fn a_truncated_or_garbage_file_fails_its_analysis_without_a_panic() {
        let directory = TestDirectory::new();
        let whole = wav(&directory, "whole.wav", &vec![500i16; 16_000]);
        let bytes = std::fs::read(&whole.path).unwrap();
        let truncated = directory.file("truncated.wav");
        std::fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();
        let garbage = directory.file("garbage.wav");
        std::fs::write(&garbage, vec![0x5Au8; 2_048]).unwrap();

        for path in [truncated, garbage] {
            let file = validate_audio_file(path.to_str().unwrap()).unwrap();
            let outcome = contain("test", || analyze(&file, &Cancellation::default(), 1));
            assert!(outcome.is_some(), "{path:?} panicked the analysis");
        }
    }
}
