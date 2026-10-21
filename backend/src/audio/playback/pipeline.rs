//! Opens a pipeline: a decoder positioned in a file, the queue it fills, and the decode thread
//! between them. A start and a seek share the opening and the hand-off to the decode thread; they
//! differ in where the queue plays: a start opens the session's output stream, a seek hands its
//! queue to the stream already playing.

use super::decode_worker::{DecodeTaskInput, DecodeWorker};
use super::input::Inbox;
use super::session::{Output as StreamOutput, Pipeline};
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep, StreamingDecoder};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{
    AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, PipelineId, PreparedOutputConfig,
    make_queue,
};
use crate::audio::output_processing::{OutputPcmProcessor, OutputProcessingPlan};
use crate::audio::pcm_queue::{PcmConsumer, PcmProducer};
use crate::audio::timebase::{millis_to_frame, rescale_frame};
use crate::diagnostics::logged;

/// The queue a seek or the next track plays through: the stream already playing takes it over.
pub(super) type QueueOutput = PcmConsumer;

pub(super) struct PipelineRequest<'a> {
    pub source: &'a CompressedAudioSource,
    pub extension: &'a str,
    pub pipeline_id: PipelineId,
}

pub(super) struct OpenedPipeline<Sink> {
    pub pipeline: Pipeline,
    /// Where the pipeline's queue plays: a new stream for a start, the queue handed to the playing
    /// stream for a seek or the next track.
    pub sink: Sink,
    /// The duration the decoder reports, if it knows one.
    pub duration_ms: Option<u64>,
    /// The output frame the first decoded sample belongs to.
    pub start_output_frame: u64,
}

#[derive(Clone, Copy)]
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

/// The queue the decode thread fills and how its samples are processed.
struct Queue {
    producer: PcmProducer,
    processor: OutputPcmProcessor,
    plan: OutputProcessingPlan,
}

/// From the beginning of the file, on a new stream on the device `selection` names. The stream
/// is not started yet.
pub(super) fn open_start(
    backend: &dyn OutputBackend,
    inbox: &Inbox,
    request: &PipelineRequest<'_>,
    selection: &AudioOutputSelection,
    stream_id: OutputStreamId,
    links: OutputLinks,
) -> Result<OpenedPipeline<StreamOutput>, PipelineError> {
    let mut decoder = request
        .source
        .open_decoder(request.extension)
        .map_err(logged(
            PipelineError::DecoderOpen,
            "pipeline.start.decoder_open",
        ))?;
    let spec = decoder.spec();
    let first_packet = decode_first_packet(&mut decoder)?;
    let prepared = backend
        .prepare(selection, spec, request.pipeline_id, links)
        .map_err(PipelineError::OutputPrepare)?;
    let plan = prepared.config.processing_plan;
    let processor = OutputPcmProcessor::new(plan).map_err(logged(
        PipelineError::ProcessorCreate,
        "pipeline.start.processor",
    ))?;
    let positioned = Positioned {
        duration_ms: decoder.duration_ms(),
        decoder,
        first_packet,
        discard_output_frames: 0,
        start_output_frame: 0,
    };
    let queue = Queue {
        producer: prepared.producer,
        processor,
        plan,
    };
    let sink = StreamOutput {
        id: stream_id,
        stream: prepared.stream,
        config: prepared.config,
    };
    Ok(spawn_decode(
        inbox,
        request.pipeline_id,
        positioned,
        queue,
        sink,
    ))
}

/// From the beginning of the file that follows the playing one, for the stream already playing.
/// The file must have the format the stream was opened for.
pub(super) fn open_prefetch(
    inbox: &Inbox,
    request: &PipelineRequest<'_>,
    config: &PreparedOutputConfig,
) -> Result<OpenedPipeline<QueueOutput>, PipelineError> {
    let plan = config.processing_plan;
    let processor = OutputPcmProcessor::new(plan).map_err(logged(
        PipelineError::ProcessorCreate,
        "pipeline.prefetch.processor",
    ))?;
    let mut decoder = request
        .source
        .open_decoder(request.extension)
        .map_err(logged(
            PipelineError::DecoderOpen,
            "pipeline.prefetch.decoder_open",
        ))?;
    if decoder.spec() != plan.source() {
        return Err(PipelineError::SpecChanged);
    }
    let first_packet = decode_first_packet(&mut decoder)?;
    let (producer, consumer) = make_queue(plan.output()).map_err(PipelineError::OutputPrepare)?;
    let positioned = Positioned {
        duration_ms: decoder.duration_ms(),
        decoder,
        first_packet,
        discard_output_frames: 0,
        start_output_frame: 0,
    };
    let queue = Queue {
        producer,
        processor,
        plan,
    };
    Ok(spawn_decode(
        inbox,
        request.pipeline_id,
        positioned,
        queue,
        consumer,
    ))
}

/// From `target_ms`, for the stream already playing, which keeps its device and configuration.
pub(super) fn open_seek(
    inbox: &Inbox,
    request: &PipelineRequest<'_>,
    config: &PreparedOutputConfig,
    target_ms: u64,
) -> Result<OpenedPipeline<QueueOutput>, PipelineError> {
    let plan = config.processing_plan;
    let source_rate = plan.source().sample_rate().get();
    let output_rate = plan.output().sample_rate().get();
    let target_source_frame = millis_to_frame(target_ms, source_rate);
    let processor = OutputPcmProcessor::new(plan).map_err(logged(
        PipelineError::ProcessorCreate,
        "pipeline.seek.processor",
    ))?;
    let mut decoder = request
        .source
        .open_decoder(request.extension)
        .map_err(logged(
            PipelineError::DecoderOpen,
            "pipeline.seek.decoder_open",
        ))?;
    if decoder.spec() != plan.source() {
        return Err(PipelineError::SpecChanged);
    }
    let preroll_frames = processor.seek_preroll_frames(target_source_frame);
    let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames) {
        Ok(SeekStep::Samples(seek)) if !seek.first_packet.is_empty() => seek,
        Err(PcmDecodeError::SeekFailed) => return Err(PipelineError::SeekFailed),
        Ok(_) | Err(_) => return Err(PipelineError::FirstPacketDecode),
    };
    let (producer, consumer) = make_queue(plan.output()).map_err(PipelineError::OutputPrepare)?;
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
        start_output_frame: rescale_frame(seek.confirmed_source_frame, output_rate, source_rate),
    };
    let queue = Queue {
        producer,
        processor,
        plan,
    };
    Ok(spawn_decode(
        inbox,
        request.pipeline_id,
        positioned,
        queue,
        consumer,
    ))
}

/// The samples of the file's first packet, which fill the queue before the decode thread takes
/// over. A file that ends before it has any samples cannot start.
fn decode_first_packet(decoder: &mut StreamingDecoder) -> Result<Vec<f32>, PipelineError> {
    let mut first_packet = Vec::new();
    match decoder.decode_next(&mut first_packet) {
        Ok(DecodeStep::Samples) => Ok(first_packet),
        Ok(DecodeStep::EndOfStream) | Err(_) => Err(PipelineError::FirstPacketDecode),
    }
}

fn spawn_decode<Sink>(
    inbox: &Inbox,
    pipeline_id: PipelineId,
    positioned: Positioned,
    queue: Queue,
    sink: Sink,
) -> OpenedPipeline<Sink> {
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
        sink,
        duration_ms: positioned.duration_ms,
        start_output_frame: positioned.start_output_frame,
    }
}
