use std::sync::Arc;

use super::queue::PlaybackRepeatMode;
use crate::audio::devices::AudioOutputSelection;
use crate::audio::volume::DEFAULT_PLAYBACK_VOLUME;

/// The playback choices that outlive a session: what the listener set, restored at startup.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub struct PlaybackPreferences {
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub repeat_mode: PlaybackRepeatMode,
    pub shuffle_enabled: bool,
}

impl Default for PlaybackPreferences {
    fn default() -> Self {
        Self {
            volume: DEFAULT_PLAYBACK_VOLUME,
            muted: false,
            output_selection: AudioOutputSelection::SystemDefault,
            repeat_mode: PlaybackRepeatMode::Off,
            shuffle_enabled: false,
        }
    }
}

impl PlaybackPreferences {
    /// Replaces values a hand-edited or damaged file could hold that playback cannot use.
    pub fn sanitized(mut self) -> Self {
        if !self.volume.is_finite() || !(0.0..=1.0).contains(&self.volume) {
            self.volume = DEFAULT_PLAYBACK_VOLUME;
        }
        self
    }
}

/// Told, on the playback worker's thread, whenever a preference changes.
pub type PreferencesObserver = Arc<dyn Fn(PlaybackPreferences) + Send + Sync>;
