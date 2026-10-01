//! Opens a pipeline: a decoder positioned in a file, an output stream, and the decode thread
//! between them. A start and a seek share the opening and the hand-off to the decode thread.

use super::decode_worker::{DecodeTaskInput, DecodeWorker};
use super::input::Inbox;
use super::session::Pipeline;
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep, StreamingDecoder};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{
    AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, OutputTarget, PreparedOutput,
    PreparedOutputConfig,
};
use crate::audio::output_processing::OutputPcmProcessor;
use crate::audio::timebase::{millis_to_frame, rescale_frame};

/// What the pipeline is for. The two differ in where the decoder starts reading, and so in what
/// they know up front: a seek reuses the playing output and its processing plan.
pub(super) enum PipelineKind {
    /// From the beginning of the file, on the device a selection names.
    Start(AudioOutputSelection),
    /// From `target_ms`, on the same device and configuration as the stream already playing.
    Seek {
        config: PreparedOutputConfig,
        target_ms: u64,
    },
}

pub(super) struct PipelineRequest<'a> {
    pub source: &'a CompressedAudioSource,
    pub extension: &'a str,
    pub kind: PipelineKind,
    pub stream_id: OutputStreamId,
    pub links: OutputLinks,
}

pub(super) struct OpenedPipeline {
    pub pipeline: Pipeline,
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

/// The decoder and its first samples, ready to feed an output.
struct Positioned {
    decoder: StreamingDecoder,
    duration_ms: Option<u64>,
    first_packet: Vec<f32>,
    /// Output frames at the head of the first packet that lie before the requested position.
    discard_output_frames: u64,
    start_output_frame: u64,
}

pub(super) fn open_pipeline(
    backend: &dyn OutputBackend,
    inbox: &Inbox,
    request: PipelineRequest<'_>,
) -> Result<OpenedPipeline, PipelineError> {
    let (positioned, prepared, processor) = match request.kind {
        PipelineKind::Start(selection) => {
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
                .prepare(OutputTarget::Selection { selection, spec }, request.links)
                .map_err(PipelineError::OutputPrepare)?;
            let processor = OutputPcmProcessor::new(prepared.config.processing_plan)
                .map_err(|_| PipelineError::ProcessorCreate)?;
            let positioned = Positioned {
                duration_ms: decoder.duration_ms(),
                decoder,
                first_packet,
                discard_output_frames: 0,
                start_output_frame: 0,
            };
            (positioned, prepared, processor)
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
            let prepared = backend
                .prepare(OutputTarget::Config(config), request.links)
                .map_err(PipelineError::OutputPrepare)?;
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
            (positioned, prepared, processor)
        }
    };
    Ok(spawn_decode(
        inbox,
        request.stream_id,
        positioned,
        prepared,
        processor,
    ))
}

fn spawn_decode(
    inbox: &Inbox,
    stream_id: OutputStreamId,
    positioned: Positioned,
    prepared: PreparedOutput,
    processor: OutputPcmProcessor,
) -> OpenedPipeline {
    let plan = prepared.config.processing_plan;
    let discard_output_samples = usize::try_from(positioned.discard_output_frames)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(plan.output().channel_count().get()));
    let decode = DecodeWorker::spawn(
        DecodeTaskInput {
            decoder: positioned.decoder,
            first_packet: positioned.first_packet,
            producer: prepared.producer,
            processor,
            output_sample_rate: plan.output().sample_rate().get(),
            discard_output_samples,
        },
        inbox.clone(),
        stream_id,
    );
    OpenedPipeline {
        pipeline: Pipeline {
            stream_id,
            stream: prepared.stream,
            config: prepared.config,
            decode,
        },
        duration_ms: positioned.duration_ms,
        start_output_frame: positioned.start_output_frame,
    }
}
