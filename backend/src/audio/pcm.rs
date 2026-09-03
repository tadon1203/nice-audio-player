#![allow(dead_code)]

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PcmBufferBuildError {
    EmptySamples,
    MisalignedSamples,
}

pub struct PcmBuffer {
    samples: Vec<f32>,
    sample_rate: SampleRate,
    channel_count: ChannelCount,
}

impl PcmBuffer {
    #[allow(clippy::manual_is_multiple_of)]
    pub(crate) fn from_interleaved(
        samples: Vec<f32>,
        sample_rate: SampleRate,
        channel_count: ChannelCount,
    ) -> Result<Self, PcmBufferBuildError> {
        if samples.is_empty() {
            return Err(PcmBufferBuildError::EmptySamples);
        }

        if samples.len() % usize::from(channel_count.get()) != 0 {
            return Err(PcmBufferBuildError::MisalignedSamples);
        }

        Ok(Self {
            samples,
            sample_rate,
            channel_count,
        })
    }

    pub fn samples(&self) -> &[f32] {
        &self.samples
    }

    pub(crate) fn into_samples(self) -> Vec<f32> {
        self.samples
    }

    pub const fn sample_rate(&self) -> SampleRate {
        self.sample_rate
    }

    pub const fn channel_count(&self) -> ChannelCount {
        self.channel_count
    }

    pub fn frame_count(&self) -> usize {
        self.samples.len() / usize::from(self.channel_count.get())
    }
}

#[cfg(test)]
mod tests {
    use super::{ChannelCount, PcmBuffer, PcmBufferBuildError, SampleRate};

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

    #[test]
    fn validates_pcm_alignment() {
        let sample_rate = SampleRate::new(44_100).unwrap();
        let channel_count = ChannelCount::new(2).unwrap();

        let buffer = PcmBuffer::from_interleaved(vec![0.0; 4], sample_rate, channel_count)
            .expect("aligned PCM must build");
        assert_eq!(buffer.frame_count(), 2);
        assert_eq!(buffer.samples().len(), 4);
        assert_eq!(buffer.sample_rate().get(), 44_100);
        assert_eq!(buffer.channel_count().get(), 2);

        assert_eq!(
            PcmBuffer::from_interleaved(vec![], sample_rate, channel_count).err(),
            Some(PcmBufferBuildError::EmptySamples)
        );
        assert_eq!(
            PcmBuffer::from_interleaved(vec![0.0; 3], sample_rate, channel_count).err(),
            Some(PcmBufferBuildError::MisalignedSamples)
        );
    }
}
