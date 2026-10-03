//! Opens a pipeline: a decoder positioned in a file, the queue it fills, and the decode thread
//! between them. A start and a seek share the opening and the hand-off to the decode thread; they
//! differ in where the queue plays: a start opens the session's output stream, a seek hands its
//! queue to the stream already playing.

use super::decode_worker::{DecodeTaskInput, DecodeWorker};
use super::input::Inbox;
use super::session::{Output, Pipeline};
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep, StreamingDecoder};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{
    make_queue, AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, PipelineId,
    PreparedOutputConfig,
};
use crate::audio::output_processing::{OutputPcmProcessor, OutputProcessingPlan};
use crate::audio::pcm_queue::{PcmConsumer, PcmProducer};
use crate::audio::timebase::{millis_to_frame, rescale_frame};

/// What the pipeline is for. They differ in where the decoder starts reading, and so in what
/// they know up front: a seek and the next track reuse the playing output and its processing
/// plan.
pub(super) enum PipelineKind {
    /// From the beginning of the file, on a new stream on the device a selection names.
    Start {
        selection: AudioOutputSelection,
        stream_id: OutputStreamId,
        /// What the new stream reports through.
        links: OutputLinks,
    },
    /// From `target_ms`, for the stream already playing, which keeps its device and
    /// configuration.
    Seek {
        config: PreparedOutputConfig,
        target_ms: u64,
    },
    /// From the beginning of the file that follows the playing one, for the stream already
    /// playing. The file must have the format the stream was opened for.
    Next { config: PreparedOutputConfig },
}

pub(super) struct PipelineRequest<'a> {
    pub source: &'a CompressedAudioSource,
    pub extension: &'a str,
    pub kind: PipelineKind,
    pub pipeline_id: PipelineId,
}

/// Where the pipeline's queue plays.
pub(super) enum OpenedOutput {
    /// A new stream, not started yet.
    Stream(Output),
    /// The queue for the stream already playing; hand it over when the prebuffer is ready, or
    /// for the next track, right away.
    Queue(PcmConsumer),
}

pub(super) struct OpenedPipeline {
    pub pipeline: Pipeline,
    pub output: OpenedOutput,
    /// The duration the decoder reports, if it knows one.
    pub duration_ms: Option<u64>,
    /// The output frame the first decoded sample belongs to.
    pub start_output_frame: u64,
}

pub(super) enum PipelineError {
    DecoderOpen,
    /// The file no longer has the format the output was prepared for.
    SpecChanged,
    FirstPacketDecode,
    SeekFailed,
    OutputPrepare(AudioOutputError),
    ProcessorCreate,
}

/// The decoder and its first samples, ready to feed a queue.
struct Positioned {
    decoder: StreamingDecoder,
    duration_ms: Option<u64>,
    first_packet: Vec<f32>,
    /// Output frames at the head of the first packet that lie before the requested position.
    discard_output_frames: u64,
    start_output_frame: u64,
}

/// The queue the decode thread fills, where it plays, and how its samples are processed.
struct Queue {
    output: OpenedOutput,
    producer: PcmProducer,
    processor: OutputPcmProcessor,
    plan: OutputProcessingPlan,
}

