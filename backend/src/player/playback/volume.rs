pub(crate) const MIN_PLAYBACK_VOLUME: f32 = 0.0;
pub(crate) const MAX_PLAYBACK_VOLUME: f32 = 1.0;
pub(crate) const DEFAULT_PLAYBACK_VOLUME: f32 = 1.0;

/// A volume inside the playback range. The check is made where the value comes in: the IPC refuses
/// a value outside the range, so nothing downstream checks it again.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, specta::Type)]
#[serde(try_from = "f32")]
#[specta(type = f32)]
pub struct NormalizedVolume(f32);

/// A value outside the playback range, or not a number.
#[derive(Debug, Clone, Copy, PartialEq, thiserror::Error)]
#[error("the volume is outside the playback range")]
pub struct VolumeOutOfRange;

impl NormalizedVolume {
    pub(crate) fn new(value: f32) -> Option<Self> {
        (value.is_finite() && (MIN_PLAYBACK_VOLUME..=MAX_PLAYBACK_VOLUME).contains(&value))
            .then_some(Self(value))
    }

    pub(crate) fn value(self) -> f32 {
        self.0
    }
}

impl TryFrom<f32> for NormalizedVolume {
    type Error = VolumeOutOfRange;

    fn try_from(value: f32) -> Result<Self, VolumeOutOfRange> {
        Self::new(value).ok_or(VolumeOutOfRange)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct VolumeState {
    volume: NormalizedVolume,
    muted: bool,
}

impl Default for VolumeState {
    fn default() -> Self {
        Self {
            volume: NormalizedVolume::new(DEFAULT_PLAYBACK_VOLUME)
                .expect("default playback volume must be valid"),
            muted: false,
        }
    }
}

impl VolumeState {
    /// A saved level; anything outside the valid range falls back to the default.
    pub(crate) fn restored(volume: f32, muted: bool) -> Self {
        Self {
            volume: NormalizedVolume::new(volume).unwrap_or(Self::default().volume),
            muted,
        }
    }

    pub(crate) fn volume(self) -> f32 {
        self.volume.value()
    }

    pub(crate) fn muted(self) -> bool {
        self.muted
    }

    pub(crate) fn effective_gain(self) -> f32 {
        if self.muted { 0.0 } else { self.volume() }
    }

    /// Whether the volume changed.
    pub(crate) fn set_volume(&mut self, volume: NormalizedVolume) -> bool {
        let changed = self.volume != volume;
        self.volume = volume;
        changed
    }

    pub(crate) fn mute(&mut self) -> bool {
        let changed = !self.muted;
        self.muted = true;
        changed
    }

    pub(crate) fn unmute(&mut self) -> bool {
        let changed = self.muted;
        self.muted = false;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::{NormalizedVolume, VolumeState};

    #[test]
    fn accepts_only_finite_normalized_volume() {
        for value in [0.0, 0.5, 1.0] {
            assert_eq!(NormalizedVolume::new(value).unwrap().value(), value);
        }
        for value in [-0.1, 1.1, f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert!(NormalizedVolume::new(value).is_none());
        }
    }

    #[test]
    fn default_and_mute_state_are_independent() {
        let mut state = VolumeState::default();
        assert_eq!(state.volume(), 1.0);
        assert!(!state.muted());
        assert_eq!(state.effective_gain(), 1.0);
        assert!(state.mute());
        assert_eq!(state.volume(), 1.0);
        assert_eq!(state.effective_gain(), 0.0);
        assert!(!state.mute());
        assert!(state.set_volume(NormalizedVolume::new(0.5).unwrap()));
        assert!(state.unmute());
        assert_eq!(state.effective_gain(), 0.5);
        assert!(state.mute());
        assert!(state.set_volume(NormalizedVolume::new(0.25).unwrap()));
        assert_eq!(state.effective_gain(), 0.0);
        assert!(state.unmute());
        assert_eq!(state.effective_gain(), 0.25);
    }
}
