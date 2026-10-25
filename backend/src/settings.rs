//! Persistent user settings: one JSON file in the application data directory.
//!
//! The file is independent of the library database, so settings survive a database that is
//! unavailable. Writes are debounced on a background thread and replace the file atomically.
//! The file must match its shape: a damaged or older file is logged and replaced by defaults,
//! and the next change overwrites it.
//!
//! The file holds the appearance the renderer edits and the playback preferences the playback
//! worker records. The appearance is published through the state store; nothing else sees the
//! file's shape.

use parking_lot::Mutex;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        mpsc::{self, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use log::{error, warn};
use serde::{Deserialize, Serialize};

use crate::audio::playback::PlaybackPreferences;
use crate::messages::Versioned;
use crate::state_store::StateStore;

const FILE_NAME: &str = "settings.json";
const WRITE_DEBOUNCE: Duration = Duration::from_millis(400);

/// What the renderer reads and writes. Every field is always present, so the renderer declares
/// no defaults of its own.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Appearance {
    /// Artwork glow behind the library and Now Playing.
    pub artwork_backdrop: bool,
    /// Only what marks the position moves by itself: nothing breathes or lifts on its own.
    pub calm_motion: bool,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            artwork_backdrop: true,
            calm_motion: false,
        }
    }
}

/// A partial update from the renderer; absent fields stay as they are.
#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppearancePatch {
    pub artwork_backdrop: Option<bool>,
    pub calm_motion: Option<bool>,
}

/// Everything saved in the settings file. Strict: an unknown field, or a missing section, makes
/// the whole file unusable.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SettingsFile {
    pub(crate) appearance: Appearance,
    pub(crate) playback: PlaybackPreferences,
}

/// The settings file in `directory`.
pub(crate) fn file_path(directory: &Path) -> PathBuf {
    directory.join(FILE_NAME)
}

/// The settings saved at `path`, or defaults when there is no file or the file is unusable.
pub(crate) fn read(path: &Path) -> SettingsFile {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|error| {
            warn!("settings.file_unusable error={error}");
            SettingsFile::default()
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => SettingsFile::default(),
        Err(error) => {
            warn!("settings.read_failed error={error}");
            SettingsFile::default()
        }
    }
}

pub(crate) struct SettingsStore {
    state: Mutex<State>,
    state_store: Arc<StateStore>,
}

struct State {
    file: SettingsFile,
    /// The writer thread, until `shutdown` takes it. It lives under the same lock as the file, so
    /// changes reach it in the order they were made.
    writer: Option<Writer>,
}

struct Writer {
    sender: Sender<SettingsFile>,
    thread: JoinHandle<()>,
}

impl SettingsStore {
    /// Starts the writer for the settings file at `path`. `file` is what `read` found there, and
    /// the appearance in `state_store` must already be that appearance.
    pub(crate) fn open(path: PathBuf, file: SettingsFile, state_store: Arc<StateStore>) -> Self {
        let (sender, receiver) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("settings-writer".into())
            .spawn(move || write_loop(&receiver, &path))
            .expect("the settings writer thread must start");
        Self {
            state: Mutex::new(State {
                file,
                writer: Some(Writer { sender, thread }),
            }),
            state_store,
        }
    }

    /// Applies a renderer update, publishes the appearance when something changed, and returns
    /// the appearance as it is afterwards, with its version.
    pub(crate) fn update_appearance(&self, patch: &AppearancePatch) -> Versioned<Appearance> {
        self.modify(|file| {
            if let Some(value) = patch.artwork_backdrop {
                file.appearance.artwork_backdrop = value;
            }
            if let Some(value) = patch.calm_motion {
                file.appearance.calm_motion = value;
            }
        })
    }

    /// The playback preferences the next start of the playback worker begins with.
    pub(crate) fn playback_preferences(&self) -> PlaybackPreferences {
        self.state.lock().file.playback.clone()
    }

    /// Remembers the playback preferences. They are persisted but not published: the playback
    /// state already tells the renderer.
    pub(crate) fn record_playback(&self, preferences: PlaybackPreferences) {
        self.modify(|file| file.playback = preferences);
    }

    /// Applies `change` under the lock and publishes the appearance. A change is queued for the
    /// writer while the lock is still held, so the writer sees the changes in the order they were
    /// made.
    fn modify(&self, change: impl FnOnce(&mut SettingsFile)) -> Versioned<Appearance> {
        let mut state = self.state.lock();
        let before = state.file.clone();
        change(&mut state.file);
        let version = self
            .state_store
            .set_appearance(state.file.appearance.clone());
        if state.file != before
            && let Some(writer) = &state.writer
            && let Err(cause) = writer.sender.send(state.file.clone())
        {
            log::debug!("settings.writer_send_failed cause={cause}");
        }
        Versioned {
            version,
            value: state.file.appearance.clone(),
        }
    }

    /// Writes any pending change and stops the writer thread.
    pub(crate) fn shutdown(&self) {
        let writer = self.state.lock().writer.take();
        if let Some(Writer { sender, thread }) = writer {
            drop(sender);
            if thread.join().is_err() {
                error!("settings.writer_panicked");
            }
        }
    }
}

