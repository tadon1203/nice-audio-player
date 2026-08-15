use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use super::super::decoding::{DecodeCancellation, DecodeStep, StreamingDecoder};
use super::super::output::{AtomicProducerState, OutputSignal, OutputStreamId, ProducerState};
use super::super::output_processing::{OutputPcmProcessor, OutputProcessingError};
use super::super::pcm_queue::PcmProducer;

pub(crate) struct DecodeWorkerSetup {
    producer_state: Arc<AtomicProducerState>,
    capacity_sender: SyncSender<()>,
    capacity_receiver: Receiver<()>,
    prebuffer_sender: SyncSender<()>,
    prebuffer_receiver: Receiver<()>,
    cancellation: DecodeCancellation,
}

pub(crate) struct DecodeTaskInput {
    pub(crate) decoder: StreamingDecoder,
    pub(crate) first_packet: Vec<f32>,
    pub(crate) producer: PcmProducer,
    pub(crate) processor: OutputPcmProcessor,
    pub(crate) output_sample_rate: u32,
    pub(crate) signal_sender: SyncSender<OutputSignal>,
    pub(crate) stream_id: OutputStreamId,
    pub(crate) discard_output_samples: usize,
}

struct DecodeTask {
    decoder: StreamingDecoder,
    producer: PcmProducer,
    first_packet: Vec<f32>,
    converter: OutputPcmProcessor,
    discard_output_samples: usize,
    cancellation: DecodeCancellation,
    producer_state: Arc<AtomicProducerState>,
    signal_sender: SyncSender<OutputSignal>,
    stream_id: OutputStreamId,
    capacity_receiver: Receiver<()>,
    prebuffer_sender: SyncSender<()>,
    prebuffer_frames: usize,
}

impl DecodeWorkerSetup {
    pub(crate) fn new() -> Self {
        let (capacity_sender, capacity_receiver) = mpsc::sync_channel(1);
        let (prebuffer_sender, prebuffer_receiver) = mpsc::sync_channel(1);
        Self {
            producer_state: Arc::new(AtomicProducerState::new(ProducerState::Running)),
            capacity_sender,
            capacity_receiver,
            prebuffer_sender,
            prebuffer_receiver,
            cancellation: DecodeCancellation::default(),
        }
    }

    pub(crate) fn producer_state(&self) -> Arc<AtomicProducerState> {
        Arc::clone(&self.producer_state)
    }
    pub(crate) fn capacity_sender(&self) -> SyncSender<()> {
        self.capacity_sender.clone()
    }

    pub(crate) fn spawn(
        self,
        input: DecodeTaskInput,
    ) -> Result<DecodePipeline, OutputProcessingError> {
        let prebuffer_frames = prebuffer_frames(input.output_sample_rate);
        let task = DecodeTask {
            decoder: input.decoder,
            producer: input.producer,
            first_packet: input.first_packet,
            converter: input.processor,
            discard_output_samples: input.discard_output_samples,
            cancellation: self.cancellation.clone(),
            producer_state: Arc::clone(&self.producer_state),
            signal_sender: input.signal_sender,
            stream_id: input.stream_id,
            capacity_receiver: self.capacity_receiver,
            prebuffer_sender: self.prebuffer_sender,
            prebuffer_frames,
        };
        let join_handle = thread::spawn(move || task.run());
        Ok(DecodePipeline {
            worker: DecodeWorker {
                cancellation: self.cancellation,
                join_handle,
                wake_sender: self.capacity_sender,
            },
            producer_state: self.producer_state,
            prebuffer_receiver: self.prebuffer_receiver,
        })
    }
}

pub(crate) struct DecodePipeline {
    worker: DecodeWorker,
    producer_state: Arc<AtomicProducerState>,
    prebuffer_receiver: Receiver<()>,
}

