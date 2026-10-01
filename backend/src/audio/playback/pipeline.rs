//! Opens a pipeline: a decoder positioned in a file, an output stream, and the decode thread
//! between them. A start and a seek differ only in where the decoder is positioned.

use super::decode_worker::{DecodeTaskInput, DecodeWorker};
use super::input::Inbox;
use super::session::Pipeline;
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{
    AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, OutputTarget,
    PreparedOutputConfig,
};
use crate::audio::output_processing::OutputPcmProcessor;
use crate::audio::timebase::{millis_to_frame, rescale_frame};

/// Where the decoder starts reading.
#[derive(Copy, Clone)]
pub(super) enum StartPoint {
    Beginning,
    Seek { target_ms: u64 },
}

/// Which output the pipeline feeds.
pub(super) enum OutputChoice {
    /// A new session on the device a selection names.
    Select(AudioOutputSelection),
    /// The same device and configuration as the stream already playing.
    Reuse(PreparedOutputConfig),
}

pub(super) struct PipelineRequest<'a> {
    pub source: &'a CompressedAudioSource,
    pub extension: &'a str,
    pub output: OutputChoice,
    pub from: StartPoint,
    pub stream_id: OutputStreamId,
    pub links: OutputLinks,
}

pub(super) struct OpenedPipeline {
    pub pipeline: Pipeline,
    /// The duration the decoder reports, if it knows one.
    pub duration_ms: Option<u64>,
    /// The source frame the first decoded sample belongs to.
    pub start_source_frame: u64,
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

pub(super) fn open_pipeline(
    backend: &dyn OutputBackend,
    inbox: &Inbox,
    request: PipelineRequest<'_>,
) -> Result<OpenedPipeline, PipelineError> {
    let mut decoder = request
        .source
        .open_decoder(request.extension)
        .map_err(|_| PipelineError::DecoderOpen)?;
    let spec = decoder.spec();
    let duration_ms = decoder.duration_ms();
    let target = match request.output {
        OutputChoice::Select(selection) => OutputTarget::Selection { selection, spec },
        OutputChoice::Reuse(config) => {
            if config.processing_plan.source() != spec {
                return Err(PipelineError::SpecChanged);
            }
            OutputTarget::Config(config)
        }
    };
    let prepared = backend
        .prepare(target, request.links)
        .map_err(PipelineError::OutputPrepare)?;
    let plan = prepared.config.processing_plan;
    let processor = OutputPcmProcessor::new(plan).map_err(|_| PipelineError::ProcessorCreate)?;

    let source_rate = spec.sample_rate().get();
    let output_rate = plan.output().sample_rate().get();
    let mut first_packet = Vec::new();
    let mut start_source_frame = 0;
    let mut discard_output_frames = 0;
    match request.from {
        StartPoint::Beginning => match decoder.decode_next(&mut first_packet) {
            Ok(DecodeStep::Samples) => {}
            Ok(DecodeStep::EndOfStream) | Err(_) => return Err(PipelineError::FirstPacketDecode),
        },
        StartPoint::Seek { target_ms } => {
            let target_source_frame = millis_to_frame(target_ms, source_rate);
            let preroll_frames = processor.seek_preroll_frames(target_source_frame);
            let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames)
            {
                Ok(SeekStep::Samples(seek)) if !seek.first_packet.is_empty() => seek,
                Err(PcmDecodeError::SeekFailed) => return Err(PipelineError::SeekFailed),
                Ok(_) | Err(_) => return Err(PipelineError::FirstPacketDecode),
            };
            start_source_frame = seek.confirmed_source_frame;
            discard_output_frames = rescale_frame(
                seek.confirmed_source_frame
                    .saturating_sub(seek.preroll_source_frame),
                output_rate,
                source_rate,
            );
            first_packet = seek.first_packet;
        }
    }
    let discard_output_samples = usize::try_from(discard_output_frames)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(plan.output().channel_count().get()));

    let decode = DecodeWorker::spawn(
        DecodeTaskInput {
            decoder,
            first_packet,
            producer: prepared.producer,
            processor,
            output_sample_rate: output_rate,
            discard_output_samples,
        },
        inbox.clone(),
        request.stream_id,
    );
    Ok(OpenedPipeline {
        pipeline: Pipeline {
            stream_id: request.stream_id,
            stream: prepared.stream,
            config: prepared.config,
            decode,
        },
        duration_ms,
        start_source_frame,
    })
}
