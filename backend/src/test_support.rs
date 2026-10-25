//! Test doubles and fixtures shared by the Backend's tests.

use std::fs::{File, create_dir_all, remove_dir_all};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;

use crate::messages::{Notification, Notifier, StateTopic};
use crate::settings::Settings;
use crate::state_store::StateStore;

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

/// Remembers every notification, in the order it was sent.
pub(crate) struct NotificationLog {
    receiver: Mutex<Receiver<Notification>>,
    received: Mutex<Vec<Notification>>,
}

impl NotificationLog {
    pub(crate) fn shared() -> (Arc<Self>, Notifier) {
        let (notifier, receiver) = Notifier::channel();
        let log = Arc::new(Self {
            receiver: Mutex::new(receiver),
            received: Mutex::new(Vec::new()),
        });
        (log, notifier)
    }

    pub(crate) fn sent(&self) -> Vec<Notification> {
        let mut received = self.received.lock();
        received.extend(self.receiver.lock().try_iter());
        received.clone()
    }

    /// The topics that changed, in the order they changed.
    pub(crate) fn state_topics(&self) -> Vec<StateTopic> {
        self.sent()
            .into_iter()
            .filter_map(|notification| match notification {
                Notification::StateChanged(topic) => Some(topic),
                _ => None,
            })
            .collect()
    }
}

/// A notifier that nobody receives from.
pub(crate) fn null_notifier() -> Notifier {
    Notifier::channel().0
}

/// A state store over the default settings, notifying through `notifier`, for tests that build a
/// service directly.
pub(crate) fn state_store_for_tests(notifier: Notifier) -> Arc<StateStore> {
    Arc::new(StateStore::new(&Settings::default(), notifier))
}
