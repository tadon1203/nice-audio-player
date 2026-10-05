//! The bounded PCM queue between a decode thread and an output callback.
//!
//! The queue owns the two things the producer and the callback must agree on besides the
//! samples: when the producer has no more to give (end of stream), and when a full queue has room
//! again (capacity waiting). Neither needs a flag or a channel outside the queue.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender},
    Arc,
};

use ringbuf::{
    traits::{Consumer, Observer, Producer, Split},
    HeapRb,
};

use super::pcm::ChannelCount;

/// The consumer wakes a waiting producer when occupancy falls below this fraction (1/2).
const WAKE_NUMERATOR: usize = 1;
const WAKE_DENOMINATOR: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum PcmQueueBuildError {
    ZeroCapacity,
    CapacityOverflow,
}

/// A wait for room in the queue ended because it was cancelled.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct WaitCancelled;

pub(crate) struct PcmProducer {
    producer: ringbuf::HeapProd<f32>,
    channel_count: usize,
    room: Receiver<()>,
    waker: PcmWaker,
    finished: Arc<AtomicBool>,
}

pub(crate) struct PcmConsumer {
    consumer: ringbuf::HeapCons<f32>,
    room: SyncSender<()>,
    finished: Arc<AtomicBool>,
}

/// Wakes a producer that is waiting for room, so it can notice that it was cancelled.
#[derive(Clone)]
pub(crate) struct PcmWaker(SyncSender<()>);

impl PcmWaker {
    pub(crate) fn wake(&self) {
        let _ = self.0.try_send(());
    }
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
    let (room_sender, room) = mpsc::sync_channel(1);
    let finished = Arc::new(AtomicBool::new(false));
    Ok((
        PcmProducer {
            producer,
            channel_count,
            room,
            waker: PcmWaker(room_sender.clone()),
            finished: Arc::clone(&finished),
        },
        PcmConsumer {
            consumer,
            room: room_sender,
            finished,
        },
    ))
}

impl PcmProducer {
    pub(crate) fn waker(&self) -> PcmWaker {
        self.waker.clone()
    }

    /// Writes as many complete frames as current capacity allows and returns the number of
    /// samples written. The caller retries the rest, or uses `write_all`.
    pub(crate) fn push_samples(&mut self, samples: &[f32]) -> usize {
        debug_assert_eq!(samples.len() % self.channel_count, 0);
        let complete = samples.len() - samples.len() % self.channel_count;
        let writable = self.producer.vacant_len().min(complete);
        let writable = writable - writable % self.channel_count;
        self.producer.push_slice(&samples[..writable])
    }

    /// Writes every sample, waiting for the consumer to make room. `after_push` runs after each
    /// partial write with the frames now queued. A cancelled wait is woken through the waker.
    pub(crate) fn write_all(
        &mut self,
        samples: &[f32],
        is_cancelled: impl Fn() -> bool,
        mut after_push: impl FnMut(usize),
    ) -> Result<(), WaitCancelled> {
        let mut offset = 0;
        while offset < samples.len() {
            if is_cancelled() {
                return Err(WaitCancelled);
            }
            let pushed = self.push_samples(&samples[offset..]);
            offset += pushed;
            after_push(self.queued_frames());
            if pushed == 0 && self.room.recv().is_err() {
                return Err(WaitCancelled);
            }
        }
        Ok(())
    }

    pub(crate) fn queued_frames(&self) -> usize {
        (self.producer.capacity().get() - self.producer.vacant_len()) / self.channel_count
    }

    /// Declares that nothing more will be written. The consumer reports `is_finished` once it
    /// has drained what is queued.
    pub(crate) fn finish(self) {
        self.finished.store(true, Ordering::Release);
    }
}

impl PcmConsumer {
    /// Pops up to `out.len()` samples and returns how many it got. Wakes a producer waiting for
    /// room only when this pop takes occupancy below `WAKE_BELOW_FRACTION` of capacity, so the
    /// producer refills in large batches.
    pub(crate) fn pop_samples(&mut self, out: &mut [f32]) -> usize {
        let popped = self.consumer.pop_slice(out);
        if popped > 0 {
            let capacity = self.consumer.capacity().get();
            let after = self.consumer.occupied_len();
            let before = after + popped;
            let below = |occupied: usize| occupied * WAKE_DENOMINATOR < capacity * WAKE_NUMERATOR;
            if below(after) && !below(before) {
                let _ = self.room.try_send(());
            }
        }
        popped
    }

    /// Whether the producer finished and every sample it wrote has been popped.
    pub(crate) fn is_finished(&self) -> bool {
        // Read the flag first: a producer that finished has written everything by then.
        self.finished.load(Ordering::Acquire) && self.consumer.is_empty()
    }

    #[cfg(test)]
    pub(crate) fn available_frames(&self, channel_count: usize) -> usize {
        self.consumer.occupied_len() / channel_count
    }
}

