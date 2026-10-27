//! Turning a file into samples: the load thread that opens the file and its decoder, and the
//! decode thread that fills a PCM queue from them.

use std::panic::AssertUnwindSafe;
use std::sync::mpsc::Sender;
use std::thread;

use super::state::PlaybackFailureCode;
use super::worker::{WorkerInput, send};
use crate::errors::contain;
use crate::library::sync::media::ValidatedAudioFile;
use crate::player::decode::{CompressedAudioSource, DecodeError, DecodeStep, StreamingDecoder};
use crate::player::output::{OutputError, PcmProducer, PcmWaker, PipelineId, WaitCancelled};
use crate::player::pcm::{millis_to_frame, rescale_frame};
use crate::player::processing::{OutputProcessingError, OutputProcessingPlan, PcmConverter};
use crate::threads::Cancellation;

/// Identifies one source load, so a late result from a load that was replaced is told apart.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SourceLoadId(pub(super) u64);

#[derive(Debug, Copy, Clone)]
pub(super) enum PipelineError {
    SourceOpen,
    DecoderOpen,
    /// The file no longer has the format the output was prepared for.
    SpecChanged,
    FirstPacketDecode,
    SeekFailed,
    /// The decoder failed after the first packet.
    Decode,
    /// The sample rate conversion failed after the first packet.
    Conversion,
    ProcessorCreate,
    /// The output could not take the decoded samples.
    Output(OutputError),
}

impl PipelineError {
    pub(super) fn code(self) -> PlaybackFailureCode {
        match self {
            Self::Output(error) => error.code(),
            Self::SourceOpen
            | Self::DecoderOpen
            | Self::SpecChanged
            | Self::FirstPacketDecode
            | Self::SeekFailed
            | Self::Decode
            | Self::ProcessorCreate
            | Self::Conversion => PlaybackFailureCode::DecodeFailed,
        }
    }
}

/// Where a load starts reading, and the processing it is checked against.
#[derive(Debug, Copy, Clone)]
pub(super) enum LoadPosition {
    /// From the beginning of the file, for a start.
    Start,
    /// From the beginning, for the track that follows the playing one. The file must have the
    /// format `plan` was made for, or the stream cannot play it gaplessly.
    Prefetch { plan: OutputProcessingPlan },
    /// From `target_ms`, for a seek within the playing track.
    Seek {
        target_ms: u64,
        plan: OutputProcessingPlan,
    },
}

/// A file opened and positioned, with its first samples decoded. Everything the worker needs
/// to start a decode thread for it.
pub(super) struct PreparedSource {
    pub decoder: StreamingDecoder,
    pub first_packet: Vec<f32>,
    pub duration_ms: Option<u64>,
    /// Output frames at the head of the first packet that lie before the requested position.
    pub discard_output_frames: u64,
    /// The output frame the first decoded sample belongs to.
    pub start_output_frame: u64,
}

/// Dropping a load cancels it. A load that is cancelled, or replaced, still reports; the worker
/// ignores the result by id.
pub(super) struct SourceLoad {
    pub id: SourceLoadId,
    cancellation: Cancellation,
}

impl SourceLoad {
    /// Starts loading `file` at `position`. The thread is detached: the worker never waits for it.
    /// Panics if the OS cannot start the thread.
    pub(super) fn spawn(
        file: ValidatedAudioFile,
        id: SourceLoadId,
        position: LoadPosition,
        inbox: Sender<WorkerInput>,
    ) -> Self {
        // A stalled network read must not block the worker, so the thread is never joined.
        // Cancellation is the only way to stop it early, and a stopped load reports nothing.
        let cancellation = Cancellation::default();
        let worker_cancellation = cancellation.clone();
        thread::Builder::new()
            .name("audio-source-load".into())
            .spawn(move || {
                let result = contain("playback.source_load", || {
                    prepare(&file, position, &worker_cancellation)
                })
                .unwrap_or(Err(PipelineError::SourceOpen));
                let _ = inbox.send(WorkerInput::Load(LoadEvent::SourceReady { id, result }));
            })
            .expect("the OS starts a thread unless it is out of resources");
        Self { id, cancellation }
    }
}

