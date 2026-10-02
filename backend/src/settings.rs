//! Persistent user settings: one JSON file in the application data directory.
//!
//! The file is independent of the library database, so settings survive a database that is
//! unavailable. Writes are debounced on a background thread and replace the file atomically.
//! Fields missing from the file take their defaults, so older files keep loading.

use std::{
    path::PathBuf,
    sync::{
        mpsc::{self, RecvTimeoutError, Sender},
        Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use log::{error, warn};
use serde::{Deserialize, Deserializer, Serialize};

use crate::audio::playback::PlaybackPreferences;
use crate::events::{BackendEvent, SharedEventSink};

const FILE_NAME: &str = "settings.json";
const WRITE_DEBOUNCE: Duration = Duration::from_millis(400);

/// What the renderer reads and writes. Every field is always present, so the renderer declares
/// no defaults of its own; a saved file missing a field takes the default here.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    /// Artwork light behind the library and Now Playing.
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
) -> Result<AppearanceSettings, D::Error> {
    let stored = StoredAppearance::deserialize(deserializer)?;
    let defaults = AppearanceSettings::default();
    Ok(AppearanceSettings {
        artwork_backdrop: stored.artwork_backdrop.unwrap_or(defaults.artwork_backdrop),
        calm_motion: stored.calm_motion.unwrap_or(defaults.calm_motion),
    })
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            artwork_backdrop: true,
            calm_motion: false,
        }
    }
}

/// Everything saved in the settings file. The renderer sees only the appearance part.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub playback: PlaybackPreferences,
    #[serde(deserialize_with = "appearance_from_file")]
    pub appearance: AppearanceSettings,
}

/// A partial update from the renderer; absent fields stay as they are. Playback preferences are
/// not here: the playback worker owns them and records every change itself.
#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub appearance: Option<AppearancePatch>,
}

#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppearancePatch {
    pub artwork_backdrop: Option<bool>,
    pub calm_motion: Option<bool>,
}

impl Settings {
    fn sanitized(mut self) -> Self {
        self.playback = self.playback.sanitized();
        self
    }

    fn apply(&mut self, patch: &SettingsPatch) {
        if let Some(appearance) = &patch.appearance {
            if let Some(value) = appearance.artwork_backdrop {
                self.appearance.artwork_backdrop = value;
            }
            if let Some(value) = appearance.calm_motion {
                self.appearance.calm_motion = value;
            }
        }
    }
}

pub struct SettingsService {
    state: Mutex<Settings>,
    events: SharedEventSink,
    writer: Mutex<Option<Sender<Settings>>>,
    writer_thread: Mutex<Option<JoinHandle<()>>>,
}

impl SettingsService {
    /// Loads the saved settings from `directory`, or starts from defaults when there are none or
    /// the file is unusable (an unusable file is kept aside as `settings.json.bad`).
    pub fn load(directory: PathBuf, events: SharedEventSink) -> Self {
        let path = directory.join(FILE_NAME);
        let settings = read(&path);
        let (sender, receiver) = mpsc::channel();
        let writer_thread = thread::Builder::new()
            .name("settings-writer".into())
            .spawn(move || write_loop(receiver, path))
            .map_err(|error| error!("settings.writer_spawn_failed error={error}"))
            .ok();
        Self {
            state: Mutex::new(settings),
            events,
            writer: Mutex::new(writer_thread.is_some().then_some(sender)),
            writer_thread: Mutex::new(writer_thread),
        }
    }

    pub fn get(&self) -> Settings {
        self.state.lock().expect("settings lock").clone()
    }

    /// The part of the settings the renderer reads.
    pub fn appearance(&self) -> AppearanceSettings {
        self.get().appearance
    }

    /// Applies a renderer update and announces it when something changed.
    pub fn update(&self, patch: &SettingsPatch) -> AppearanceSettings {
        let (settings, changed) = self.modify(|settings| settings.apply(patch));
        if changed {
            self.events.emit(BackendEvent::SettingsChanged);
        }
        settings.appearance
    }

    /// Remembers the playback preferences. They are persisted but not announced: the playback
    /// snapshot already tells the renderer.
    pub fn record_playback(&self, preferences: PlaybackPreferences) {
        self.modify(|settings| settings.playback = preferences);
    }