#[cfg(test)]
mod tests {
    use super::{bounded_pcm_queue, PcmQueueBuildError, WaitCancelled};
    use crate::audio::pcm::ChannelCount;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    #[test]
    fn capacity_is_measured_in_frames_and_writes_are_frame_aligned() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2, ChannelCount::new(2).unwrap()).unwrap();

        assert_eq!(producer.push_samples(&[1.0, 2.0, 3.0, 4.0]), 4);
        assert_eq!(producer.queued_frames(), 2);
        assert_eq!(producer.push_samples(&[5.0, 6.0]), 0);
        let mut out = [0.0; 2];
        assert_eq!(consumer.pop_samples(&mut out), 2);
        assert_eq!(out, [1.0, 2.0]);
        assert_eq!(consumer.available_frames(2), 1);
    }

    #[test]
    fn partial_reads_and_wraparound_preserve_fifo_order() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2, ChannelCount::new(1).unwrap()).unwrap();
        let mut out = [0.0; 1];

        assert_eq!(producer.push_samples(&[1.0, 2.0]), 2);
        assert_eq!(consumer.pop_samples(&mut out), 1);
        assert_eq!(out, [1.0]);
        assert_eq!(producer.push_samples(&[3.0, 4.0]), 1);
        let mut rest = [0.0; 4];
        assert_eq!(consumer.pop_samples(&mut rest), 2);
        assert_eq!(rest[..2], [2.0, 3.0]);
        assert_eq!(producer.push_samples(&[4.0]), 1);
        assert_eq!(consumer.pop_samples(&mut rest), 1);
        assert_eq!(rest[0], 4.0);
    }

    #[test]
    fn rejects_zero_capacity() {
        assert_eq!(
            bounded_pcm_queue(0, ChannelCount::new(2).unwrap()).err(),
            Some(PcmQueueBuildError::ZeroCapacity)
        );
    }

    #[test]
    fn finished_only_after_the_producer_finished_and_the_queue_drained() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(4, ChannelCount::new(1).unwrap()).unwrap();
        assert!(!consumer.is_finished(), "an empty queue is not finished");

        producer.push_samples(&[1.0, 2.0]);
        producer.finish();
        assert!(!consumer.is_finished(), "samples are still queued");

        let mut out = [0.0; 4];
        assert_eq!(consumer.pop_samples(&mut out), 2);
        assert!(consumer.is_finished());
    }

    #[test]
    fn a_full_queue_makes_the_producer_wait_until_the_consumer_pops() {
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2, ChannelCount::new(1).unwrap()).unwrap();
        let writer =
            std::thread::spawn(move || producer.write_all(&[1.0, 2.0, 3.0, 4.0], || false, |_| {}));

        std::thread::sleep(Duration::from_millis(20));
        let mut out = [0.0; 2];
        let mut collected = Vec::new();
        while collected.len() < 4 {
            let popped = consumer.pop_samples(&mut out);
            collected.extend_from_slice(&out[..popped]);
            std::thread::yield_now();
        }

        assert_eq!(writer.join().unwrap(), Ok(()));
        assert_eq!(collected, [1.0, 2.0, 3.0, 4.0]);
    }

    #[test]
    fn the_producer_wakes_at_most_three_times_per_two_seconds_consumed() {
        // A two second queue at 1 kHz, consumed in 10 ms callbacks for 4 s of audio.
        let (mut producer, mut consumer) =
            bounded_pcm_queue(2_000, ChannelCount::new(1).unwrap()).unwrap();
        let writer = std::thread::spawn(move || {
            let mut last = 0;
            let mut refills = 0;
            producer
                .write_all(
                    &vec![0.5; 4_000],
                    || false,
                    |queued| {
                        if queued > last {
                            refills += 1;
                        }
                        last = queued;
                    },
                )
                .map(|()| refills)
        });

        let mut out = [0.0; 10];
        let mut consumed = 0;
        while consumed < 4_000 {
            let popped = consumer.pop_samples(&mut out);
            consumed += popped;
            if popped == 0 {
                std::thread::yield_now();
            } else {
                std::thread::sleep(Duration::from_micros(200));
            }
        }

        // The first refill is the initial fill; the rest are wakes.
        let wakes = writer.join().unwrap().unwrap() - 1;
        assert!(wakes <= 6, "{wakes} wakes for 4 s consumed");
    }

    #[test]
    fn a_waiting_producer_is_released_by_cancellation_through_its_waker() {
        let (mut producer, _consumer) =
            bounded_pcm_queue(1, ChannelCount::new(1).unwrap()).unwrap();
        let waker = producer.waker();
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&cancelled);
        let writer = std::thread::spawn(move || {
            producer.write_all(&[1.0, 2.0], || flag.load(Ordering::SeqCst), |_| {})
        });

        std::thread::sleep(Duration::from_millis(20));
        cancelled.store(true, Ordering::SeqCst);
        waker.wake();

        assert_eq!(writer.join().unwrap(), Err(WaitCancelled));
    }
}
