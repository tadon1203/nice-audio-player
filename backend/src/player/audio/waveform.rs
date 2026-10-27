//! Waveform overview for the dock seek bar: the RMS level per bucket, computed in one pass off the
//! playback path and cached on disk by the library's content hash, so moving or renaming a file
//! keeps its waveform.
//!
//! The waveform appears when its analysis finishes. Analysis runs at background priority. The
//! loaded track goes first; the track that plays next waits behind it and cancels nothing.
//!
//! The cache key is the library's content hash of the file. A track the library has not hashed is
//! analyzed each time it loads and not cached.

use parking_lot::{Condvar, Mutex};
use std::fs::File;
use std::io::Write;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::{Arc, mpsc::Sender};
use std::thread;

use serde::Serialize;

use super::decode::{CompressedAudioSource, DecodeError, DecodeStep};
use crate::errors::contain;
use crate::ids::PlaybackId;
use crate::library::read::playback::PlayableTrack;
use crate::library::sync::media::ValidatedAudioFile;
use crate::messages::{self, BackendMessage};
use crate::threads::{Cancellation, run_in_background};

pub(crate) const WAVEFORM_BUCKETS: usize = 1000;
const CHUNK_FRAMES: usize = 2048;
/// The first bytes of every cache file. A file that starts with other bytes is an older format.
const CACHE_MAGIC: &[u8; 5] = b"NAWF1";
const CACHE_EXTENSION: &str = "wf";

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackWaveform {
    /// The playback the waveform belongs to, so a late answer cannot be drawn for another track.
    pub playback_id: PlaybackId,
    pub rms: Vec<u8>,
}

#[derive(Debug, Clone, Copy, Default)]
struct ChunkStats {
    square_sum: f64,
    samples: u64,
}

/// Accumulates the square sums of fixed-size chunks over interleaved samples.
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

    fn push(&mut self, samples: &[f32]) {
        let mut rest = samples;
        while !rest.is_empty() {
            let room = (self.chunk_samples - self.current.samples) as usize;
            let (part, tail) = rest.split_at(room.min(rest.len()));
            for sample in part {
                self.current.square_sum += f64::from(*sample) * f64::from(*sample);
            }
            self.current.samples += part.len() as u64;
            rest = tail;
            if self.current.samples >= self.chunk_samples {
                self.chunks.push(std::mem::take(&mut self.current));
            }
        }
    }

    fn finish(mut self) -> Vec<ChunkStats> {
        if self.current.samples > 0 {
            self.chunks.push(self.current);
        }
        self.chunks
    }
}

/// Decodes the whole file in one pass and reduces it to at most [`WAVEFORM_BUCKETS`] RMS buckets.
fn analyze(file: &ValidatedAudioFile, cancellation: &Cancellation) -> Result<Vec<u8>, DecodeError> {
    let mut decoder = CompressedAudioSource::open(file, cancellation)?.decoder()?;
    let mut chunker = Chunker::new(usize::from(decoder.spec().channel_count().get()));
    let mut packet = Vec::new();
    loop {
        if cancellation.is_cancelled() {
            return Err(DecodeError::Cancelled);
        }
        if decoder.decode_next(&mut packet)? == DecodeStep::EndOfStream {
            break;
        }
        chunker.push(&packet);
    }
    let chunks = chunker.finish();
    if chunks.is_empty() {
        return Err(DecodeError::EmptyAudioStream);
    }
    Ok(reduce(&chunks))
}

fn reduce(chunks: &[ChunkStats]) -> Vec<u8> {
    let buckets = chunks.len().min(WAVEFORM_BUCKETS);
    (0..buckets)
        .map(|bucket| {
            let start = bucket * chunks.len() / buckets;
            let end = ((bucket + 1) * chunks.len() / buckets).max(start + 1);
            let (square_sum, samples) = chunks[start..end]
                .iter()
                .fold((0.0_f64, 0_u64), |(sum, count), chunk| {
                    (sum + chunk.square_sum, count + chunk.samples)
                });
            let mean_square = if samples == 0 {
                0.0
            } else {
                square_sum / samples as f64
            };
            quantize(mean_square.sqrt() as f32)
        })
        .collect()
}