impl DecodePipeline {
    pub(crate) fn producer_state(&self) -> ProducerState {
        self.producer_state.load()
    }
    pub(crate) fn prebuffer_ready(&self) -> bool {
        self.prebuffer_receiver.try_recv().is_ok()
    }
    pub(crate) fn cancel_and_join(self) {
        self.worker.cancel_and_join();
    }
    pub(crate) fn into_worker(self) -> DecodeWorker {
        self.worker
    }
}

pub(crate) struct DecodeWorker {
    cancellation: DecodeCancellation,
    join_handle: JoinHandle<()>,
    wake_sender: SyncSender<()>,
}

impl DecodeWorker {
    pub(crate) fn cancel_and_join(self) {
        self.cancellation.cancel();
        let _ = self.wake_sender.try_send(());
        let _ = self.join_handle.join();
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
    fn run(self) {
        let Self {
            mut decoder,
            mut producer,
            first_packet,
            mut converter,
            mut discard_output_samples,
            cancellation,
            producer_state,
            signal_sender,
            stream_id,
            capacity_receiver,
            prebuffer_sender,
            prebuffer_frames,
        } = self;
        let mut converted = Vec::new();
        let mut packet = Vec::new();
        let mut prebuffer_sent = false;
        if let Err(error) = converter.convert(&first_packet, &mut converted) {
            signal_failure(
                error,
                stream_id,
                &producer_state,
                &signal_sender,
                &prebuffer_sender,
            );
            return;
        }
        discard_output_prefix(&mut converted, &mut discard_output_samples);
        if write_packet_fully(
            &mut producer,
            &converted,
            &cancellation,
            &capacity_receiver,
            prebuffer_frames,
            &mut prebuffer_sent,
            &prebuffer_sender,
        )
        .is_cancelled()
        {
            producer_state.store(ProducerState::Cancelled);
            return;
        }
        notify_prebuffer_if_ready(
            &producer,
            prebuffer_frames,
            &mut prebuffer_sent,
            &prebuffer_sender,
        );
        loop {
            if cancellation.is_cancelled() {
                producer_state.store(ProducerState::Cancelled);
                return;
            }
            packet.clear();
            match decoder.decode_next(&mut packet) {
                Ok(DecodeStep::Samples) => {
                    if let Err(error) = converter.convert(&packet, &mut converted) {
                        signal_failure(
                            error,
                            stream_id,
                            &producer_state,
                            &signal_sender,
                            &prebuffer_sender,
                        );
                        return;
                    }
                    discard_output_prefix(&mut converted, &mut discard_output_samples);
                    if write_packet_fully(
                        &mut producer,
                        &converted,
                        &cancellation,
                        &capacity_receiver,
                        prebuffer_frames,
                        &mut prebuffer_sent,
                        &prebuffer_sender,
                    )
                    .is_cancelled()
                    {
                        producer_state.store(ProducerState::Cancelled);
                        return;
                    }
                    notify_prebuffer_if_ready(
                        &producer,
                        prebuffer_frames,
                        &mut prebuffer_sent,
                        &prebuffer_sender,
                    );
                }
                Ok(DecodeStep::EndOfStream) => {
                    let finalization = decoder.finalize();
                    if let Err(error) = converter.flush(&mut converted) {
                        signal_failure(
                            error,
                            stream_id,
                            &producer_state,
                            &signal_sender,
                            &prebuffer_sender,
                        );
                        return;
                    }
                    discard_output_prefix(&mut converted, &mut discard_output_samples);
                    if write_packet_fully(
                        &mut producer,
                        &converted,
                        &cancellation,
                        &capacity_receiver,
                        prebuffer_frames,
                        &mut prebuffer_sent,
                        &prebuffer_sender,
                    )
                    .is_cancelled()
                    {
                        producer_state.store(ProducerState::Cancelled);
                        return;
                    }
                    let _ = prebuffer_sender.try_send(());
                    match finalization {
                        Ok(()) => producer_state.store(ProducerState::EndOfStream),
                        Err(_) => {
                            producer_state.store(ProducerState::DecodeFailed);
                            let _ =
                                signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
                        }
                    }
                    return;
                }
                Err(_) => {
                    producer_state.store(ProducerState::DecodeFailed);
                    let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
                    let _ = prebuffer_sender.try_send(());
                    return;
                }
            }
        }
    }
}

fn signal_failure(
    error: OutputProcessingError,
    stream_id: OutputStreamId,
    state: &Arc<AtomicProducerState>,
    signals: &SyncSender<OutputSignal>,
    prebuffer: &SyncSender<()>,
) {
    let (producer_state, signal) = match error {
        OutputProcessingError::ResamplerProcessingFailed
        | OutputProcessingError::InvalidResamplerOutput
        | OutputProcessingError::ResamplerConstructionFailed => (
            ProducerState::SampleRateConversionFailed,
            OutputSignal::SampleRateConversionFailed { stream_id },
        ),
        _ => (
            ProducerState::DecodeFailed,
            OutputSignal::DecodeFailed { stream_id },
        ),
    };
    state.store(producer_state);
    let _ = signals.try_send(signal);
    let _ = prebuffer.try_send(());
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

enum QueueWriteResult {
    Completed,
    Cancelled,
}
impl QueueWriteResult {
    fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }
}

fn write_packet_fully(
    producer: &mut PcmProducer,
    samples: &[f32],
    cancellation: &DecodeCancellation,
    capacity_receiver: &Receiver<()>,
    prebuffer_frames: usize,
    prebuffer_sent: &mut bool,
    prebuffer_sender: &SyncSender<()>,
) -> QueueWriteResult {
    let mut offset = 0;
    while offset < samples.len() {
        if cancellation.is_cancelled() {
            return QueueWriteResult::Cancelled;
        }
        let pushed = producer.push_samples(&samples[offset..]);
        offset += pushed;
        notify_prebuffer_if_ready(producer, prebuffer_frames, prebuffer_sent, prebuffer_sender);
        if pushed == 0 {
            let _ = capacity_receiver.recv_timeout(Duration::from_millis(10));
        }
    }
    QueueWriteResult::Completed
}

fn notify_prebuffer_if_ready(
    producer: &PcmProducer,
    prebuffer_frames: usize,
    prebuffer_sent: &mut bool,
    prebuffer_sender: &SyncSender<()>,
) {
    if !*prebuffer_sent && producer.available_frames() >= prebuffer_frames {
        *prebuffer_sent = true;
        let _ = prebuffer_sender.try_send(());
    }
}

#[cfg(test)]
mod tests {
    use super::{prebuffer_frames, signal_failure, DecodeTaskInput, DecodeWorkerSetup};
    use crate::audio::decoding::open_playback_decoder;
    use crate::audio::output::{OutputSignal, OutputStreamId, ProducerState};
    use crate::audio::output_processing::{OutputPcmProcessor, OutputProcessingError};
    use crate::audio::pcm_queue::bounded_pcm_queue;
    use crate::media::validation::ValidatedAudioFile;
    use crate::test_support::{write_pcm_i16_wav, TestDirectory};
    use std::sync::{mpsc, Arc};
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