pub(super) fn open_pipeline(
    backend: &dyn OutputBackend,
    inbox: &Inbox,
    request: PipelineRequest<'_>,
) -> Result<OpenedPipeline, PipelineError> {
    let (positioned, queue) = match request.kind {
        PipelineKind::Start {
            selection,
            stream_id,
            links,
        } => {
            let mut decoder = request
                .source
                .open_decoder(request.extension)
                .map_err(|_| PipelineError::DecoderOpen)?;
            let spec = decoder.spec();
            let mut first_packet = Vec::new();
            match decoder.decode_next(&mut first_packet) {
                Ok(DecodeStep::Samples) => {}
                Ok(DecodeStep::EndOfStream) | Err(_) => {
                    return Err(PipelineError::FirstPacketDecode)
                }
            }
            let prepared = backend
                .prepare(&selection, spec, request.pipeline_id, links)
                .map_err(PipelineError::OutputPrepare)?;
            let plan = prepared.config.processing_plan;
            let processor =
                OutputPcmProcessor::new(plan).map_err(|_| PipelineError::ProcessorCreate)?;
            let positioned = Positioned {
                duration_ms: decoder.duration_ms(),
                decoder,
                first_packet,
                discard_output_frames: 0,
                start_output_frame: 0,
            };
            let queue = Queue {
                output: OpenedOutput::Stream(Output {
                    id: stream_id,
                    stream: prepared.stream,
                    config: prepared.config,
                }),
                producer: prepared.producer,
                processor,
                plan,
            };
            (positioned, queue)
        }
        PipelineKind::Next { config } => {
            let plan = config.processing_plan;
            let processor =
                OutputPcmProcessor::new(plan).map_err(|_| PipelineError::ProcessorCreate)?;
            let mut decoder = request
                .source
                .open_decoder(request.extension)
                .map_err(|_| PipelineError::DecoderOpen)?;
            if decoder.spec() != plan.source() {
                return Err(PipelineError::SpecChanged);
            }
            let mut first_packet = Vec::new();
            match decoder.decode_next(&mut first_packet) {
                Ok(DecodeStep::Samples) => {}
                Ok(DecodeStep::EndOfStream) | Err(_) => {
                    return Err(PipelineError::FirstPacketDecode)
                }
            }
            let (producer, consumer) =
                make_queue(plan.output()).map_err(PipelineError::OutputPrepare)?;
            let positioned = Positioned {
                duration_ms: decoder.duration_ms(),
                decoder,
                first_packet,
                discard_output_frames: 0,
                start_output_frame: 0,
            };
            let queue = Queue {
                output: OpenedOutput::Queue(consumer),
                producer,
                processor,
                plan,
            };
            (positioned, queue)
        }
        PipelineKind::Seek { config, target_ms } => {
            let plan = config.processing_plan;
            let source_rate = plan.source().sample_rate().get();
            let output_rate = plan.output().sample_rate().get();
            let target_source_frame = millis_to_frame(target_ms, source_rate);
            let processor =
                OutputPcmProcessor::new(plan).map_err(|_| PipelineError::ProcessorCreate)?;
            let mut decoder = request
                .source
                .open_decoder(request.extension)
                .map_err(|_| PipelineError::DecoderOpen)?;
            if decoder.spec() != plan.source() {
                return Err(PipelineError::SpecChanged);
            }
            let preroll_frames = processor.seek_preroll_frames(target_source_frame);
            let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames)
            {
                Ok(SeekStep::Samples(seek)) if !seek.first_packet.is_empty() => seek,
                Err(PcmDecodeError::SeekFailed) => return Err(PipelineError::SeekFailed),
                Ok(_) | Err(_) => return Err(PipelineError::FirstPacketDecode),
            };
            let (producer, consumer) =
                make_queue(plan.output()).map_err(PipelineError::OutputPrepare)?;
            let positioned = Positioned {
                duration_ms: decoder.duration_ms(),
                decoder,
                first_packet: seek.first_packet,
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
            };
            let queue = Queue {
                output: OpenedOutput::Queue(consumer),
                producer,
                processor,
                plan,
            };
            (positioned, queue)
        }
    };
    Ok(spawn_decode(inbox, request.pipeline_id, positioned, queue))
}

fn spawn_decode(
    inbox: &Inbox,
    pipeline_id: PipelineId,
    positioned: Positioned,
    queue: Queue,
) -> OpenedPipeline {
    let discard_output_samples = usize::try_from(positioned.discard_output_frames)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(queue.plan.output().channel_count().get()));
    let decode = DecodeWorker::spawn(
        DecodeTaskInput {
            decoder: positioned.decoder,
            first_packet: positioned.first_packet,
            producer: queue.producer,
            processor: queue.processor,
            output_sample_rate: queue.plan.output().sample_rate().get(),
            discard_output_samples,
        },
        inbox.clone(),
        pipeline_id,
    );
    OpenedPipeline {
        pipeline: Pipeline {
            id: pipeline_id,
            decode,
        },
        output: queue.output,
        duration_ms: positioned.duration_ms,
        start_output_frame: positioned.start_output_frame,
    }
}