fn quantize(value: f32) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn cache_path(directory: &Path, hash: &str) -> PathBuf {
    directory.join(format!("{hash}.{CACHE_EXTENSION}"))
}

fn encode(rms: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(CACHE_MAGIC.len() + 2 + rms.len());
    bytes.extend_from_slice(CACHE_MAGIC);
    bytes.extend_from_slice(&(rms.len() as u16).to_le_bytes());
    bytes.extend_from_slice(rms);
    bytes
}

fn decode(bytes: &[u8]) -> Option<Vec<u8>> {
    let body = bytes.strip_prefix(CACHE_MAGIC)?;
    let (count_bytes, rms) = body.split_first_chunk::<2>()?;
    let count = usize::from(u16::from_le_bytes(*count_bytes));
    (count > 0 && rms.len() == count).then(|| rms.to_vec())
}

/// The cached waveform of `hash`, or `None`. A file that does not decode is in an older format
/// or damaged: it is deleted, and the file is analyzed again.
fn read_cache(directory: &Path, hash: &str) -> Option<Vec<u8>> {
    let path = cache_path(directory, hash);
    let bytes = std::fs::read(&path).ok()?;
    let rms = decode(&bytes);
    if rms.is_none()
        && let Err(cause) = std::fs::remove_file(&path)
        && cause.kind() != std::io::ErrorKind::NotFound
    {
        log::debug!("waveform.cache_remove_failed cause={cause}");
    }
    rms
}

fn write_cache(directory: &Path, hash: &str, rms: &[u8]) -> std::io::Result<()> {
    std::fs::create_dir_all(directory)?;
    let path = cache_path(directory, hash);
    let temporary = path.with_extension("tmp");
    File::create(&temporary)?.write_all(&encode(rms))?;
    std::fs::rename(temporary, path)
}

/// A file to analyze and the library's content hash for it, when the library has one.
struct Request {
    file: ValidatedAudioFile,
    hash: Option<String>,
}

/// The one lock of the waveform work: the loaded Playback, the requests, and the job in flight.
#[derive(Default)]
struct Slots {
    /// The loaded Playback and its file. Its waveform is the Waveform topic. It is kept under this
    /// lock, so a waveform that finishes late cannot replace the one of a newer Playback.
    playback: Option<(PlaybackId, ValidatedAudioFile)>,
    /// The loaded track, when it has no cached waveform. It is analyzed first.
    current: Option<Request>,
    /// The track that plays next. It is analyzed when there is no `current`.
    next: Option<Request>,
    /// The job in flight: its file and its cancellation.
    running: Option<(PathBuf, Cancellation)>,
    closed: bool,
}

struct Shared {
    directory: PathBuf,
    slots: Mutex<Slots>,
    wake: Condvar,
    /// The waveform on show, as last sent to the Host.
    shown: Mutex<Option<PlaybackWaveform>>,
    messages: Sender<BackendMessage>,
}

impl Shared {
    /// Blocks until there is a request, and returns it with the cancellation for its job.
    fn next_job(&self) -> Option<(Request, Cancellation)> {
        let mut slots = self.slots.lock();
        loop {
            if slots.closed {
                return None;
            }
            if let Some(request) = slots.current.take().or_else(|| slots.next.take()) {
                let cancellation = Cancellation::default();
                slots.running = Some((request.file.path.clone(), cancellation.clone()));
                return Some((request, cancellation));
            }
            self.wake.wait(&mut slots);
        }
    }

    /// Reads the cached waveform, or analyzes the file and caches it. A track without a hash is
    /// analyzed and not cached.
    fn process(&self, file: &ValidatedAudioFile, hash: Option<&str>, cancellation: &Cancellation) {
        if let Some(rms) = hash.and_then(|hash| read_cache(&self.directory, hash)) {
            self.publish(&file.path, rms);
            return;
        }
        let rms = match analyze(file, cancellation) {
            Ok(rms) => rms,
            Err(DecodeError::Cancelled) => return,
            Err(error) => {
                log::warn!("waveform.analysis_failed error={error:?}");
                return;
            }
        };
        if let Some(hash) = hash
            && write_cache(&self.directory, hash, &rms).is_err()
        {
            log::warn!("waveform.cache_write_failed");
        }
        self.publish(&file.path, rms);
    }