impl Drop for SourceLoad {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

/// What the threads that read and decode a file report to the worker.
pub(super) enum LoadEvent {
    /// A file's load is done, or failed.
    SourceReady {
        id: SourceLoadId,
        result: Result<PreparedSource, PipelineError>,
    },
    /// A decode has enough samples queued to start playing.
    PrebufferReady { pipeline: PipelineId },
    /// A decode thread failed; its pipeline is dead.
    DecodeFailed {
        pipeline: PipelineId,
        error: PipelineError,
    },
}

/// Opens `file` and does the work of `position` on it.
fn prepare(
    file: &ValidatedAudioFile,
    position: LoadPosition,
    cancellation: &Cancellation,
) -> Result<PreparedSource, PipelineError> {
    #[cfg(test)]
    gate::wait_if_gated(file);
    let source = CompressedAudioSource::open(file, cancellation)
        .inspect_err(|cause| log::warn!("pipeline.source.open cause={cause}"))
        .ok()
        .ok_or(PipelineError::SourceOpen)?;
    let mut decoder = source
        .decoder()
        .inspect_err(|cause| log::warn!("pipeline.source.decoder_open cause={cause}"))
        .ok()
        .ok_or(PipelineError::DecoderOpen)?;
    match position {
        LoadPosition::Start => from_the_beginning(decoder),
        LoadPosition::Prefetch { plan } => {
            if decoder.spec() != plan.source() {
                return Err(PipelineError::SpecChanged);
            }
            from_the_beginning(decoder)
        }
        LoadPosition::Seek { target_ms, plan } => {
            if decoder.spec() != plan.source() {
                return Err(PipelineError::SpecChanged);
            }
            let source_rate = plan.source().sample_rate().get();
            let output_rate = plan.output().sample_rate().get();
            let target_source_frame = millis_to_frame(target_ms, source_rate);
            let converter = PcmConverter::new(plan)
                .inspect_err(|cause| log::warn!("pipeline.seek.converter cause={cause}"))
                .ok()
                .ok_or(PipelineError::ProcessorCreate)?;
            let preroll_frames = converter.seek_preroll_frames(target_source_frame);
            let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames)
            {
                Ok(seek) if !seek.first_packet.is_empty() => seek,
                Err(DecodeError::SeekFailed) => return Err(PipelineError::SeekFailed),
                Ok(_) | Err(_) => return Err(PipelineError::FirstPacketDecode),
            };
            let duration_ms = decoder.duration_ms();
            Ok(PreparedSource {
                decoder,
                first_packet: seek.first_packet,
                duration_ms,
                discard_output_frames: rescale_frame(
                    seek.confirmed_source_frame
                        .saturating_sub(seek.preroll_source_frame),
                    output_rate,
                    source_rate,
                ),
                start_output_frame: rescale_frame(
                    seek.confirmed_source_frame,
                    output_rate,
                    source_rate,
                ),
            })
        }
    }
}

fn from_the_beginning(mut decoder: StreamingDecoder) -> Result<PreparedSource, PipelineError> {
    let mut first_packet = Vec::new();
    match decoder.decode_next(&mut first_packet) {
        Ok(DecodeStep::Samples) => {}
        Ok(DecodeStep::EndOfStream) | Err(_) => return Err(PipelineError::FirstPacketDecode),
    }
    Ok(PreparedSource {
        duration_ms: decoder.duration_ms(),
        decoder,
        first_packet,
        discard_output_frames: 0,
        start_output_frame: 0,
    })
}

/// A decode thread and how to stop it. Dropping it stops the thread: see `DecodeHandle`.
pub(super) struct Pipeline {
    pub id: PipelineId,
    /// Dropped with the pipeline, which stops the decode thread.
    _decode: DecodeHandle,
}

/// Starts the decode thread that fills `producer` from `prepared`, through `converter`.
pub(super) fn start_decoding(
    inbox: &Sender<WorkerInput>,
    id: PipelineId,
    prepared: PreparedSource,
    producer: PcmProducer,
    converter: PcmConverter,
    plan: OutputProcessingPlan,
) -> Pipeline {
    let discard_output_samples = usize::try_from(prepared.discard_output_frames)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(plan.output().channel_count().get()));
    let decode = DecodeTask {
        decoder: prepared.decoder,
        first_packet: prepared.first_packet,
        producer,
        converter,
        converted: Vec::new(),
        discard_output_samples,
        cancellation: Cancellation::default(),
        inbox: inbox.clone(),
        pipeline: id,
        prebuffer_frames: prebuffer_frames(plan.output().sample_rate().get()),
        prebuffer_sent: false,
    }
    .spawn();
    Pipeline {
        id,
        _decode: decode,
    }
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

/// One decode thread: it decodes a source, converts the samples, and fills the PCM queue. The task
/// owns its input and moves it to its thread when it spawns.
struct DecodeTask {
    decoder: StreamingDecoder,
    first_packet: Vec<f32>,
    producer: PcmProducer,
    converter: PcmConverter,
    converted: Vec<f32>,
    discard_output_samples: usize,
    cancellation: Cancellation,
    inbox: Sender<WorkerInput>,
    pipeline: PipelineId,
    prebuffer_frames: usize,
    prebuffer_sent: bool,
}

/// The worker's handle on a decode thread. Dropping it stops the thread without waiting for it: a
/// read stalled on a network path must not block the playback worker. Whatever the thread still
/// reports is ignored by pipeline id.
struct DecodeHandle {
    cancellation: Cancellation,
    waker: PcmWaker,
}

impl Drop for DecodeHandle {
    fn drop(&mut self) {
        self.cancellation.cancel();
        self.waker.wake();
    }
}