    fn modify(&self, change: impl FnOnce(&mut Settings)) -> (Settings, bool) {
        let mut state = self.state.lock().expect("settings lock");
        let before = state.clone();
        change(&mut state);
        let changed = *state != before;
        let settings = state.clone();
        drop(state);
        if changed {
            if let Some(writer) = self.writer.lock().expect("settings writer lock").as_ref() {
                let _ = writer.send(settings.clone());
            }
        }
        (settings, changed)
    }

    /// Writes any pending change and stops the writer thread.
    pub fn shutdown(&self) {
        drop(self.writer.lock().expect("settings writer lock").take());
        if let Some(thread) = self
            .writer_thread
            .lock()
            .expect("settings thread lock")
            .take()
        {
            if thread.join().is_err() {
                error!("settings.writer_panicked");
            }
        }
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
            let _ = std::fs::rename(path, path.with_extension("json.bad"));
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
fn write_loop(receiver: mpsc::Receiver<Settings>, path: PathBuf) {
    let mut pending: Option<Settings> = None;
    loop {
        let next = if pending.is_some() {
            receiver.recv_timeout(WRITE_DEBOUNCE)
        } else {
            receiver.recv().map_err(|_| RecvTimeoutError::Disconnected)
        };
        match next {
            Ok(settings) => pending = Some(settings),
            Err(RecvTimeoutError::Timeout) => flush(&path, &mut pending),
            Err(RecvTimeoutError::Disconnected) => {
                flush(&path, &mut pending);
                return;
            }
        }
    }
}

fn flush(path: &std::path::Path, pending: &mut Option<Settings>) {
    if let Some(settings) = pending.take() {
        if let Err(error) = write(path, &settings) {
            error!("settings.write_failed error={error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::devices::AudioOutputSelection;
    use crate::audio::playback::PlaybackRepeatMode;
    use crate::events::{null_event_sink, testing::RecordingEventSink};
    use crate::test_support::TestDirectory;

    fn directory() -> (TestDirectory, PathBuf) {
        let directory = TestDirectory::new();
        let path = directory.file("data");
        std::fs::create_dir_all(&path).unwrap();
        (directory, path)
    }

    #[test]
    fn starts_from_defaults_without_a_file() {
        let (_guard, path) = directory();
        let service = SettingsService::load(path, null_event_sink());
        assert_eq!(service.get(), Settings::default());
        assert!(service.get().appearance.artwork_backdrop);
    }

    #[test]
    fn saved_changes_are_restored_on_the_next_start() {
        let (_guard, path) = directory();
        let service = SettingsService::load(path.clone(), null_event_sink());
        service.update(&SettingsPatch {
            appearance: Some(AppearancePatch {
                artwork_backdrop: Some(false),
                calm_motion: Some(true),
            }),
        });
        service.record_playback(PlaybackPreferences {
            volume: 0.4,
            muted: true,
            output_selection: AudioOutputSelection::Device {
                device_id: "dac".into(),
            },
            repeat_mode: PlaybackRepeatMode::All,
            shuffle_enabled: true,
        });
        service.shutdown();

        let restored = SettingsService::load(path, null_event_sink()).get();
        assert!(!restored.appearance.artwork_backdrop);
        assert!(restored.appearance.calm_motion);
        assert_eq!(restored.playback.volume, 0.4);
        assert!(restored.playback.muted && restored.playback.shuffle_enabled);
        assert_eq!(restored.playback.repeat_mode, PlaybackRepeatMode::All);
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
        let settings = SettingsService::load(path, null_event_sink()).get();
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
            SettingsService::load(path.clone(), null_event_sink())
                .get()
                .playback
                .volume,
            1.0
        );

        std::fs::write(path.join(FILE_NAME), "not json").unwrap();
        let settings = SettingsService::load(path.clone(), null_event_sink()).get();
        assert_eq!(settings, Settings::default());
        assert!(path.join("settings.json.bad").exists());
    }

    #[test]
    fn only_renderer_visible_changes_are_announced() {
        let (_guard, path) = directory();
        let (recorder, sink) = RecordingEventSink::shared();
        let service = SettingsService::load(path, sink);

        service.record_playback(PlaybackPreferences {
            volume: 0.5,
            ..PlaybackPreferences::default()
        });
        assert!(recorder.events().is_empty());

        let patch = SettingsPatch {
            appearance: Some(AppearancePatch {
                artwork_backdrop: Some(false),
                calm_motion: None,
            }),
        };
        service.update(&patch);
        service.update(&patch);
        assert_eq!(recorder.events(), vec![BackendEvent::SettingsChanged]);
    }
}