    /// Shows the waveform when it is the file of the loaded Playback.
    fn publish(&self, path: &Path, rms: Vec<u8>) {
        let slots = self.slots.lock();
        if let Some((playback_id, file)) = &slots.playback
            && file.path == path
        {
            self.show(Some(PlaybackWaveform {
                playback_id: *playback_id,
                rms,
            }));
        }
    }

    /// Sends the waveform on show when it differs from the one last sent. The lock is held while
    /// sending, so the Host receives the waveforms in the order they were shown.
    fn show(&self, waveform: Option<PlaybackWaveform>) {
        let mut shown = self.shown.lock();
        if *shown == waveform {
            return;
        }
        shown.clone_from(&waveform);
        messages::send(&self.messages, BackendMessage::Waveform(waveform));
    }
}

/// Background waveform analysis, and the Waveform topic. One worker thread; the loaded track is
/// the only request that cancels work.
pub(crate) struct Waveforms {
    shared: Arc<Shared>,
}

impl Waveforms {
    /// Starts the analysis thread. The Waveform starts with no waveform on show, and that is sent first.
    pub(crate) fn start(directory: PathBuf, messages: Sender<BackendMessage>) -> Self {
        messages::send(&messages, BackendMessage::Waveform(None));
        let shared = Arc::new(Shared {
            directory,
            slots: Mutex::new(Slots::default()),
            wake: Condvar::new(),
            shown: Mutex::new(None),
            messages,
        });
        let worker = Arc::clone(&shared);
        if let Err(cause) = thread::Builder::new()
            .name("waveform".into())
            .spawn(move || {
                run_in_background();
                while let Some((request, cancellation)) = worker.next_job() {
                    // A file that panics the analysis gets no waveform; the worker lives on.
                    if let Err(cause) = contain(
                        "waveform.process",
                        AssertUnwindSafe(|| {
                            worker.process(&request.file, request.hash.as_deref(), &cancellation);
                        }),
                    ) {
                        log::debug!("waveform.process cause={cause}");
                    }
                    worker.slots.lock().running = None;
                }
            })
        {
            log::debug!("audio.waveform.thread_failed cause={cause}");
        }
        Self { shared }
    }

    /// A track was loaded as the Playback `playback_id`. Its cached waveform is published at once,
    /// and `None` otherwise; then it is analyzed, and published when it is ready. Another file's
    /// analysis in flight is cancelled.
    pub(crate) fn loaded(&self, playback_id: PlaybackId, track: &PlayableTrack) {
        let cached = track
            .content_hash
            .as_deref()
            .and_then(|hash| read_cache(&self.shared.directory, hash));
        let missing = cached.is_none();
        let mut slots = self.shared.slots.lock();
        slots.playback = Some((playback_id, track.file.clone()));
        self.shared
            .show(cached.map(|rms| PlaybackWaveform { playback_id, rms }));
        if let Some((path, cancellation)) = &slots.running
            && *path != track.file.path
        {
            cancellation.cancel();
        }
        let in_flight = slots.running.as_ref().is_some_and(|(path, cancellation)| {
            *path == track.file.path && !cancellation.is_cancelled()
        });
        if missing && !in_flight {
            slots.current = Some(Request {
                file: track.file.clone(),
                hash: track.content_hash.clone(),
            });
            self.shared.wake.notify_one();
        }
    }

    /// The track that plays next. It waits behind the track on screen and cancels nothing.
    pub(crate) fn upcoming(&self, track: &PlayableTrack) {
        let mut slots = self.shared.slots.lock();
        slots.next = Some(Request {
            file: track.file.clone(),
            hash: track.content_hash.clone(),
        });
        self.shared.wake.notify_one();
    }
}

