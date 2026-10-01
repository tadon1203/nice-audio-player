#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SampleRate(u32);

impl SampleRate {
    pub fn new(value: u32) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub const fn get(self) -> u32 {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ChannelCount(u16);

impl ChannelCount {
    pub fn new(value: usize) -> Option<Self> {
        u16::try_from(value)
            .ok()
            .filter(|value| *value > 0)
            .map(Self)
    }

    pub const fn get(self) -> u16 {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PcmSpec {
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

#[cfg(test)]
mod tests {
    use super::{ChannelCount, SampleRate};

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