impl Drop for SettingsStore {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn write(path: &Path, file: &SettingsFile) -> std::io::Result<()> {
    let temporary = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(file).map_err(std::io::Error::other)?;
    fs::write(&temporary, text)?;
    fs::rename(&temporary, path)
}

/// Collapses bursts of changes (a volume drag) into one write of the latest settings.
fn write_loop(receiver: &mpsc::Receiver<SettingsFile>, path: &Path) {
    let mut pending: Option<SettingsFile> = None;
    loop {
        let next = if pending.is_some() {
            receiver.recv_timeout(WRITE_DEBOUNCE)
        } else {
            receiver.recv().map_err(|cause| {
                // Closing the channel is how a normal shutdown ends the writer, so it is `debug`.
                log::debug!("settings.writer_closed cause={cause}");
                RecvTimeoutError::Disconnected
            })
        };
        match next {
            Ok(file) => pending = Some(file),
            Err(RecvTimeoutError::Timeout) => flush(path, &mut pending),
            Err(RecvTimeoutError::Disconnected) => {
                flush(path, &mut pending);
                return;
            }
        }
    }
}

fn flush(path: &Path, pending: &mut Option<SettingsFile>) {
    if let Some(file) = pending.take()
        && let Err(error) = write(path, &file)
    {
        error!("settings.write_failed error={error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::devices::AudioOutputSelection;
    use crate::audio::playback::RepeatMode;
    use crate::messages::{Notification, Notifier, StateTopic};
    use crate::test_support::{NotificationLog, TestDirectory, null_notifier};

    /// A store over the settings saved in `directory`, notifying through `notifier`.
    fn open(directory: &Path, notifier: Notifier) -> SettingsStore {
        let path = file_path(directory);
        let file = read(&path);
        let state_store = Arc::new(StateStore::new(&file, notifier));
        SettingsStore::open(path, file, state_store)
    }

    fn saved(store: &SettingsStore) -> SettingsFile {
        store.state.lock().file.clone()
    }

    #[test]
    fn starts_from_defaults_without_a_file() {
        let directory = TestDirectory::new();
        let store = open(directory.path(), null_notifier());
        assert_eq!(saved(&store), SettingsFile::default());
    }

    #[test]
    fn saved_changes_are_restored_on_the_next_start() {
        let directory = TestDirectory::new();
        let store = open(directory.path(), null_notifier());
        store.update_appearance(&AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: Some(true),
        });
        store.record_playback(PlaybackPreferences {
            volume: 0.4,
            muted: true,
            output_selection: AudioOutputSelection::Device {
                device_id: "dac".into(),
            },
            repeat_mode: RepeatMode::All,
            shuffle_enabled: true,
        });
        store.shutdown();

        let restored = saved(&open(directory.path(), null_notifier()));
        assert!(!restored.appearance.artwork_backdrop);
        assert!(restored.appearance.calm_motion);
        assert_eq!(restored.playback.volume, 0.4);
        assert!(restored.playback.muted && restored.playback.shuffle_enabled);
        assert_eq!(restored.playback.repeat_mode, RepeatMode::All);
        assert_eq!(
            restored.playback.output_selection,
            AudioOutputSelection::Device {
                device_id: "dac".into()
            }
        );
    }

    #[test]
    fn an_older_file_is_replaced_by_defaults() {
        let directory = TestDirectory::new();
        std::fs::write(
            file_path(directory.path()),
            r#"{ "playback": { "volume": 0.25 } }"#,
        )
        .unwrap();
        assert_eq!(
            saved(&open(directory.path(), null_notifier())),
            SettingsFile::default()
        );
    }

    #[test]
    fn a_file_with_an_unknown_field_is_replaced_by_defaults() {
        let directory = TestDirectory::new();
        std::fs::write(
            file_path(directory.path()),
            r#"{ "appearance": { "artworkBackdrop": false, "calmMotion": true }, "playback": {}, "extra": 1 }"#,
        )
        .unwrap();
        assert_eq!(
            saved(&open(directory.path(), null_notifier())),
            SettingsFile::default()
        );
    }

    #[test]
    fn an_unusable_file_is_left_for_the_next_change_to_replace() {
        let directory = TestDirectory::new();
        let path = file_path(directory.path());
        std::fs::write(&path, "not json").unwrap();

        let store = open(directory.path(), null_notifier());
        assert_eq!(saved(&store), SettingsFile::default());
        assert!(!directory.file("settings.json.bad").exists());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "not json");

        store.update_appearance(&AppearancePatch {
            calm_motion: Some(true),
            ..AppearancePatch::default()
        });
        store.shutdown();
        assert!(
            std::fs::read_to_string(&path)
                .unwrap()
                .contains("\"calmMotion\": true")
        );
    }

    #[test]
    fn only_renderer_visible_changes_are_announced() {
        let directory = TestDirectory::new();
        let (recorder, sink) = NotificationLog::shared();
        let store = open(directory.path(), sink);

        store.record_playback(PlaybackPreferences {
            volume: 0.5,
            ..PlaybackPreferences::default()
        });
        assert_eq!(recorder.sent().len(), 0);

        let change = AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        };
        store.update_appearance(&change);
        store.update_appearance(&change);
        assert_eq!(
            recorder.sent(),
            vec![Notification::StateChanged(StateTopic::Appearance)]
        );
    }

    #[test]
    fn the_appearance_version_counts_appearance_changes_only() {
        let directory = TestDirectory::new();
        let store = open(directory.path(), null_notifier());
        assert_eq!(
            store.update_appearance(&AppearancePatch::default()).version,
            0
        );

        store.record_playback(PlaybackPreferences {
            volume: 0.5,
            ..PlaybackPreferences::default()
        });
        assert_eq!(
            store.update_appearance(&AppearancePatch::default()).version,
            0
        );

        let change = AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        };
        store.update_appearance(&change);
        let again = store.update_appearance(&change);
        assert_eq!(again.version, 1);
        assert!(!again.value.artwork_backdrop);
        assert_eq!(store.update_appearance(&AppearancePatch::default()), again);
    }
}
