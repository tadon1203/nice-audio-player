//! The decode thread of one pipeline: decodes, converts and feeds the PCM queue, and tells the
//! worker when the prebuffer is ready or decoding failed. End of stream is declared on the queue.

use log::error;
use std::thread::{self, JoinHandle};

use super::input::{Inbox, WorkerEvent};
use crate::audio::cancellation::Cancellation;
use crate::audio::decoding::{DecodeStep, StreamingDecoder};
use crate::audio::output::OutputStreamId;
use crate::audio::output_processing::{OutputPcmProcessor, OutputProcessingError};
use crate::audio::pcm_queue::{PcmProducer, PcmWaker};

pub(crate) struct DecodeTaskInput {
    pub(crate) decoder: StreamingDecoder,
    pub(crate) first_packet: Vec<f32>,
    pub(crate) producer: PcmProducer,
    pub(crate) processor: OutputPcmProcessor,
    pub(crate) output_sample_rate: u32,
    pub(crate) discard_output_samples: usize,
}

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

struct DecodeTask {
    producer: PcmProducer,
    first_packet: Vec<f32>,
    converter: OutputPcmProcessor,
    converted: Vec<f32>,
    discard_output_samples: usize,
    cancellation: Cancellation,
    inbox: Inbox,
    stream: OutputStreamId,
    prebuffer_frames: usize,
    prebuffer_sent: bool,
}

pub(crate) struct DecodeWorker {
    cancellation: Cancellation,
    join_handle: JoinHandle<()>,
    waker: PcmWaker,
    stream: OutputStreamId,
}

impl DecodeWorker {
    pub(super) fn spawn(input: DecodeTaskInput, inbox: Inbox, stream: OutputStreamId) -> Self {
        let cancellation = Cancellation::default();
        let waker = input.producer.waker();
        let decoder = input.decoder;
        let task = DecodeTask {
            producer: input.producer,
            first_packet: input.first_packet,
            converter: input.processor,
            converted: Vec::new(),
            discard_output_samples: input.discard_output_samples,
            cancellation: cancellation.clone(),
            inbox,
            stream,
            prebuffer_frames: prebuffer_frames(input.output_sample_rate),
            prebuffer_sent: false,
        };
        Self {
            cancellation,
            join_handle: thread::spawn(move || task.run(decoder)),
            waker,
            stream,
        }
    }

    pub(crate) fn cancel_and_join(self) {
        self.cancellation.cancel();
        self.waker.wake();
        if self.join_handle.join().is_err() {
            error!(
                "playback.decode_worker_panicked stream_id={}",
                self.stream.0
            );
        }
    }
}

fn prebuffer_frames(sample_rate: u32) -> usize {
    usize::try_from(sample_rate)
        .unwrap_or(usize::MAX)
        .saturating_mul(250)
        .checked_div(1_000)
        .unwrap_or(usize::MAX)
        .max(1)
}

impl DecodeTask {
    fn run(mut self, decoder: StreamingDecoder) {
        match self.decode_to_end(decoder) {
            Ok(()) => self.producer.finish(),
            Err(Stop::Cancelled) => {}
            Err(Stop::Decode) => self.report_failure(WorkerEvent::DecodeFailed {
                stream: self.stream,
            }),
            Err(Stop::Conversion) => self.report_failure(WorkerEvent::ConversionFailed {
                stream: self.stream,
            }),
        }
    }