impl Drop for Waveforms {
    fn drop(&mut self) {
        let mut slots = self.shared.slots.lock();
        slots.closed = true;
        if let Some((_, cancellation)) = &slots.running {
            cancellation.cancel();
        }
        drop(slots);
        self.shared.wake.notify_one();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::TrackId;
    use crate::library::sync::media::validate_audio_file;
    use crate::library::sync::scan::hash_file_content;
    use crate::messages::BackendMessage;
    use crate::test_support::bare_track;
    use crate::test_support::{MessageLog, TestDirectory, null_messages, write_pcm_i16_wav};
    use std::sync::mpsc::Sender;

    fn wav(directory: &TestDirectory, name: &str, samples: &[i16]) -> ValidatedAudioFile {
        let path = directory.file(name);
        write_pcm_i16_wav(&path, 8_000, 1, samples);
        validate_audio_file(&path).unwrap()
    }

    fn track_of(file: &ValidatedAudioFile, hash: Option<&str>) -> PlayableTrack {
        PlayableTrack {
            content_hash: hash.map(str::to_owned),
            ..bare_track(TrackId::try_from_rowid(1).unwrap(), file.clone())
        }
    }

    #[test]
    fn quiet_then_loud_reads_back_as_rising_buckets() {
        let directory = TestDirectory::new();
        let mut samples = vec![1_000i16; 8_000];
        samples.extend(vec![30_000i16; 8_000]);
        let file = wav(&directory, "ramp.wav", &samples);
        let rms = analyze(&file, &Cancellation::default()).unwrap();
        assert!(rms.len() <= WAVEFORM_BUCKETS);
        let last = rms.len() - 1;
        assert!(rms[0] < 20);
        assert!(rms[last] > 200);
    }

    #[test]
    fn a_constant_level_reads_back_as_its_rms_in_every_bucket() {
        let directory = TestDirectory::new();
        // Half of full scale: 0.5 * 255 = 127.5, which rounds to 128.
        let file = wav(&directory, "half.wav", &vec![16_384i16; 16_000]);
        let rms = analyze(&file, &Cancellation::default()).unwrap();
        // 16 000 frames in chunks of 2 048 frames: eight buckets.
        assert_eq!(rms.len(), 8);
        assert!(rms.iter().all(|&level| level == 128), "{rms:?}");
    }

    #[test]
    fn cache_round_trips_and_rejects_other_formats() {
        let rms = vec![0, 1, 2];
        assert_eq!(decode(&encode(&rms)), Some(rms));
        assert_eq!(decode(b"NAPW2\x03\x00\x01\x02\x03"), None);
        assert_eq!(decode(b"NAWF1\x03\x00\x01"), None);
        assert_eq!(decode(b"nope"), None);
    }

    #[test]
    fn a_stale_cache_file_is_deleted_when_read_and_analyzed_again() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let hash = "ab".repeat(32);
        let cache = directory.file("cache");
        std::fs::create_dir_all(&cache).unwrap();
        let stale = cache_path(&cache, &hash);
        std::fs::write(&stale, b"NAPW2\x03\x00\x01\x02\x03").unwrap();

        assert_eq!(read_cache(&cache, &hash), None);
        assert!(!stale.exists());

        let shared = idle_shared(&directory);
        shared.process(&file, Some(&hash), &Cancellation::default());
        assert!(read_cache(&cache, &hash).is_some());
    }

    #[test]
    fn a_stored_library_hash_is_the_cache_key_and_a_cached_waveform_shows_at_once() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let hash = "ab".repeat(32);
        write_cache(&directory.file("cache"), &hash, &[7, 8, 9]).unwrap();
        let (service, _) = idle_waveforms(&directory);

        service.loaded(PlaybackId::first(), &track_of(&file, Some(&hash)));

