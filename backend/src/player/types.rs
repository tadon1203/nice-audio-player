//! The basic types that both `audio` and `playback` use. This module imports nothing from them.

use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

/// The gain that the Output stream applies. The worker stores it and the audio thread loads it.
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
    use super::{AtomicEffectiveGain, process_sample};

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
