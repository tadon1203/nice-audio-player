//! Persistent user settings: one JSON file in the application data directory.
//!
//! The file is independent of the library database, so settings survive a database that is
//! unavailable. Writes are debounced on a background thread and replace the file atomically.
//! The file must match its shape: a damaged or older file is logged and replaced by defaults,
//! and the next change overwrites it.
//!
//! The file holds the appearance the renderer edits and the player preferences the player
//! worker records. The appearance is sent to the Host when it changes; nothing else sees the
//! file's shape.

use parking_lot::Mutex;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::mpsc::{self, RecvTimeoutError, Sender},
    time::Duration,
};

use anyhow::Context;
use log::{error, warn};
use serde::{Deserialize, Serialize};

use crate::messages::{self, BackendMessage};
use crate::player::PlayerPreferences;
use crate::threads::WorkerThread;

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
    pub(crate) player: PlayerPreferences,
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
    messages: Sender<BackendMessage>,
}

struct State {
    file: SettingsFile,
    /// The writer thread, until `shutdown` takes it. It lives under the same lock as the file, so
    /// changes reach it in the order they were made.
    writer: Option<Writer>,
}

struct Writer {
    sender: Sender<SettingsFile>,
    thread: WorkerThread,
}

impl SettingsStore {
    /// Starts the writer for the settings file at `path`. `file` is what `read` found there. Its
    /// appearance is sent first.
    pub(crate) fn open(
        path: PathBuf,
        file: SettingsFile,
        messages: Sender<BackendMessage>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel();
        let thread = WorkerThread::spawn("settings-writer", move || write_loop(&receiver, &path));
        messages::send(
            &messages,
            BackendMessage::Appearance(file.appearance.clone()),
        );
        Self {
            state: Mutex::new(State {
                file,
                writer: Some(Writer { sender, thread }),
            }),
            messages,
        }
    }

    /// Applies a renderer update. The appearance is sent when something changed.
    pub(crate) fn update_appearance(&self, patch: &AppearancePatch) {
        self.modify(|file| {
            if let Some(value) = patch.artwork_backdrop {
                file.appearance.artwork_backdrop = value;
            }
            if let Some(value) = patch.calm_motion {
                file.appearance.calm_motion = value;
            }
        });
    }

    /// The player preferences the next start of the player worker begins with.
    pub(crate) fn player_preferences(&self) -> PlayerPreferences {
        self.state.lock().file.player.clone()
    }

    /// Remembers the player preferences. They are persisted but not published: the playback
    /// state already tells the renderer.
    pub(crate) fn record_player(&self, preferences: &PlayerPreferences) {
        self.modify(|file| file.player = preferences.clone());
    }

    /// Applies `change` under the lock, sends the appearance when it changed, and queues the file
    /// for the writer. Both happen while the lock is still held, so the Host and the writer see the
    /// changes in the order they were made.
    fn modify(&self, change: impl FnOnce(&mut SettingsFile)) {
        let mut state = self.state.lock();
        let before = state.file.clone();
        change(&mut state.file);
        if state.file.appearance != before.appearance {
            messages::send(
                &self.messages,
                BackendMessage::Appearance(state.file.appearance.clone()),
            );
        }
        if state.file != before
            && let Some(writer) = &state.writer
        {
            let _ = writer.sender.send(state.file.clone());
        }
    }

    /// Writes any pending change and stops the writer thread.
    pub(crate) fn shutdown(&self) {
        let writer = self.state.lock().writer.take();
        if let Some(Writer { sender, thread }) = writer {
            drop(sender);
            thread.join();
        }
    }
}