    fn wait_until(mut ready: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut completed = false;
        while Instant::now() < deadline {
            if ready() {
                completed = true;
                break;
            }
            std::thread::yield_now();
        }
        assert!(completed, "decode worker did not reach the expected state");
    }

    fn start_pipeline(
        file: &ValidatedAudioFile,
        capacity_frames: usize,
    ) -> (
        super::DecodePipeline,
        Arc<crate::audio::output::AtomicProducerState>,
        crate::audio::pcm_queue::PcmConsumer,
    ) {
        let decoder = open_playback_decoder(file).unwrap();
        let spec = decoder.spec();
        let mut first_packet = Vec::new();
        assert!(decoder.duration_ms().is_some());
        let mut decoder = decoder;
        assert!(matches!(
            decoder.decode_next(&mut first_packet),
            Ok(crate::audio::decoding::DecodeStep::Samples)
        ));
        let plan = crate::audio::output_processing::OutputProcessingPlan::new(spec, spec).unwrap();
        let (producer, consumer) =
            bounded_pcm_queue(capacity_frames, spec.channel_count()).unwrap();
        let (signals, _signals_receiver) = mpsc::sync_channel(4);
        let setup = DecodeWorkerSetup::new();
        let state = setup.producer_state();
        let pipeline = setup
            .spawn(DecodeTaskInput {
                decoder,
                first_packet,
                producer,
                processor: OutputPcmProcessor::new(plan).unwrap(),
                output_sample_rate: spec.sample_rate().get(),
                signal_sender: signals,
                stream_id: OutputStreamId(1),
                discard_output_samples: 0,
            })
            .unwrap();
        (pipeline, state, consumer)
    }