impl DecodeTask {
    /// Starts the thread. The thread is detached: nothing waits for it, and dropping the handle
    /// stops it. Panics if the OS cannot start the thread.
    fn spawn(self) -> DecodeHandle {
        let worker = DecodeHandle {
            cancellation: self.cancellation.clone(),
            waker: self.producer.waker(),
        };
        thread::Builder::new()
            .name("decode".into())
            .spawn(move || self.run_contained())
            .expect("the OS starts a thread unless it is out of resources");
        worker
    }

    /// A decoder that panics on a bad file fails that playback, not the app.
    fn run_contained(self) {
        let (inbox, pipeline) = (self.inbox.clone(), self.pipeline);
        if contain("decode", AssertUnwindSafe(move || self.run())).is_err() {
            send(
                &inbox,
                WorkerInput::Load(LoadEvent::DecodeFailed {
                    pipeline,
                    error: PipelineError::Decode,
                }),
            );
        }
    }

    fn run(mut self) {
        match self.decode_to_end() {
            Ok(()) => self.producer.finish(),
            Err(Stop::Cancelled) => {}
            Err(Stop::Decode) => self.fail(PipelineError::Decode),
            Err(Stop::Conversion) => self.fail(PipelineError::Conversion),
        }
    }

    fn fail(&self, error: PipelineError) {
        send(
            &self.inbox,
            WorkerInput::Load(LoadEvent::DecodeFailed {
                pipeline: self.pipeline,
                error,
            }),
        );
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

pub(super) fn prebuffer_frames(sample_rate: u32) -> usize {
    usize::try_from(sample_rate)
        .unwrap_or(usize::MAX)
        .saturating_mul(250)
        .checked_div(1_000)
        .unwrap_or(usize::MAX)
        .max(1)
}

fn notify_prebuffer(
    inbox: &Sender<WorkerInput>,
    pipeline: PipelineId,
    sent: &mut bool,
    ready: bool,
) {
    if ready && !*sent {
        *sent = true;
        send(
            inbox,
            WorkerInput::Load(LoadEvent::PrebufferReady { pipeline }),
        );
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

/// Test-only gate: a file whose name starts with `gated` waits here until a test releases it, so a
/// test can run commands while a load is in flight. Nothing else reads it.
#[cfg(test)]
pub(super) mod gate {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};

    use crate::library::sync::media::ValidatedAudioFile;

    pub(in crate::player) static RELEASED: AtomicBool = AtomicBool::new(false);

    pub(super) fn wait_if_gated(file: &ValidatedAudioFile) {
        if !file.file_name.starts_with("gated") {
            return;
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        while !RELEASED.load(Ordering::Acquire) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DecodeHandle, DecodeTask, LoadEvent, LoadPosition, SourceLoad, SourceLoadId, Stop,
        prebuffer_frames,
    };
    use crate::library::sync::media::ValidatedAudioFile;
    use crate::player::decode::{CompressedAudioSource, DecodeStep};
    use crate::player::output::PipelineId;
    use crate::player::output::{PcmConsumer, bounded_pcm_queue};
    use crate::player::processing::{OutputProcessingError, OutputProcessingPlan, PcmConverter};
    use crate::player::worker::WorkerInput;
    use crate::test_support::{TestDirectory, write_pcm_i16_wav};
    use crate::threads::Cancellation;
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
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
    ) -> (DecodeHandle, PcmConsumer, Receiver<WorkerInput>) {
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
        let (inbox, events) = mpsc::channel();
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

    fn next_event(events: &Receiver<WorkerInput>) -> LoadEvent {
        match events.recv_timeout(Duration::from_secs(2)) {
            Ok(WorkerInput::Load(event)) => event,
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
            LoadEvent::PrebufferReady {
                pipeline: PipelineId(7)
            }
        ));
        assert!(consumer.available_frames(1) >= prebuffer_frames(44_100));
        drop(worker);
    }

    #[test]
    fn a_short_file_is_ready_at_its_end_and_the_queue_reports_finished() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 1_000);
        let (worker, mut consumer, events) = start_pipeline(&file, 2_000);

        assert!(matches!(
            next_event(&events),
            LoadEvent::PrebufferReady { .. }
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
        drop(worker);
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
        drop(worker);

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
    fn dropping_a_source_load_cancels_it() {
        let directory = TestDirectory::new();
        let file = wav_file(&directory, 1_000);
        let (inbox, _events) = mpsc::channel();
        let load = SourceLoad::spawn(file, SourceLoadId(1), LoadPosition::Start, inbox);
        let cancellation = load.cancellation.clone();

        drop(load);

        assert!(cancellation.is_cancelled());
    }

    #[test]
    fn classifies_other_processing_failures_as_decode_failures() {
        assert_eq!(
            Stop::from(OutputProcessingError::InvalidInputSamples),
            Stop::Decode
        );
    }
}
