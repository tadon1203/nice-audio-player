//! Volume, mute and the saved playback preferences.

use super::{PlaybackPreferences, PlaybackServiceError, PlaybackState, PlaybackWorker, Versioned};

impl PlaybackWorker {
    pub(super) fn set_volume(
        &mut self,
        volume: f32,
    ) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        let changed = self
            .volume_state
            .set_volume(volume)
            .ok_or(PlaybackServiceError::InvalidVolume)?;
        Ok(self.volume_changed(changed))
    }

    pub(super) fn mute(&mut self) -> Versioned<PlaybackState> {
        let changed = self.volume_state.mute();
        self.volume_changed(changed)
    }

    pub(super) fn unmute(&mut self) -> Versioned<PlaybackState> {
        let changed = self.volume_state.unmute();
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
