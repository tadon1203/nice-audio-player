//! A decode thread: decodes a source, converts the samples, and fills the PCM queue, reporting to
//! the worker's inbox.

use std::panic::AssertUnwindSafe;
use std::thread;

use super::input::{Inbox, WorkerEvent};
use crate::audio::decode::{DecodeStep, StreamingDecoder};
use crate::audio::output::{PcmProducer, PcmWaker, PipelineId, WaitCancelled};
use crate::audio::processing::{OutputProcessingError, PcmConverter};
use crate::errors::contain;
use crate::threads::Cancellation;

/// Why a decode task ended without reaching the end of the stream.
#[derive(Debug, PartialEq, Eq)]
enum Stop {
    Cancelled,
    Decode,
    Conversion,
}

impl From<OutputProcessingError> for Stop {
    fn from(error: OutputProcessingError) -> Self {
        match error {
            OutputProcessingError::ResamplerProcessingFailed
            | OutputProcessingError::InvalidResamplerOutput
            | OutputProcessingError::ResamplerConstructionFailed => Self::Conversion,
            _ => Self::Decode,
        }
    }
}

/// One decode thread: it decodes a source, converts the samples, and fills the PCM queue. The task
/// owns its input and moves it to its thread when it spawns.
pub(super) struct DecodeTask {
    pub(super) decoder: StreamingDecoder,
    pub(super) first_packet: Vec<f32>,
    pub(super) producer: PcmProducer,
    pub(super) converter: PcmConverter,
    pub(super) converted: Vec<f32>,
    pub(super) discard_output_samples: usize,
    pub(super) cancellation: Cancellation,
    pub(super) inbox: Inbox,
    pub(super) pipeline: PipelineId,
    pub(super) prebuffer_frames: usize,
    pub(super) prebuffer_sent: bool,
}

/// The playback worker's handle on a decode thread: how to stop it, and how to wake it.
pub(crate) struct DecodeWorker {
    cancellation: Cancellation,
    waker: PcmWaker,
}

impl DecodeWorker {
    /// Stops the decode thread without waiting for it: a read stalled on a network path must
    /// not block the playback worker. Whatever the thread still reports is ignored by pipeline
    /// id.
    pub(crate) fn cancel(self) {
        self.cancellation.cancel();
        self.waker.wake();
    }
}

impl DecodeTask {
    /// Starts the thread. The thread is detached: nothing waits for it, and `cancel` stops it.
    pub(super) fn spawn(self) -> DecodeWorker {
        let worker = DecodeWorker {
            cancellation: self.cancellation.clone(),
            waker: self.producer.waker(),
        };
        thread::Builder::new()
            .name("decode".into())
            .spawn(move || self.run_contained())
            .expect("decode thread spawns");
        worker
    }
}

pub(super) fn prebuffer_frames(sample_rate: u32) -> usize {
    usize::try_from(sample_rate)
        .unwrap_or(usize::MAX)
        .saturating_mul(250)
        .checked_div(1_000)
        .unwrap_or(usize::MAX)
        .max(1)
}

impl DecodeTask {
    /// A decoder that panics on a bad file fails that playback, not the app.
    fn run_contained(self) {
        let (inbox, pipeline) = (self.inbox.clone(), self.pipeline);
        if contain("decode", AssertUnwindSafe(move || self.run())).is_err() {
            inbox.event(WorkerEvent::DecodeFailed { pipeline });
        }
    }

    fn run(mut self) {
        match self.decode_to_end() {
            Ok(()) => self.producer.finish(),
            Err(Stop::Cancelled) => {}
            Err(Stop::Decode) => self.inbox.event(WorkerEvent::DecodeFailed {
                pipeline: self.pipeline,
            }),
            Err(Stop::Conversion) => self.inbox.event(WorkerEvent::ConversionFailed {
                pipeline: self.pipeline,
            }),
        }
    }

    fn decode_to_end(&mut self) -> Result<(), Stop> {
        let first_packet = std::mem::take(&mut self.first_packet);
        self.process(&first_packet)?;
        let mut packet = Vec::new();
        loop {
            if self.cancellation.is_cancelled() {
                return Err(Stop::Cancelled);
            }
            packet.clear();
            match self.decoder.decode_next(&mut packet) {
                Ok(DecodeStep::Samples) => self.process(&packet)?,
                Ok(DecodeStep::EndOfStream) => {
                    self.converter.flush(&mut self.converted)?;
                    self.write_converted()?;
                    // A file shorter than the prebuffer is as ready as it will get.
                    notify_prebuffer(&self.inbox, self.pipeline, &mut self.prebuffer_sent, true);
                    return Ok(());
                }
                Err(_) => return Err(Stop::Decode),
            }
        }
    }

    fn process(&mut self, packet: &[f32]) -> Result<(), Stop> {
        self.converter.convert(packet, &mut self.converted)?;
        self.write_converted()
    }

    fn write_converted(&mut self) -> Result<(), Stop> {
        discard_output_prefix(&mut self.converted, &mut self.discard_output_samples);
        let cancellation = &self.cancellation;
        let inbox = &self.inbox;
        let (pipeline, frames) = (self.pipeline, self.prebuffer_frames);
        let sent = &mut self.prebuffer_sent;
        self.producer
            .write_all(
                &self.converted,
                || cancellation.is_cancelled(),
                |queued| notify_prebuffer(inbox, pipeline, sent, queued >= frames),
            )
            // A cancelled wait is a normal stop, not a failure, so its cause is not logged.
            .map_err(|WaitCancelled| Stop::Cancelled)
    }
}

fn notify_prebuffer(inbox: &Inbox, pipeline: PipelineId, sent: &mut bool, ready: bool) {
    if ready && !*sent {
        *sent = true;
        inbox.event(WorkerEvent::PrebufferReady { pipeline });
    }
}

