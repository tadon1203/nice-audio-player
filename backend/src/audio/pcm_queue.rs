use ringbuf::{
    traits::{Consumer, Observer, Producer, Split},
    HeapRb,
};

use super::pcm::ChannelCount;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PcmQueueBuildError {
    ZeroCapacity,
    CapacityOverflow,
}

pub(crate) struct PcmProducer {
    producer: ringbuf::HeapProd<f32>,
    channel_count: usize,
}

pub(crate) struct PcmConsumer {
    consumer: ringbuf::HeapCons<f32>,
    #[allow(dead_code)]
    channel_count: usize,
}

pub(crate) fn bounded_pcm_queue(
    capacity_frames: usize,
    channel_count: ChannelCount,
) -> Result<(PcmProducer, PcmConsumer), PcmQueueBuildError> {
    if capacity_frames == 0 {
        return Err(PcmQueueBuildError::ZeroCapacity);
    }
    let channel_count = usize::from(channel_count.get());
    let capacity_samples = capacity_frames
        .checked_mul(channel_count)
        .ok_or(PcmQueueBuildError::CapacityOverflow)?;
    let (producer, consumer) = HeapRb::<f32>::new(capacity_samples).split();
    Ok((
        PcmProducer {
            producer,
            channel_count,
        },
        PcmConsumer {
            consumer,
            channel_count,
        },
    ))
}

impl PcmProducer {
    /// Writes as many complete frames as current capacity allows.
    ///
    /// The return value is the number of samples written. Callers must retry
    /// the unwritten remainder.
    pub(crate) fn push_samples(&mut self, samples: &[f32]) -> usize {
        debug_assert_eq!(samples.len() % self.channel_count, 0);
        let complete_samples = samples.len() - samples.len() % self.channel_count;
        let writable_samples = self.producer.vacant_len().min(complete_samples);
        let writable_samples = writable_samples - writable_samples % self.channel_count;
        let mut written = 0;
        while written < writable_samples {
            if self.producer.try_push(samples[written]).is_err() {
                break;
            }
            written += 1;
        }
        written
    }

    #[allow(dead_code)]
    pub(crate) fn free_frames(&self) -> usize {
        self.producer.vacant_len() / self.channel_count
    }

    #[allow(dead_code)]
    pub(crate) fn available_frames(&self) -> usize {
        (self.producer.capacity().get() - self.producer.vacant_len()) / self.channel_count
    }
}

impl PcmConsumer {
    pub(crate) fn pop_sample(&mut self) -> Option<f32> {
        self.consumer.try_pop()
    }

    #[allow(dead_code)]
    pub(crate) fn available_frames(&self) -> usize {
        self.consumer.occupied_len() / self.channel_count
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.consumer.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::{bounded_pcm_queue, PcmQueueBuildError};
    use crate::audio::pcm::ChannelCount;

    #[test]
    fn capacity_is_measured_in_frames_and_writes_are_frame_aligned() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2, ChannelCount::new(2).unwrap()).unwrap();

        assert_eq!(producer.push_samples(&[1.0, 2.0, 3.0, 4.0]), 4);
        assert_eq!(producer.free_frames(), 0);
        assert_eq!(consumer.available_frames(), 2);
        assert_eq!(consumer.pop_sample(), Some(1.0));
        assert_eq!(consumer.pop_sample(), Some(2.0));
        assert_eq!(consumer.available_frames(), 1);
    }

    #[test]
    fn partial_reads_and_wraparound_preserve_fifo_order() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2, ChannelCount::new(1).unwrap()).unwrap();

        assert_eq!(producer.push_samples(&[1.0, 2.0]), 2);
        assert_eq!(consumer.pop_sample(), Some(1.0));
        assert_eq!(producer.push_samples(&[3.0, 4.0]), 1);
        assert_eq!(consumer.pop_sample(), Some(2.0));
        assert_eq!(consumer.pop_sample(), Some(3.0));
        assert_eq!(producer.push_samples(&[4.0]), 1);
        assert_eq!(consumer.pop_sample(), Some(4.0));
        assert!(consumer.is_empty());
    }

    #[test]
    fn rejects_zero_capacity() {
        assert_eq!(
            bounded_pcm_queue(0, ChannelCount::new(2).unwrap()).err(),
            Some(PcmQueueBuildError::ZeroCapacity)
        );
    }
}
