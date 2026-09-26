use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

pub(crate) const MIN_PLAYBACK_VOLUME: f32 = 0.0;
pub(crate) const MAX_PLAYBACK_VOLUME: f32 = 1.0;
pub(crate) const DEFAULT_PLAYBACK_VOLUME: f32 = 1.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct NormalizedVolume(f32);

impl NormalizedVolume {
    pub(crate) fn new(value: f32) -> Option<Self> {
        (value.is_finite() && (MIN_PLAYBACK_VOLUME..=MAX_PLAYBACK_VOLUME).contains(&value))
            .then_some(Self(value))
    }

    pub(crate) fn value(self) -> f32 {
        self.0
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
    pub(crate) fn volume(self) -> f32 {
        self.volume.value()
    }

    pub(crate) fn muted(self) -> bool {
        self.muted
    }

    pub(crate) fn effective_gain(self) -> f32 {
        if self.muted {
            0.0
        } else {
            self.volume()
        }
    }

    pub(crate) fn set_volume(&mut self, value: f32) -> Option<bool> {
        let volume = NormalizedVolume::new(value)?;
        let changed = self.volume != volume;
        self.volume = volume;
        Some(changed)
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

#[derive(Clone)]
pub(crate) struct AtomicEffectiveGain {
    gain: Arc<AtomicU32>,
}

impl AtomicEffectiveGain {
    pub(crate) fn new(gain: f32) -> Self {
        Self {
            gain: Arc::new(AtomicU32::new(gain.to_bits())),
        }
    }

    pub(crate) fn store(&self, gain: f32) {
        self.gain.store(gain.to_bits(), Ordering::Relaxed);
    }

    pub(crate) fn load(&self) -> f32 {
        f32::from_bits(self.gain.load(Ordering::Relaxed))
    }
}

pub(crate) fn process_sample(sample: f32, effective_gain: f32) -> f32 {
    if !sample.is_finite() {
        return 0.0;
    }
    let scaled = sample * effective_gain;
    if !scaled.is_finite() {
        return 0.0;
    }
    scaled.clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::{process_sample, AtomicEffectiveGain, NormalizedVolume, VolumeState};

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
        assert!(state.set_volume(0.5).unwrap());
        assert!(state.unmute());
        assert_eq!(state.effective_gain(), 0.5);
        assert!(state.mute());
        assert!(state.set_volume(0.25).unwrap());
        assert_eq!(state.effective_gain(), 0.0);
        assert!(state.unmute());
        assert_eq!(state.effective_gain(), 0.25);
    }

    #[test]
    fn processes_gain_boundaries_and_non_finite_samples() {
        assert_eq!(process_sample(-1.0, 1.0), -1.0);
        assert_eq!(process_sample(0.0, 1.0), 0.0);
        assert_eq!(process_sample(1.0, 1.0), 1.0);
        assert_eq!(process_sample(-1.0, 0.5), -0.5);
        assert_eq!(process_sample(1.0, 0.5), 0.5);
        assert_eq!(process_sample(0.5, 0.0), 0.0);
        assert_eq!(process_sample(2.0, 1.0), 1.0);
        assert_eq!(process_sample(-2.0, 1.0), -1.0);
        assert_eq!(process_sample(f32::NAN, 1.0), 0.0);
        assert_eq!(process_sample(f32::INFINITY, 1.0), 0.0);
        assert_eq!(process_sample(f32::NEG_INFINITY, 1.0), 0.0);
    }

    #[test]
    fn atomic_gain_round_trips_values() {
        let gain = AtomicEffectiveGain::new(1.0);
        for value in [0.0, 0.5, 1.0] {
            gain.store(value);
            assert_eq!(gain.load(), value);
        }
    }
}
