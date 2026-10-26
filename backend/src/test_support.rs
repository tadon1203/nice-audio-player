//! Test doubles and fixtures shared by the Backend's tests.

use std::fs::{File, create_dir_all, remove_dir_all};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;

use crate::ids::TrackId;
use crate::library::media::ValidatedAudioFile;
use crate::library::models::{LibraryState, TrackCore, TrackSummary};
use crate::library::tracks::PlayableTrack;
use crate::messages::BackendMessage;
use crate::player::{PlayerState, QueueState};

/// A track that is only an id, the file's name as its title, and the file.
pub(crate) fn bare_track(id: TrackId, file: ValidatedAudioFile) -> PlayableTrack {
    PlayableTrack {
        track: TrackSummary {
            core: TrackCore {
                id,
                title: file.file_name.clone(),
                artist: None,
                duration_ms: None,
                artwork: None,
            },
            album: None,
            track_number: None,
            disc_number: None,
            year: None,
        },
        file,
        file_format: None,
        bit_depth: None,
        bitrate_kbps: None,
        content_hash: None,
    }
}

static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

pub(crate) struct TestDirectory(PathBuf);

impl TestDirectory {
    pub(crate) fn new() -> Self {
        let id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time must be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nice-audio-player-audio-{timestamp}-{id}"));
        create_dir_all(&path).expect("test directory must be created");
        Self(path)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.0
    }

    pub(crate) fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        drop(remove_dir_all(&self.0));
    }
}

pub(crate) fn write_pcm_i16_wav(
    path: &Path,
    sample_rate: u32,
    channels: u16,
    interleaved_samples: &[i16],
) {
    assert!(channels > 0, "WAV channel count must be positive");
    assert_eq!(
        interleaved_samples.len() % usize::from(channels),
        0,
        "WAV samples must be interleaved by channel count"
    );

    let bits_per_sample = 16u16;
    let block_align = channels
        .checked_mul(bits_per_sample / 8)
        .expect("WAV block alignment must fit");
    let data_size = interleaved_samples
        .len()
        .checked_mul(usize::from(bits_per_sample / 8))
        .and_then(|size| u32::try_from(size).ok())
        .expect("WAV data size must fit");
    let riff_size = 36u32.checked_add(data_size).expect("WAV size must fit");
    let byte_rate = sample_rate
        .checked_mul(u32::from(block_align))
        .expect("WAV byte rate must fit");

    let mut file = File::create(path).expect("WAV must be created");
    file.write_all(b"RIFF").unwrap();
    file.write_all(&riff_size.to_le_bytes()).unwrap();
    file.write_all(b"WAVEfmt ").unwrap();
    file.write_all(&16u32.to_le_bytes()).unwrap();
    file.write_all(&1u16.to_le_bytes()).unwrap();
    file.write_all(&channels.to_le_bytes()).unwrap();
    file.write_all(&sample_rate.to_le_bytes()).unwrap();
    file.write_all(&byte_rate.to_le_bytes()).unwrap();
    file.write_all(&block_align.to_le_bytes()).unwrap();
    file.write_all(&bits_per_sample.to_le_bytes()).unwrap();
    file.write_all(b"data").unwrap();
    file.write_all(&data_size.to_le_bytes()).unwrap();
    for sample in interleaved_samples {
        file.write_all(&sample.to_le_bytes()).unwrap();
    }
}

/// Polls `condition` until it holds or `timeout` passes. Returns whether it held.
pub(crate) fn wait_until(mut condition: impl FnMut() -> bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    condition()
}

/// Remembers every message the Backend sends, in the order it was sent.
pub(crate) struct MessageLog {
    receiver: Mutex<Receiver<BackendMessage>>,
    received: Mutex<Vec<BackendMessage>>,
}

impl MessageLog {
    /// A log, and the sender the Backend's services send to.
    pub(crate) fn shared() -> (Arc<Self>, Sender<BackendMessage>) {
        let (sender, receiver) = mpsc::channel();
        let log = Arc::new(Self {
            receiver: Mutex::new(receiver),
            received: Mutex::new(Vec::new()),
        });
        (log, sender)
    }

    /// Every message sent so far, in order.
    pub(crate) fn sent(&self) -> Vec<BackendMessage> {
        let mut received = self.received.lock();
        received.extend(self.receiver.lock().try_iter());
        received.clone()
    }

    /// The newest Player state sent so far.
    pub(crate) fn player(&self) -> Option<PlayerState> {
        self.latest(|message| match message {
            BackendMessage::Player(state) => Some((**state).clone()),
            _ => None,
        })
    }

    /// The newest Queue state sent so far.
    pub(crate) fn queue(&self) -> Option<QueueState> {
        self.latest(|message| match message {
            BackendMessage::Queue(state) => Some(state.clone()),
            _ => None,
        })
    }

    /// The newest Library state sent so far.
    pub(crate) fn library(&self) -> Option<LibraryState> {
        self.latest(|message| match message {
            BackendMessage::Library(state) => Some(state.clone()),
            _ => None,
        })
    }

    /// The newest message that `pick` takes a value from.
    pub(crate) fn latest<T>(&self, pick: impl Fn(&BackendMessage) -> Option<T>) -> Option<T> {
        self.sent().iter().rev().find_map(pick)
    }

    /// Waits until a message satisfies `done`. Returns whether one did.
    pub(crate) fn wait_for(&self, done: impl Fn(&BackendMessage) -> bool) -> bool {
        wait_until(|| self.sent().iter().any(&done), WAIT)
    }
}

/// How long a test waits for a message before it fails.
const WAIT: Duration = Duration::from_secs(30);

/// A sender whose receiver is gone: messages sent to it are dropped.
pub(crate) fn null_messages() -> Sender<BackendMessage> {
    mpsc::channel().0
}