fn discard_output_prefix(samples: &mut Vec<f32>, remaining_samples: &mut usize) {
    let discarded = samples.len().min(*remaining_samples);
    if discarded == 0 {
        return;
    }
    samples.copy_within(discarded.., 0);
    samples.truncate(samples.len() - discarded);
    *remaining_samples -= discarded;
}

#[cfg(test)]
mod tests {
    use super::{DecodeTask, DecodeWorker, Stop, prebuffer_frames};
    use crate::audio::decode::{CompressedAudioSource, DecodeStep};
    use crate::audio::output::PipelineId;
    use crate::audio::output::{PcmConsumer, bounded_pcm_queue};
    use crate::audio::playback::input::{Inbox, WorkerEvent, WorkerInput};
    use crate::audio::processing::{OutputProcessingError, OutputProcessingPlan, PcmConverter};
    use crate::library::media::ValidatedAudioFile;
    use crate::test_support::{TestDirectory, write_pcm_i16_wav};
    use crate::threads::Cancellation;
    use std::sync::mpsc::{Receiver, RecvTimeoutError};
    use std::time::{Duration, Instant};

    fn wav_file(directory: &TestDirectory, sample_count: usize) -> ValidatedAudioFile {
        let path = directory.file("decode-worker.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &vec![0; sample_count]);
        ValidatedAudioFile {
            path,
            file_name: "decode-worker.wav".into(),
            extension: "wav".into(),
        }
    }

    fn start_pipeline(
        file: &ValidatedAudioFile,
        capacity_frames: usize,
    ) -> (DecodeWorker, PcmConsumer, Receiver<WorkerInput>) {
        let mut decoder = CompressedAudioSource::open(file, &Cancellation::default())
            .unwrap()
            .decoder()
            .unwrap();
        let spec = decoder.spec();
        let mut first_packet = Vec::new();
        assert!(matches!(
            decoder.decode_next(&mut first_packet),
            Ok(DecodeStep::Samples)
        ));
        let plan = OutputProcessingPlan::new(spec, spec).unwrap();
        let (producer, consumer) =
            bounded_pcm_queue(capacity_frames, spec.channel_count()).unwrap();
        let (inbox, events) = Inbox::channel();
        let worker = DecodeTask {
            decoder,
            first_packet,
            producer,
            converter: PcmConverter::new(plan).unwrap(),
            converted: Vec::new(),
            discard_output_samples: 0,
            cancellation: Cancellation::default(),
            inbox,
            pipeline: PipelineId(7),
            prebuffer_frames: prebuffer_frames(spec.sample_rate().get()),
            prebuffer_sent: false,
        }
        .spawn();
        (worker, consumer, events)
    }

    fn next_event(events: &Receiver<WorkerInput>) -> WorkerEvent {
        match events.recv_timeout(Duration::from_secs(2)) {
            Ok(WorkerInput::Event(event)) => event,
            _ => panic!("the decode worker sent no event"),
        }
    }

    #[test]
    fn calculates_the_existing_quarter_second_threshold() {
        assert_eq!(prebuffer_frames(44_100), 11_025);
    }

    #[test]
    fn reports_the_prebuffer_once_it_holds_a_quarter_second() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 20_000);
        let (worker, consumer, events) = start_pipeline(&file, 12_000);

        assert!(matches!(
            next_event(&events),
            WorkerEvent::PrebufferReady {
                pipeline: PipelineId(7)
            }
        ));
        assert!(consumer.available_frames(1) >= prebuffer_frames(44_100));
        worker.cancel();
    }

    #[test]
    fn a_short_file_is_ready_at_its_end_and_the_queue_reports_finished() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 1_000);
        let (worker, mut consumer, events) = start_pipeline(&file, 2_000);

        assert!(matches!(
            next_event(&events),
            WorkerEvent::PrebufferReady { .. }
        ));
        let deadline = Instant::now() + Duration::from_secs(2);
        while consumer.available_frames(1) < 1_000 && Instant::now() < deadline {
            std::thread::yield_now();
        }
        let mut out = [0.0; 2_000];
        assert!(!consumer.is_finished(), "samples are still queued");
        assert_eq!(consumer.pop_samples(&mut out), 1_000);
        let deadline = Instant::now() + Duration::from_secs(2);
        while !consumer.is_finished() && Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert!(consumer.is_finished());
        worker.cancel();
    }

    #[test]
    fn cancellation_releases_a_producer_waiting_for_capacity() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 20_000);
        let (worker, consumer, events) = start_pipeline(&file, 8);

        // Prebuffering a quarter second is impossible in an 8 frame queue; the producer waits.
        let deadline = Instant::now() + Duration::from_secs(2);
        while consumer.available_frames(1) < 8 && Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert_eq!(consumer.available_frames(1), 8);
        worker.cancel();

        // The thread ends by itself and drops its inbox: a cancelled worker reports nothing.
        assert!(
            matches!(
                events.recv_timeout(Duration::from_secs(2)),
                Err(RecvTimeoutError::Disconnected)
            ),
            "a cancelled worker reports nothing and ends"
        );
    }

    #[test]
    fn classifies_resampler_failures_as_conversion_failures() {
        assert_eq!(
            Stop::from(OutputProcessingError::InvalidResamplerOutput),
            Stop::Conversion
        );
        assert_eq!(
            Stop::from(OutputProcessingError::ResamplerProcessingFailed),
            Stop::Conversion
        );
    }

    #[test]
    fn classifies_other_processing_failures_as_decode_failures() {
        assert_eq!(
            Stop::from(OutputProcessingError::InvalidInputSamples),
            Stop::Decode
        );
    }
}