impl Drop for SettingsStore {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn write(path: &Path, file: &SettingsFile) -> anyhow::Result<()> {
    let temporary = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(file).context("the settings cannot be serialized")?;
    fs::write(&temporary, text).context("the settings cannot be written")?;
    fs::rename(&temporary, path).context("the settings file cannot be replaced")
}

/// Collapses bursts of changes (a volume drag) into one write of the latest settings.
fn write_loop(receiver: &mpsc::Receiver<SettingsFile>, path: &Path) {
    let mut pending: Option<SettingsFile> = None;
    loop {
        let next = if pending.is_some() {
            receiver.recv_timeout(WRITE_DEBOUNCE)
        } else {
            // Closing the channel is how a normal shutdown ends the writer.
            receiver.recv().ok().ok_or(RecvTimeoutError::Disconnected)
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
        error!("settings.write_failed error={error:#}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::player::RepeatMode;
    use crate::player::audio::output::AudioOutputSelection;
    use crate::test_support::{MessageLog, TestDirectory, null_messages};
    use std::sync::mpsc::Sender;

    /// A store over the settings saved in `directory`, sending through `messages`.
    fn open(directory: &Path, messages: Sender<BackendMessage>) -> SettingsStore {
        let path = file_path(directory);
        let file = read(&path);
        SettingsStore::open(path, file, messages)
    }

    fn saved(store: &SettingsStore) -> SettingsFile {
        store.state.lock().file.clone()
    }

    fn sent_appearances(host: &MessageLog) -> Vec<Appearance> {
        host.sent()
            .into_iter()
            .filter_map(|message| match message {
                BackendMessage::Appearance(appearance) => Some(appearance),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn starts_from_defaults_without_a_file() {
        let directory = TestDirectory::new();
        let store = open(directory.path(), null_messages());
        assert_eq!(saved(&store), SettingsFile::default());
    }

    #[test]
    fn saved_changes_are_restored_on_the_next_start() {
        let directory = TestDirectory::new();
        let store = open(directory.path(), null_messages());
        store.update_appearance(&AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: Some(true),
        });
        store.record_player(&PlayerPreferences {
            volume: 0.4,
            muted: true,
            output_selection: AudioOutputSelection::Device {
                device_id: "dac".into(),
            },
            repeat_mode: RepeatMode::All,
            shuffle_enabled: true,
        });
        store.shutdown();

        let restored = saved(&open(directory.path(), null_messages()));
        assert!(!restored.appearance.artwork_backdrop);
        assert!(restored.appearance.calm_motion);
        assert_eq!(restored.player.volume, 0.4);
        assert!(restored.player.muted && restored.player.shuffle_enabled);
        assert_eq!(restored.player.repeat_mode, RepeatMode::All);
        assert_eq!(
            restored.player.output_selection,
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
            r#"{ "player": { "volume": 0.25 } }"#,
        )
        .unwrap();
        assert_eq!(
            saved(&open(directory.path(), null_messages())),
            SettingsFile::default()
        );
    }

    #[test]
    fn a_file_with_an_unknown_field_is_replaced_by_defaults() {
        let directory = TestDirectory::new();
        std::fs::write(
            file_path(directory.path()),
            r#"{ "appearance": { "artworkBackdrop": false, "calmMotion": true }, "player": {}, "extra": 1 }"#,
        )
        .unwrap();
        assert_eq!(
            saved(&open(directory.path(), null_messages())),
            SettingsFile::default()
        );
    }

    #[test]
    fn an_unusable_file_is_left_for_the_next_change_to_replace() {
        let directory = TestDirectory::new();
        let path = file_path(directory.path());
        std::fs::write(&path, "not json").unwrap();

        let store = open(directory.path(), null_messages());
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
    fn only_appearance_changes_are_sent() {
        let directory = TestDirectory::new();
        let (host, sink) = MessageLog::shared();
        let store = open(directory.path(), sink);
        assert_eq!(
            sent_appearances(&host).len(),
            1,
            "the appearance is sent when the store opens"
        );

        store.record_player(&PlayerPreferences {
            volume: 0.5,
            ..PlayerPreferences::default()
        });
        assert_eq!(sent_appearances(&host).len(), 1);

        let change = AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        };
        store.update_appearance(&change);
        store.update_appearance(&change);
        assert_eq!(
            sent_appearances(&host).len(),
            2,
            "a change that leaves the appearance as it was is not sent"
        );
    }

    #[test]
    fn the_sent_appearance_is_the_appearance_after_the_change() {
        let directory = TestDirectory::new();
        let (host, sink) = MessageLog::shared();
        let store = open(directory.path(), sink);

        store.update_appearance(&AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        });
        let sent = sent_appearances(&host);
        assert!(!sent.last().expect("a change is sent").artwork_backdrop);
    }
}