    #[test]
    fn calculates_the_existing_quarter_second_threshold() {
        assert_eq!(prebuffer_frames(44_100), 11_025);
    }

    #[test]
    fn normal_prebuffer_completion_reports_ready_with_decoded_samples() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 20_000);
        let (pipeline, state, consumer) = start_pipeline(&file, 12_000);
        wait_until(|| pipeline.prebuffer_ready());
        assert!(consumer.available_frames() >= prebuffer_frames(44_100));
        assert!(matches!(
            state.load(),
            ProducerState::Running | ProducerState::EndOfStream
        ));
        pipeline.cancel_and_join();
    }

    #[test]
    fn short_file_releases_prebuffer_wait_at_end_of_stream() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 1_000);
        let (pipeline, state, _consumer) = start_pipeline(&file, 2_000);
        wait_until(|| {
            matches!(state.load(), ProducerState::EndOfStream) && pipeline.prebuffer_ready()
        });
        pipeline.cancel_and_join();
    }

    #[test]
    fn cancellation_while_waiting_for_capacity_marks_worker_cancelled() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 20_000);
        let (pipeline, state, consumer) = start_pipeline(&file, 8);
        wait_until(|| consumer.available_frames() == 8 && state.load() == ProducerState::Running);
        pipeline.cancel_and_join();
        assert_eq!(state.load(), ProducerState::Cancelled);
    }

    #[test]
    fn classifies_resampler_failures_with_the_original_stream_id() {
        let state = Arc::new(crate::audio::output::AtomicProducerState::new(
            ProducerState::Running,
        ));
        let (signals, receiver) = mpsc::sync_channel(1);
        let (prebuffer, _) = mpsc::sync_channel(1);
        signal_failure(
            OutputProcessingError::InvalidResamplerOutput,
            OutputStreamId(9),
            &state,
            &signals,
            &prebuffer,
        );
        assert_eq!(state.load(), ProducerState::SampleRateConversionFailed);
        assert!(matches!(
            receiver.try_recv(),
            Ok(OutputSignal::SampleRateConversionFailed {
                stream_id: OutputStreamId(9)
            })
        ));
    }

    #[test]
    fn classifies_non_resampler_failures_as_decode_failures() {
        let state = Arc::new(crate::audio::output::AtomicProducerState::new(
            ProducerState::Running,
        ));
        let (signals, receiver) = mpsc::sync_channel(1);
        let (prebuffer, _) = mpsc::sync_channel(1);
        signal_failure(
            OutputProcessingError::InvalidInputSamples,
            OutputStreamId(4),
            &state,
            &signals,
            &prebuffer,
        );
        assert_eq!(state.load(), ProducerState::DecodeFailed);
        assert!(matches!(
            receiver.try_recv(),
            Ok(OutputSignal::DecodeFailed {
                stream_id: OutputStreamId(4)
            })
        ));
    }
}
