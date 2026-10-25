use std::sync::Arc;

use super::queue::RepeatMode;
use crate::audio::output::AudioOutputSelection;
use crate::audio::volume::DEFAULT_PLAYBACK_VOLUME;

/// The playback choices that outlive a session: what the listener set, restored at startup.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct PlaybackPreferences {
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub repeat_mode: RepeatMode,
    pub shuffle_enabled: bool,
}

impl Default for PlaybackPreferences {
    fn default() -> Self {
        Self {
            volume: DEFAULT_PLAYBACK_VOLUME,
            muted: false,
            output_selection: AudioOutputSelection::SystemDefault,
            repeat_mode: RepeatMode::Off,
            shuffle_enabled: false,
        }
    }
}

/// Told, on the playback worker's thread, whenever a preference changes.
pub(super) type PreferencesObserver = Arc<dyn Fn(PlaybackPreferences) + Send + Sync>;
