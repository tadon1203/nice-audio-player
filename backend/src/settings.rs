//! Persistent user settings: one JSON file in the application data directory.
//!
//! The file is independent of the library database, so settings survive a database that is
//! unavailable. Writes are debounced on a background thread and replace the file atomically.
//! Fields missing from the file take their defaults, so older files keep loading.
//!
//! The file holds the appearance the renderer edits and the playback preferences the playback
//! worker records. Nothing outside this module sees the file's shape: the Host reads and writes
//! appearance through `SettingsService`, and the playback service reads its preferences from it.

use parking_lot::Mutex;
use std::{
    path::Path,
    sync::{
        Arc,
        mpsc::{self, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use log::{error, warn};
use serde::{Deserialize, Deserializer, Serialize};

use crate::audio::playback::PlaybackPreferences;
use crate::messages::{StateValue, Versioned};
use crate::state_hub::StateHub;

const FILE_NAME: &str = "settings.json";
const WRITE_DEBOUNCE: Duration = Duration::from_millis(400);

/// What the renderer reads and writes. Every field is always present, so the renderer declares
/// no defaults of its own; a saved file missing a field takes the default here.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    /// Artwork glow behind the library and Now Playing.
    pub artwork_backdrop: bool,
    /// Only what marks the position moves by itself: nothing breathes or lifts on its own.
    pub calm_motion: bool,
}

/// How the file stores appearance: every field may be missing.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppearance {
    artwork_backdrop: Option<bool>,
    calm_motion: Option<bool>,
}

fn appearance_from_file<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Appearance, D::Error> {
    let stored = StoredAppearance::deserialize(deserializer)?;
    let defaults = Appearance::default();
    Ok(Appearance {
        artwork_backdrop: stored.artwork_backdrop.unwrap_or(defaults.artwork_backdrop),
        calm_motion: stored.calm_motion.unwrap_or(defaults.calm_motion),
    })
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

/// Everything saved in the settings file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Settings {
    pub(crate) playback: PlaybackPreferences,
    #[serde(deserialize_with = "appearance_from_file")]
    pub(crate) appearance: Appearance,
}

impl Settings {
    fn sanitized(mut self) -> Self {
        self.playback = self.playback.sanitized();
        self
    }

    fn apply_appearance(&mut self, patch: &AppearancePatch) {
        if let Some(value) = patch.artwork_backdrop {
            self.appearance.artwork_backdrop = value;
        }
        if let Some(value) = patch.calm_motion {
            self.appearance.calm_motion = value;
        }
    }
}

pub(crate) struct SettingsService {
    state: Mutex<Settings>,
    hub: Arc<StateHub>,
    writer: Mutex<Option<Sender<Settings>>>,
    writer_thread: Mutex<Option<JoinHandle<()>>>,
}

/// The settings saved in `directory`, or defaults when there are none or the file is unusable
/// (an unusable file is kept aside as `settings.json.bad`).
pub(crate) fn load_saved(directory: &Path) -> Settings {
    read(&directory.join(FILE_NAME))
}

impl SettingsService {
    /// Starts the writer for the settings file in `directory`. `settings` is what `load_saved`
    /// read from it, and the appearance in `hub` must already be that appearance.
    pub(crate) fn start(directory: &Path, settings: Settings, hub: Arc<StateHub>) -> Self {
        let path = directory.join(FILE_NAME);
        let (sender, receiver) = mpsc::channel();
        let writer_thread = thread::Builder::new()
            .name("settings-writer".into())
            .spawn(move || write_loop(&receiver, &path))
            .map_err(|error| error!("settings.writer_spawn_failed error={error}"))
            .ok();
        Self {
            state: Mutex::new(settings),
            hub,
            writer: Mutex::new(writer_thread.is_some().then_some(sender)),
            writer_thread: Mutex::new(writer_thread),
        }
    }

    /// Applies a renderer update, announces it when something changed, and returns the appearance
    /// as it is afterwards.
    pub(crate) fn appearance_update(&self, patch: &AppearancePatch) -> Versioned<Appearance> {
        self.modify(|settings| settings.apply_appearance(patch)).0
    }

    /// The playback preferences the next start of the playback worker begins with.
    pub(crate) fn playback_preferences(&self) -> PlaybackPreferences {
        self.state.lock().playback.clone()
    }

    /// Remembers the playback preferences. They are persisted but not published: the playback
    /// state already tells the renderer.
    pub(crate) fn record_playback(&self, preferences: PlaybackPreferences) {
        self.modify(|settings| settings.playback = preferences);
    }

    /// Applies `change` under the lock and publishes the appearance. Returns the appearance with
    /// its version, and whether anything changed. A change is queued for the writer while the
    /// lock is still held, so the writer sees the changes in the order they were made.
    fn modify(&self, change: impl FnOnce(&mut Settings)) -> (Versioned<Appearance>, bool) {
        let mut state = self.state.lock();
        let before = state.clone();
        change(&mut state);
        let changed = *state != before;
        let version = self
            .hub
            .publish(StateValue::Appearance(state.appearance.clone()));
        let appearance = Versioned {
            version,
            value: state.appearance.clone(),
        };
        if changed
            && let Some(writer) = self.writer.lock().as_ref()
            && let Err(cause) = writer.send(state.clone())
        {
            log::debug!("settings.writer_send_failed cause={cause}");
        }
        (appearance, changed)
    }

    /// Writes any pending change and stops the writer thread.
    pub(crate) fn shutdown(&self) {
        drop(self.writer.lock().take());
        if let Some(thread) = self.writer_thread.lock().take()
            && thread.join().is_err()
        {
            error!("settings.writer_panicked");
        }
    }

    #[cfg(test)]
    fn get(&self) -> Settings {
        self.state.lock().clone()
    }
}

impl Drop for SettingsService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn read(path: &std::path::Path) -> Settings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
        Err(error) => {
            warn!("settings.read_failed error={error}");
            return Settings::default();
        }
    };
    match serde_json::from_str::<Settings>(&text) {
        Ok(settings) => settings.sanitized(),
        Err(error) => {
            warn!("settings.file_unusable error={error}");
            if let Err(cause) = std::fs::rename(path, path.with_extension("json.bad")) {
                log::debug!("settings.quarantine_failed cause={cause}");
            }
            Settings::default()
        }
    }
}

