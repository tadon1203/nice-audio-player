//! Volume, mute and the saved playback preferences.

use super::{PlaybackPreferences, PlaybackState, PlaybackWorker, Versioned};
use crate::audio::volume::NormalizedVolume;

impl PlaybackWorker {
    pub(in super::super) fn set_volume(
        &mut self,
        volume: NormalizedVolume,
    ) -> Versioned<PlaybackState> {
        let changed = self.volume_state.set_volume(volume);
        self.volume_changed(changed)
    }

    pub(in super::super) fn set_muted(&mut self, muted: bool) -> Versioned<PlaybackState> {
        let changed = if muted {
            self.volume_state.mute()
        } else {
            self.volume_state.unmute()
        };
        self.volume_changed(changed)
    }

    pub(super) fn volume_changed(&mut self, changed: bool) -> Versioned<PlaybackState> {
        if !changed {
            return self.playback_versioned();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        self.preferences_changed();
        self.publish_state()
    }

    pub(super) fn preferences(&self) -> PlaybackPreferences {
        PlaybackPreferences {
            volume: self.volume_state.volume(),
            muted: self.volume_state.muted(),
            output_selection: self.output_selection.clone(),
            repeat_mode: self.queue.repeat(),
            shuffle_enabled: self.queue.shuffle(),
        }
    }

    pub(super) fn preferences_changed(&self) {
        (self.observer)(self.preferences());
    }
}