    fn decode_to_end(&mut self, mut decoder: StreamingDecoder) -> Result<(), Stop> {
        let first_packet = std::mem::take(&mut self.first_packet);
        self.process(&first_packet)?;
        let mut packet = Vec::new();
        loop {
            if self.cancellation.is_cancelled() {
                return Err(Stop::Cancelled);
            }
            packet.clear();
            match decoder.decode_next(&mut packet) {
                Ok(DecodeStep::Samples) => self.process(&packet)?,
                Ok(DecodeStep::EndOfStream) => {
                    let finalization = decoder.finalize();
                    self.converter.flush(&mut self.converted)?;
                    self.write_converted()?;
                    // A file shorter than the prebuffer is as ready as it will get.
                    self.notify_prebuffer(true);
                    return finalization.map_err(|_| Stop::Decode);
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
        let (stream, frames) = (self.stream, self.prebuffer_frames);
        let sent = &mut self.prebuffer_sent;
        self.producer
            .write_all(
                &self.converted,
                || cancellation.is_cancelled(),
                |queued| notify_prebuffer(inbox, stream, sent, queued >= frames),
            )
            .map_err(|_| Stop::Cancelled)
    }

    fn notify_prebuffer(&mut self, ready: bool) {
        notify_prebuffer(&self.inbox, self.stream, &mut self.prebuffer_sent, ready);
    }

    fn report_failure(&self, event: WorkerEvent) {
        self.inbox.event(event);
    }
}

fn notify_prebuffer(inbox: &Inbox, stream: OutputStreamId, sent: &mut bool, ready: bool) {
    if ready && !*sent {
        *sent = true;
        inbox.event(WorkerEvent::PrebufferReady { stream });
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
    use super::{prebuffer_frames, DecodeTaskInput, DecodeWorker, Stop};
    use crate::audio::cancellation::Cancellation;
    use crate::audio::compressed_source::prepare_compressed_source;
    use crate::audio::output::OutputStreamId;
    use crate::audio::output_processing::{
        OutputPcmProcessor, OutputProcessingError, OutputProcessingPlan,
    };
    use crate::audio::pcm_queue::{bounded_pcm_queue, PcmConsumer};
    use crate::audio::playback::input::{Inbox, WorkerEvent, WorkerInput};
    use crate::media::validation::ValidatedAudioFile;
    use crate::test_support::{write_pcm_i16_wav, TestDirectory};
    use std::sync::mpsc::Receiver;
    use std::time::{Duration, Instant};

    fn wav_file(directory: &TestDirectory, sample_count: usize) -> ValidatedAudioFile {
        let path = directory.file("decode-worker.wav");
        write_pcm_i16_wav(&path, 44_100, 1, &vec![0; sample_count]);
        ValidatedAudioFile {
            path: path.to_string_lossy().into_owned(),
            file_name: "decode-worker.wav".into(),
            extension: "wav".into(),
        }
    }

    fn start_pipeline(
        file: &ValidatedAudioFile,
        capacity_frames: usize,
    ) -> (DecodeWorker, PcmConsumer, Receiver<WorkerInput>) {
        let mut decoder = prepare_compressed_source(file, &Cancellation::default())
            .unwrap()
            .open_decoder(&file.extension)
            .unwrap();
        let spec = decoder.spec();
        let mut first_packet = Vec::new();
        assert!(matches!(
            decoder.decode_next(&mut first_packet),
            Ok(crate::audio::decoding::DecodeStep::Samples)
        ));
        let plan = OutputProcessingPlan::new(spec, spec).unwrap();
        let (producer, consumer) =
            bounded_pcm_queue(capacity_frames, spec.channel_count()).unwrap();
        let (inbox, events) = Inbox::channel();
        let worker = DecodeWorker::spawn(
            DecodeTaskInput {
                decoder,
                first_packet,
                producer,
                processor: OutputPcmProcessor::new(plan).unwrap(),
                output_sample_rate: spec.sample_rate().get(),
                discard_output_samples: 0,
            },
            inbox,
            OutputStreamId(7),
        );
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
                stream: OutputStreamId(7)
            }
        ));
        assert!(consumer.available_frames(1) >= prebuffer_frames(44_100));
        worker.cancel_and_join();
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
        worker.cancel_and_join();
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
        worker.cancel_and_join();

        assert!(
            events.try_recv().is_err(),
            "a cancelled worker reports nothing"
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