fn write(path: &std::path::Path, settings: &Settings) -> std::io::Result<()> {
    let temporary = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, path)
}

/// Collapses bursts of changes (a volume drag) into one write of the latest settings.
fn write_loop(receiver: &mpsc::Receiver<Settings>, path: &Path) {
    let mut pending: Option<Settings> = None;
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
            Ok(settings) => pending = Some(settings),
            Err(RecvTimeoutError::Timeout) => flush(path, &mut pending),
            Err(RecvTimeoutError::Disconnected) => {
                flush(path, &mut pending);
                return;
            }
        }
    }
}

fn flush(path: &Path, pending: &mut Option<Settings>) {
    if let Some(settings) = pending.take()
        && let Err(error) = write(path, &settings)
    {
        error!("settings.write_failed error={error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::devices::AudioOutputSelection;
    use crate::audio::playback::RepeatMode;
    use crate::messages::{SharedMessageListener, StateTopic};
    use crate::state_hub::{Published, StateHub};
    use crate::test_support::{
        RecordingMessageListener, Sent, TestDirectory, null_message_listener,
    };
    use std::path::PathBuf;

    fn directory() -> (TestDirectory, PathBuf) {
        let directory = TestDirectory::new();
        let path = directory.file("data");
        std::fs::create_dir_all(&path).unwrap();
        (directory, path)
    }

    /// A service over the settings saved in `path`, publishing to `listener`.
    fn load(path: &Path, listener: SharedMessageListener) -> SettingsService {
        let settings = load_saved(path);
        let hub = Arc::new(StateHub::new(Published::initial(&settings), listener));
        SettingsService::start(path, settings, hub)
    }

    #[test]
    fn starts_from_defaults_without_a_file() {
        let (_guard, path) = directory();
        let service = load(&path, null_message_listener());
        assert_eq!(service.get(), Settings::default());
        assert!(service.get().appearance.artwork_backdrop);
    }

    #[test]
    fn saved_changes_are_restored_on_the_next_start() {
        let (_guard, path) = directory();
        let service = load(&path, null_message_listener());
        service.appearance_update(&AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: Some(true),
        });
        service.record_playback(PlaybackPreferences {
            volume: 0.4,
            muted: true,
            output_selection: AudioOutputSelection::Device {
                device_id: "dac".into(),
            },
            repeat_mode: RepeatMode::All,
            shuffle_enabled: true,
        });
        service.shutdown();

        let restored = load(&path, null_message_listener()).get();
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
    fn a_partial_file_keeps_defaults_for_missing_fields() {
        let (_guard, path) = directory();
        std::fs::write(
            path.join(FILE_NAME),
            r#"{ "playback": { "volume": 0.25 } }"#,
        )
        .unwrap();
        let settings = load(&path, null_message_listener()).get();
        assert_eq!(settings.playback.volume, 0.25);
        assert!(!settings.playback.muted);
        assert!(settings.appearance.artwork_backdrop);
        assert!(!settings.appearance.calm_motion);
    }

    #[test]
    fn out_of_range_values_are_replaced_and_an_unusable_file_is_kept_aside() {
        let (_guard, path) = directory();
        std::fs::write(path.join(FILE_NAME), r#"{ "playback": { "volume": 7.0 } }"#).unwrap();
        assert_eq!(
            load(&path, null_message_listener())
                .playback_preferences()
                .volume,
            1.0
        );

        std::fs::write(path.join(FILE_NAME), "not json").unwrap();
        let settings = load(&path, null_message_listener()).get();
        assert_eq!(settings, Settings::default());
        assert!(path.join("settings.json.bad").exists());
    }

    #[test]
    fn only_renderer_visible_changes_are_announced() {
        let (_guard, path) = directory();
        let (recorder, sink) = RecordingMessageListener::shared();
        let service = load(&path, sink);

        service.record_playback(PlaybackPreferences {
            volume: 0.5,
            ..PlaybackPreferences::default()
        });
        assert_eq!(recorder.sent().len(), 0);

        let change = AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        };
        service.appearance_update(&change);
        service.appearance_update(&change);
        assert_eq!(recorder.sent(), vec![Sent::State(StateTopic::Appearance)]);
    }

    #[test]
    fn the_appearance_version_counts_appearance_changes_only() {
        let (_guard, path) = directory();
        let service = load(&path, null_message_listener());
        assert_eq!(
            service
                .appearance_update(&AppearancePatch::default())
                .version,
            0
        );

        service.record_playback(PlaybackPreferences {
            volume: 0.5,
            ..PlaybackPreferences::default()
        });
        assert_eq!(
            service
                .appearance_update(&AppearancePatch::default())
                .version,
            0
        );

        let change = AppearancePatch {
            artwork_backdrop: Some(false),
            calm_motion: None,
        };
        service.appearance_update(&change);
        let again = service.appearance_update(&change);
        assert_eq!(again.version, 1);
        assert!(!again.value.artwork_backdrop);
        assert_eq!(
            service.appearance_update(&AppearancePatch::default()),
            again
        );
    }
}