        assert_eq!(
            shown(&service),
            Some(PlaybackWaveform {
                playback_id: PlaybackId::first(),
                rms: vec![7, 8, 9],
            })
        );
    }

    #[test]
    fn a_track_without_a_hash_is_analyzed_and_not_cached() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let shared = idle_shared(&directory);

        shared.process(&file, None, &Cancellation::default());

        assert!(!directory.file("cache").exists());
    }

    #[test]
    fn upcoming_waits_behind_the_loaded_track_and_cancels_nothing() {
        let directory = TestDirectory::new();
        let current = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let next = wav(&directory, "b.wav", &[100, 200, 300, 400]);
        let loaded = wav(&directory, "c.wav", &[100, 200, 300, 400]);
        let (service, _) = idle_waveforms(&directory);
        service.loaded(PlaybackId::first(), &track_of(&current, None));
        let (_, in_flight) = service.shared.next_job().unwrap();

        service.upcoming(&track_of(&next, None));
        assert!(!in_flight.is_cancelled());
        assert_eq!(
            service.shared.slots.lock().next.as_ref().unwrap().file.path,
            next.path
        );

        // A newly loaded track cancels the job of the file before it, and goes first.
        service.loaded(PlaybackId::first(), &track_of(&loaded, None));
        assert!(in_flight.is_cancelled());
        let (job, _) = service.shared.next_job().unwrap();
        assert_eq!(job.file.path, loaded.path);
        assert_eq!(
            service.shared.slots.lock().next.as_ref().unwrap().file.path,
            next.path
        );
    }

    #[test]
    fn a_publish_for_the_loaded_file_is_shown_and_one_for_another_file_is_not() {
        let directory = TestDirectory::new();
        let loaded = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let other = wav(&directory, "b.wav", &[100, 200, 300, 400]);
        let (service, host) = idle_waveforms(&directory);
        let playback_id = PlaybackId::first();
        service.loaded(playback_id, &track_of(&loaded, None));
        let announced = host.sent().len();

        service.shared.publish(Path::new(&other.path), vec![1]);
        assert_eq!(shown(&service), None);
        assert_eq!(host.sent().len(), announced);

        service.shared.publish(Path::new(&loaded.path), vec![2]);
        assert_eq!(
            shown(&service),
            Some(PlaybackWaveform {
                playback_id,
                rms: vec![2],
            })
        );
        assert_eq!(host.sent().len(), announced + 1);
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
            let file = validate_audio_file(&path).unwrap();
            let outcome = contain("test", || analyze(&file, &Cancellation::default()));
            assert!(outcome.is_ok(), "{path:?} panicked the analysis");
        }
    }

    #[test]
    fn service_publishes_the_waveform_and_caches_it() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "song.wav", &vec![5_000i16; 16_000]);
        let hash = hash_file_content(Path::new(&file.path)).unwrap();
        let (host, sender) = MessageLog::shared();
        let service = Waveforms::start(directory.file("cache"), sender);
        service.loaded(PlaybackId::first(), &track_of(&file, Some(&hash)));
        // Background priority: the worker yields to the rest of a busy test run.
        assert!(
            host.wait_for(|message| matches!(message, BackendMessage::Waveform(Some(_)))),
            "the waveform is sent once it is analyzed"
        );
        assert!(shown(&service).is_some());
        assert!(read_cache(&directory.file("cache"), &hash).is_some());
    }

    /// The waveform on show.
    fn shown(service: &Waveforms) -> Option<PlaybackWaveform> {
        service.shared.shown.lock().clone()
    }

    fn idle_shared_with(directory: &TestDirectory, messages: Sender<BackendMessage>) -> Shared {
        Shared {
            directory: directory.file("cache"),
            slots: Mutex::new(Slots::default()),
            wake: Condvar::new(),
            shown: Mutex::new(None),
            messages,
        }
    }

    fn idle_shared(directory: &TestDirectory) -> Shared {
        idle_shared_with(directory, null_messages())
    }

    fn idle_waveforms(directory: &TestDirectory) -> (Waveforms, Arc<MessageLog>) {
        let (host, sender) = MessageLog::shared();
        let shared = idle_shared_with(directory, sender);
        (
            Waveforms {
                shared: Arc::new(shared),
            },
            host,
        )
    }

    #[test]
    fn loading_a_track_without_a_cached_waveform_changes_nothing() {
        let directory = TestDirectory::new();
        let file = wav(&directory, "a.wav", &[100, 200, 300, 400]);
        let (service, host) = idle_waveforms(&directory);

        service.loaded(PlaybackId::first(), &track_of(&file, None));

        // The waveform starts as none, and it still is none: nothing to send.
        assert_eq!(shown(&service), None);
        assert_eq!(host.sent(), []);
    }
}
