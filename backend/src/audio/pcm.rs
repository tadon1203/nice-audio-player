//! The PCM format types and the frame and millisecond conversions that decoding, processing,
//! output, and playback share.

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SampleRate(u32);

impl SampleRate {
    pub(crate) fn new(value: u32) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub(crate) const fn get(self) -> u32 {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ChannelCount(u16);

impl ChannelCount {
    pub(crate) fn new(value: usize) -> Option<Self> {
        u16::try_from(value)
            .ok()
            .filter(|value| *value > 0)
            .map(Self)
    }

    pub(crate) const fn get(self) -> u16 {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct PcmSpec {
    sample_rate: SampleRate,
    channel_count: ChannelCount,
}

impl PcmSpec {
    pub(crate) const fn new(sample_rate: SampleRate, channel_count: ChannelCount) -> Self {
        Self {
            sample_rate,
            channel_count,
        }
    }

    pub(crate) const fn sample_rate(self) -> SampleRate {
        self.sample_rate
    }

    pub(crate) const fn channel_count(self) -> ChannelCount {
        self.channel_count
    }
}

pub(crate) fn frame_to_millis(frame: u64, sample_rate: u32) -> u64 {
    scale(frame, 1_000, sample_rate)
}

pub(crate) fn millis_to_frame(millis: u64, sample_rate: u32) -> u64 {
    scale(millis, sample_rate, 1_000)
}

/// Re-expresses a frame count at another sample rate.
pub(crate) fn rescale_frame(frame: u64, to_rate: u32, from_rate: u32) -> u64 {
    scale(frame, to_rate, from_rate)
}

fn scale(value: u64, numerator: u32, denominator: u32) -> u64 {
    u128::from(value)
        .saturating_mul(u128::from(numerator))
        .checked_div(u128::from(denominator))
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::{ChannelCount, SampleRate, frame_to_millis, millis_to_frame, rescale_frame};

    #[test]
    fn converts_frames_and_milliseconds() {
        assert_eq!(frame_to_millis(22_050, 44_100), 500);
        assert_eq!(frame_to_millis(132_300, 44_100), 3_000);
        assert_eq!(frame_to_millis(96_000, 96_000), 1_000);
        assert_eq!(frame_to_millis(1, 0), 0);
    }

    #[test]
    fn rounds_down_and_rescales_to_the_output_rate() {
        assert_eq!(millis_to_frame(999, 44_100), 44_055);
        assert_eq!(frame_to_millis(44_055, 44_100), 998);
        assert_eq!(rescale_frame(44_100, 48_000, 44_100), 48_000);
        assert_eq!(millis_to_frame(2_001, 48_000), 96_048);
    }

    #[test]
    fn saturates_large_values() {
        assert_eq!(millis_to_frame(u64::MAX, u32::MAX), u64::MAX);
        assert_eq!(rescale_frame(u64::MAX, u32::MAX, 1), u64::MAX);
    }

    #[test]
    fn validates_sample_rate() {
        assert_eq!(SampleRate::new(0), None);
        assert_eq!(SampleRate::new(44_100).map(SampleRate::get), Some(44_100));
    }

    #[test]
    fn validates_channel_count() {
        assert_eq!(ChannelCount::new(0), None);
        assert_eq!(ChannelCount::new(2).map(ChannelCount::get), Some(2));
        assert_eq!(ChannelCount::new(usize::from(u16::MAX) + 1), None);
    }
}
