//! The output device behind a seam, and the PCM queue that feeds it.
//!
//! Playback talks to an `OutputStreamFactory` (list the devices, resolve a device, open a stream)
//! and to the `OutputStream` it returns (start, pause, position, switch queue). `CpalOutput` is
//! the real adapter; a fake adapter lives in `fake_output` for tests. The cpal callback body is
//! `CallbackState::fill`, a plain function over its state, tested directly.
//!
//! A session opens one stream. A seek builds a new queue and hands it to the running callback
//! through a lock-free single-slot handoff; the callback switches to it at its next run.

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, SyncSender, TrySendError},
};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, StreamConfig, StreamInstant, SupportedStreamConfig};
use log::{error, info, warn};
use parking_lot::Mutex;
use ringbuf::{
    HeapRb,
    traits::{Consumer, Observer, Producer, Split},
};
use serde::{Deserialize, Serialize};

use super::pcm::{ChannelCount, PcmSpec, SampleRate};
use super::processing::OutputProcessingPlan;
use super::state::PlaybackFailureCode;
use super::volume::{AtomicEffectiveGain, process_sample};
use crate::Result;
use crate::meter::{Meter, MeterTap};

/// Identifies one output stream, which lives as long as a session.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct OutputStreamId(pub(crate) u64);

/// Identifies one pipeline: the decode thread and the queue it fills. A stream plays one
/// pipeline at a time; a seek replaces the pipeline and keeps the stream.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PipelineId(pub(crate) u64);

/// What a running stream reports on its own.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum OutputEvent {
    /// Every frame of `pipeline` has been handed to the device; the stream clock reaching
    /// `end_time` means they were heard.
    FinalFrames {
        pipeline: PipelineId,
        end_time: StreamInstant,
    },
    /// The stream `stream` failed. The worker ignores it unless `stream` is the one it plays.
    Failed {
        stream: OutputStreamId,
        kind: StreamFailureKind,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum StreamFailureKind {
    DeviceChanged,
    DeviceUnavailable,
    RuntimeFailed,
    /// The end of the last callback could not be timed, so completion cannot be detected.
    CompletionTimingFailed,
}

fn classify_stream_error_kind(kind: cpal::ErrorKind) -> StreamFailureKind {
    match kind {
        cpal::ErrorKind::DeviceChanged => StreamFailureKind::DeviceChanged,
        cpal::ErrorKind::DeviceNotAvailable => StreamFailureKind::DeviceUnavailable,
        _ => StreamFailureKind::RuntimeFailed,
    }
}

/// Where a stream's events go. Called from the output callback, so it must not block.
pub(crate) type OutputEvents = Arc<dyn Fn(OutputEvent) + Send + Sync>;

/// What a stream's callback shares with the rest of the application.
#[derive(Clone)]
pub struct StreamCallbacks {
    /// The stream these callbacks belong to; its events name it.
    pub(crate) stream: OutputStreamId,
    pub(crate) gain: AtomicEffectiveGain,
    pub(crate) events: OutputEvents,
    /// Where the callback copies what it plays for the meters.
    pub(crate) meter: Meter,
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct PositionUpdate {
    /// The pipeline the frames came from; frames count from its first.
    pub(crate) pipeline: PipelineId,
    pub(crate) start_frame: u64,
    pub(crate) end_frame: u64,
    pub(crate) playback_time: StreamInstant,
}

/// Latest-value cell between the output callback and the worker: the callback overwrites it and
/// the worker takes the newest report. The callback never blocks; if the worker holds the lock at
/// that instant the next callback overwrites it anyway.
#[derive(Debug, Clone, Default)]
pub(crate) struct LatestPosition(Arc<Mutex<Option<PositionUpdate>>>);

impl LatestPosition {
    pub(crate) fn publish(&self, update: PositionUpdate) {
        if let Some(mut cell) = self.0.try_lock() {
            *cell = Some(update);
        }
    }

    pub(crate) fn take(&self) -> Option<PositionUpdate> {
        self.0.lock().take()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputError {
    NoOutputDevice,
    ConfigurationQueryFailed,
    UnsupportedConfiguration,
    StreamBuildFailed,
    StreamConfigurationUnsupported,
    StreamStartFailed,
    StreamPauseFailed,
    StreamResumeFailed,
    DeviceUnavailable,
}

impl OutputError {
    /// The reason the listener sees for this failure.
    pub(crate) fn code(self) -> PlaybackFailureCode {
        match self {
            Self::NoOutputDevice => PlaybackFailureCode::NoOutputDevice,
            Self::DeviceUnavailable => PlaybackFailureCode::OutputDeviceUnavailable,
            Self::UnsupportedConfiguration
            | Self::ConfigurationQueryFailed
            | Self::StreamConfigurationUnsupported => PlaybackFailureCode::UnsupportedOutput,
            Self::StreamBuildFailed
            | Self::StreamStartFailed
            | Self::StreamPauseFailed
            | Self::StreamResumeFailed => PlaybackFailureCode::OutputFailed,
        }
    }
}

#[derive(Clone)]
pub(crate) struct PreparedOutputConfig {
    pub(crate) device_id: String,
    pub(crate) device_name: String,
    pub(crate) processing_plan: OutputProcessingPlan,
}

/// A stream that exists but may not be running yet, with the queue that feeds it.
pub struct PreparedOutput {
    pub(crate) stream: Box<dyn OutputStream>,
    pub(crate) producer: PcmProducer,
    pub(crate) config: PreparedOutputConfig,
}

/// The queue a callback plays from and the pipeline that fills it.
pub(crate) struct PipelineQueue {
    consumer: PcmConsumer,
    pipeline: PipelineId,
}

/// The single slot a stream hands its next queue to the callback through.
type QueueHandoff = triple_buffer::Input<Option<PipelineQueue>>;
type QueueSlot = triple_buffer::Output<Option<PipelineQueue>>;

/// The queue that plays right after the one of `after` runs out, with no silence in between.
/// `None` in the slot withdraws the one handed over before.
pub(crate) struct Chain {
    after: PipelineId,
    next: PipelineQueue,
}

type ChainHandoff = triple_buffer::Input<Option<Chain>>;
type ChainSlot = triple_buffer::Output<Option<Chain>>;

/// Opens the streams that play on the output devices. `CpalOutput` is the real one; `FakeOutput`
/// stands in for tests.
pub trait OutputStreamFactory: Send {
    /// Checks that a selection names a usable device and says which one it is.
    fn resolve(
        &self,
        selection: &AudioOutputSelection,
    ) -> Result<AudioOutputDeviceIdentity, OutputError>;

    /// Opens a stream on the device `selection` names, configured for audio of `spec`. The stream
    /// plays `first` from the returned producer's queue once started.
    fn open(
        &self,
        selection: &AudioOutputSelection,
        spec: PcmSpec,
        first: PipelineId,
        links: StreamCallbacks,
    ) -> Result<PreparedOutput, OutputError>;
}

pub trait OutputStream {
    fn start(&self) -> Result<(), OutputError>;
    fn pause(&self) -> Result<(), OutputError>;
    /// The stream clock; a `FinalFrames` event is due once it reaches the event's end time.
    fn now(&self) -> StreamInstant;
    /// Frames of the current pipeline heard so far, from the newest position report. Never moves
    /// backwards within a pipeline.
    fn played_frame_position(&mut self, sample_rate: u32, max_frame_count: Option<u64>) -> u64;
    /// Forgets the newest report, so the position holds until the callback reports again.
    fn clear_timing_anchor(&mut self);
    /// Hands the callback the queue of the next pipeline. It switches at its next run and counts
    /// frames from zero again; a handoff it has not taken yet is replaced. A queue handed over
    /// with `queue_next` is forgotten.
    fn switch_queue(&mut self, consumer: PcmConsumer, pipeline: PipelineId);
    /// Hands the callback the queue of the pipeline that follows `after`. The callback moves on
    /// to it the moment `after`'s queue has played out, within the same buffer, so nothing is
    /// inserted between the two. It counts frames from zero again and reports the end of
    /// `after` as usual. The handoff is void once the stream plays anything but `after`, and a
    /// newer one replaces it.
    fn queue_next(&mut self, after: PipelineId, consumer: PcmConsumer, pipeline: PipelineId);
    /// Withdraws the queue handed over with `queue_next`, unless the callback already moved on
    /// to it.
    fn clear_next(&mut self);
    /// The stream moved on to the queue handed over with `queue_next`: reports of `pipeline`
    /// count from now on, from the first frame.
    fn adopt_next(&mut self, pipeline: PipelineId);
}

pub struct CpalOutput;

impl OutputStreamFactory for CpalOutput {
    fn resolve(
        &self,
        selection: &AudioOutputSelection,
    ) -> Result<AudioOutputDeviceIdentity, OutputError> {
        resolve_output_selection(selection).map(|device| device.identity)
    }

    fn open(
        &self,
        selection: &AudioOutputSelection,
        spec: PcmSpec,
        first: PipelineId,
        links: StreamCallbacks,
    ) -> Result<PreparedOutput, OutputError> {
        open_stream(resolve_output_selection(selection)?, spec, first, links)
    }
}

fn map_stream_start_error(error: &cpal::Error) -> OutputError {
    match error.kind() {
        cpal::ErrorKind::DeviceNotAvailable => OutputError::DeviceUnavailable,
        _ => OutputError::StreamStartFailed,
    }
}

struct CpalStream {
    stream: cpal::Stream,
    latest_position: LatestPosition,
    handoff: QueueHandoff,
    chain: ChainHandoff,
    /// The pipeline whose reports count; reports of an earlier one are stale.
    pipeline: PipelineId,
    latest_position_update: Option<PositionUpdate>,
    last_played_frame_position: u64,
}

impl OutputStream for CpalStream {
    fn start(&self) -> Result<(), OutputError> {
        self.stream
            .play()
            .map_err(|error| map_stream_start_error(&error))
    }

    fn pause(&self) -> Result<(), OutputError> {
        self.stream.pause().map_err(|error| match error.kind() {
            cpal::ErrorKind::DeviceNotAvailable => OutputError::DeviceUnavailable,
            _ => OutputError::StreamPauseFailed,
        })
    }

    fn now(&self) -> StreamInstant {
        self.stream.now()
    }

    fn played_frame_position(&mut self, sample_rate: u32, max_frame_count: Option<u64>) -> u64 {
        if let Some(update) = self.latest_position.take()
            && update.pipeline == self.pipeline
        {
            self.latest_position_update = Some(update);
        }

        let position =
            self.latest_position_update
                .map_or(self.last_played_frame_position, |update| {
                    played_frame_position(
                        update,
                        self.stream.now(),
                        sample_rate,
                        max_frame_count,
                        self.last_played_frame_position,
                    )
                });
        self.last_played_frame_position = self.last_played_frame_position.max(position);
        self.last_played_frame_position
    }

    fn clear_timing_anchor(&mut self) {
        self.latest_position.take();
        self.latest_position_update = None;
    }

    fn switch_queue(&mut self, consumer: PcmConsumer, pipeline: PipelineId) {
        self.handoff
            .write(Some(PipelineQueue { consumer, pipeline }));
        self.chain.write(None);
        self.pipeline = pipeline;
        self.clear_timing_anchor();
        self.last_played_frame_position = 0;
    }

    fn queue_next(&mut self, after: PipelineId, consumer: PcmConsumer, pipeline: PipelineId) {
        self.chain.write(Some(Chain {
            after,
            next: PipelineQueue { consumer, pipeline },
        }));
    }

    fn clear_next(&mut self) {
        self.chain.write(None);
    }

    fn adopt_next(&mut self, pipeline: PipelineId) {
        self.pipeline = pipeline;
        self.clear_timing_anchor();
        self.last_played_frame_position = 0;
    }
}

/// Runs `$body` with `$sample` naming the Rust type of `$format`. One dispatch for every sample
/// format cpal can open.
macro_rules! with_sample_type {
    ($format:expr, $sample:ident => $body:expr) => {
        match $format {
            SampleFormat::F32 => {
                type $sample = f32;
                $body
            }
            SampleFormat::F64 => {
                type $sample = f64;
                $body
            }
            SampleFormat::I8 => {
                type $sample = i8;
                $body
            }
            SampleFormat::I16 => {
                type $sample = i16;
                $body
            }
            SampleFormat::I24 => {
                type $sample = cpal::I24;
                $body
            }
            SampleFormat::I32 => {
                type $sample = i32;
                $body
            }
            SampleFormat::I64 => {
                type $sample = i64;
                $body
            }
            SampleFormat::U8 => {
                type $sample = u8;
                $body
            }
            SampleFormat::U16 => {
                type $sample = u16;
                $body
            }
            SampleFormat::U24 => {
                type $sample = cpal::U24;
                $body
            }
            SampleFormat::U32 => {
                type $sample = u32;
                $body
            }
            SampleFormat::U64 => {
                type $sample = u64;
                $body
            }
            _ => return Err(OutputError::UnsupportedConfiguration),
        }
    };
}

fn build_stream_for_config(
    device: &cpal::Device,
    config: StreamConfig,
    sample_format: SampleFormat,
    consumer: PcmConsumer,
    first: PipelineId,
    links: StreamCallbacks,
) -> Result<CpalStream, OutputError> {
    let latest_position = LatestPosition::default();
    let (handoff, slot) = triple_buffer::TripleBuffer::default().split();
    let (chain, chain_slot) = triple_buffer::TripleBuffer::default().split();
    let state = CallbackState::new(
        PipelineQueue {
            consumer,
            pipeline: first,
        },
        slot,
        chain_slot,
        usize::from(config.channels),
        config.sample_rate,
        links,
        latest_position.clone(),
    );
    let stream = with_sample_type!(sample_format, Sample => {
        build_stream::<Sample>(device, config, sample_format, state)?
    });
    Ok(CpalStream {
        stream,
        latest_position,
        handoff,
        chain,
        pipeline: first,
        latest_position_update: None,
        last_played_frame_position: 0,
    })
}

/// Opens a stream on `resolved_device` for audio of `spec`. The device's native configuration is
/// tried first. When the device cannot take it, the device default is used and `spec` is
/// converted to that.
fn open_stream(
    resolved_device: ResolvedAudioOutputDevice,
    spec: PcmSpec,
    first: PipelineId,
    links: StreamCallbacks,
) -> Result<PreparedOutput, OutputError> {
    let ResolvedAudioOutputDevice { device, identity } = resolved_device;
    let source_rate = spec.sample_rate().get();
    let source_channels = spec.channel_count().get();
    let ranges = device
        .supported_output_configs()
        .map_err(|error| match error.kind() {
            cpal::ErrorKind::DeviceNotAvailable => OutputError::DeviceUnavailable,
            _ => OutputError::ConfigurationQueryFailed,
        })?
        .collect::<Vec<_>>();
    let native = select_output_config(ranges.iter().copied(), source_rate, source_channels);
    match native
        .and_then(|config| build_prepared(&device, &identity, config, spec, first, links.clone()))
    {
        Ok(prepared) => {
            info!(
                "audio.output.configured path=native source_rate={} source_channels={} output_rate={} output_channels={} conversion={:?}",
                source_rate,
                source_channels,
                source_rate,
                source_channels,
                prepared.config.processing_plan.channel_conversion()
            );
            return Ok(prepared);
        }
        Err(
            OutputError::UnsupportedConfiguration | OutputError::StreamConfigurationUnsupported,
        ) => {
            warn!("audio.output.native_fallback");
        }
        Err(error) => return Err(error),
    }

    let default = device
        .default_output_config()
        .map_err(|error| match error.kind() {
            cpal::ErrorKind::DeviceNotAvailable => OutputError::DeviceUnavailable,
            _ => OutputError::UnsupportedConfiguration,
        })?;
    let prepared = build_prepared(&device, &identity, default, spec, first, links)
        // A default configuration the device refuses is a failed build, not another fallback.
        .map_err(|error| match error {
            OutputError::StreamConfigurationUnsupported => OutputError::StreamBuildFailed,
            error => error,
        })?;
    let output = prepared.config.processing_plan.output();
    info!(
        "audio.output.configured path=fallback source_rate={} source_channels={} output_rate={} output_channels={} conversion={:?}",
        source_rate,
        source_channels,
        output.sample_rate().get(),
        output.channel_count().get(),
        prepared.config.processing_plan.channel_conversion()
    );
    Ok(prepared)
}

/// Opens a stream that plays `config`, and the queue that feeds it. `spec` is converted to what
/// `config` plays.
fn build_prepared(
    device: &cpal::Device,
    identity: &AudioOutputDeviceIdentity,
    config: SupportedStreamConfig,
    spec: PcmSpec,
    first: PipelineId,
    links: StreamCallbacks,
) -> Result<PreparedOutput, OutputError> {
    let target = PcmSpec::new(
        SampleRate::new(config.sample_rate()).ok_or(OutputError::UnsupportedConfiguration)?,
        ChannelCount::new(usize::from(config.channels()))
            .ok_or(OutputError::UnsupportedConfiguration)?,
    );
    let plan = OutputProcessingPlan::new(spec, target)
        .inspect_err(|cause| log::warn!("audio.output.plan_failed cause={cause}"))
        .ok()
        .ok_or(OutputError::UnsupportedConfiguration)?;
    let (producer, consumer) = make_queue(target)?;
    let stream = build_stream_for_config(
        device,
        config.config(),
        config.sample_format(),
        consumer,
        first,
        links,
    )?;
    Ok(PreparedOutput {
        stream: Box::new(stream),
        producer,
        config: PreparedOutputConfig {
            device_id: identity.id.clone(),
            device_name: identity.name.clone(),
            processing_plan: plan,
        },
    })
}

/// A two second queue for `spec`.
pub(crate) fn make_queue(spec: PcmSpec) -> Result<(PcmProducer, PcmConsumer), OutputError> {
    let sample_rate = spec.sample_rate().get();
    let channels = spec.channel_count().get();
    let capacity = usize::try_from(sample_rate)
        .unwrap_or(usize::MAX)
        .saturating_mul(2)
        .max(1);
    let channel_count =
        ChannelCount::new(usize::from(channels)).ok_or(OutputError::UnsupportedConfiguration)?;
    bounded_pcm_queue(capacity, channel_count).ok_or_else(|| {
        log::warn!("audio.output.queue_failed capacity_frames={capacity}");
        OutputError::UnsupportedConfiguration
    })
}

fn select_output_config(
    ranges: impl IntoIterator<Item = cpal::SupportedStreamConfigRange>,
    sample_rate: u32,
    channel_count: u16,
) -> Result<SupportedStreamConfig, OutputError> {
    ranges
        .into_iter()
        .filter(|range| range.channels() == channel_count)
        .filter_map(|range| {
            let sample_format = range.sample_format();
            if sample_format.is_dsd() {
                return None;
            }
            let rank = sample_format_rank(sample_format)?;

            range
                .try_with_sample_rate(sample_rate)
                .map(|config| (rank, config))
        })
        .min_by_key(|(rank, _)| *rank)
        .map(|(_, config)| config)
        .ok_or(OutputError::UnsupportedConfiguration)
}

fn sample_format_rank(sample_format: SampleFormat) -> Option<u8> {
    match sample_format {
        SampleFormat::F32 => Some(0),
        SampleFormat::F64 => Some(1),
        SampleFormat::I32 => Some(2),
        SampleFormat::I24 => Some(3),
        SampleFormat::I16 => Some(4),
        SampleFormat::I8 => Some(5),
        SampleFormat::U32 => Some(6),
        SampleFormat::U24 => Some(7),
        SampleFormat::U16 => Some(8),
        SampleFormat::U8 => Some(9),
        SampleFormat::I64 => Some(10),
        SampleFormat::U64 => Some(11),
        _ => None,
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Completion {
    Pending,
    Reported,
    TimingFailed,
}

/// Samples moved from the queue per pass; sized for the callback's stack.
const FILL_CHUNK_SAMPLES: usize = 512;

/// Everything the output callback keeps between calls.
pub(crate) struct CallbackState {
    consumer: PcmConsumer,
    /// The pipeline `consumer` belongs to.
    pipeline: PipelineId,
    handoff: QueueSlot,
    chain_slot: ChainSlot,
    /// The queue that plays when `consumer` runs out.
    chained: Option<Chain>,
    channel_count: usize,
    sample_rate: u32,
    links: StreamCallbacks,
    latest_position: LatestPosition,
    meter: MeterTap,
    position_frame: u64,
    last_end_time: Option<StreamInstant>,
    completion: Completion,
}

impl CallbackState {
    pub(crate) fn new(
        first: PipelineQueue,
        handoff: QueueSlot,
        chain_slot: ChainSlot,
        channel_count: usize,
        sample_rate: u32,
        links: StreamCallbacks,
        latest_position: LatestPosition,
    ) -> Self {
        Self {
            consumer: first.consumer,
            pipeline: first.pipeline,
            handoff,
            chain_slot,
            chained: None,
            channel_count,
            sample_rate,
            meter: links.meter.tap(sample_rate, channel_count),
            links,
            latest_position,
            position_frame: 0,
            last_end_time: None,
            completion: Completion::Pending,
        }
    }

    /// The output callback: switches to a queue handed off since the last run, fills `output`
    /// from the queue with the gain applied, moves on to the chained queue when the current one
    /// runs out, pads an underrun with silence, reports the position, and reports completion
    /// once the producer has finished and the queue is drained.
    pub(crate) fn fill<T>(&mut self, output: &mut [T], playback_time: StreamInstant)
    where
        T: Sample + FromSample<f32>,
    {
        self.take_handoff();
        let gain = self.links.gain.load();
        let mut written = 0;
        // What the current queue has played in this call, and when its first frame is heard.
        let mut start_frame = self.position_frame;
        let mut segment_samples = 0;
        let mut segment_time = playback_time;
        loop {
            let popped =
                self.write_queue_samples(output.get_mut(written..).unwrap_or_default(), gain);
            written += popped;
            segment_samples += popped;
            if written == output.len() || self.chained.is_none() || !self.consumer.is_finished() {
                break;
            }
            self.position_frame = self
                .position_frame
                .saturating_add((segment_samples / self.channel_count) as u64);
            self.note_end_time(segment_time, segment_samples);
            self.report_completion();
            self.chain_to_next();
            start_frame = 0;
            segment_samples = 0;
            segment_time =
                calculate_end_time(playback_time, written, self.channel_count, self.sample_rate)
                    .unwrap_or(playback_time);
        }
        output
            .get_mut(written..)
            .unwrap_or_default()
            .fill(T::EQUILIBRIUM);
        self.position_frame = self
            .position_frame
            .saturating_add((segment_samples / self.channel_count) as u64);
        self.note_end_time(segment_time, segment_samples);
        self.latest_position.publish(PositionUpdate {
            pipeline: self.pipeline,
            start_frame,
            end_frame: self.position_frame,
            playback_time: segment_time,
        });
        self.report_completion();
    }

    /// Notes when the `samples` played from `start` will have been heard.
    fn note_end_time(&mut self, start: StreamInstant, samples: usize) {
        if samples > 0 {
            self.last_end_time =
                calculate_end_time(start, samples, self.channel_count, self.sample_rate);
        }
    }

    /// Takes what the stream handed over since the last run: a queue that replaces the current
    /// one, and the queue that follows it.
    fn take_handoff(&mut self) {
        if self.handoff.update()
            && let Some(next) = self.handoff.output_buffer_mut().take()
        {
            *self.handoff.output_buffer_mut() = Some(PipelineQueue {
                consumer: std::mem::replace(&mut self.consumer, next.consumer),
                pipeline: std::mem::replace(&mut self.pipeline, next.pipeline),
            });
            self.position_frame = 0;
            self.last_end_time = None;
            self.completion = Completion::Pending;
        }
        if self.chain_slot.update() {
            self.chained = self.chain_slot.output_buffer_mut().take();
        }
        // Dropping a queue here frees it on this thread, which only a withdrawn or outdated
        // handoff costs.
        if self
            .chained
            .as_ref()
            .is_some_and(|chain| chain.after != self.pipeline)
        {
            self.chained = None;
        }
    }

    /// Moves on to the chained queue. The queue it leaves goes back into the slot, so the
    /// stream's thread frees it rather than this one.
    fn chain_to_next(&mut self) {
        let Some(chain) = self.chained.take() else {
            return;
        };
        *self.handoff.output_buffer_mut() = Some(PipelineQueue {
            consumer: std::mem::replace(&mut self.consumer, chain.next.consumer),
            pipeline: std::mem::replace(&mut self.pipeline, chain.next.pipeline),
        });
        self.position_frame = 0;
        self.last_end_time = None;
        self.completion = Completion::Pending;
    }

    /// Plays what the queue has into the start of `output`, with the gain applied, and returns
    /// how many samples that was. The rest of `output` is left alone.
    fn write_queue_samples<T>(&mut self, output: &mut [T], gain: f32) -> usize
    where
        T: Sample + FromSample<f32>,
    {
        let mut chunk = [0.0_f32; FILL_CHUNK_SAMPLES];
        let mut consumed = 0;
        for destination in output.chunks_mut(FILL_CHUNK_SAMPLES) {
            let popped = self
                .consumer
                .pop_samples(&mut chunk[..destination.len().min(FILL_CHUNK_SAMPLES)]);
            for (slot, sample) in destination
                .iter_mut()
                .zip(chunk[..popped.min(FILL_CHUNK_SAMPLES)].iter_mut())
            {
                *sample = process_sample(*sample, gain);
                *slot = T::from_sample(*sample);
            }
            self.meter.push(&chunk[..popped.min(FILL_CHUNK_SAMPLES)]);
            consumed += popped;
            if popped < destination.len() {
                break;
            }
        }
        consumed
    }

    fn report_completion(&mut self) {
        if self.completion != Completion::Pending || !self.consumer.is_finished() {
            return;
        }
        if let Some(end_time) = self.last_end_time {
            self.completion = Completion::Reported;
            (self.links.events)(OutputEvent::FinalFrames {
                pipeline: self.pipeline,
                end_time,
            });
        } else {
            self.completion = Completion::TimingFailed;
            (self.links.events)(OutputEvent::Failed {
                stream: self.links.stream,
                kind: StreamFailureKind::CompletionTimingFailed,
            });
        }
    }
}

fn build_stream<T>(
    device: &cpal::Device,
    config: StreamConfig,
    sample_format: SampleFormat,
    mut state: CallbackState,
) -> Result<cpal::Stream, OutputError>
where
    T: cpal::SizedSample + FromSample<f32>,
{
    let config_sample_rate = config.sample_rate;
    let config_channels = config.channels;
    let config_buffer_size = config.buffer_size;
    let error_events = Arc::clone(&state.links.events);
    let stream = state.links.stream;

    device
        .build_output_stream(
            config,
            move |output: &mut [T], info| state.fill(output, info.timestamp().playback),
            move |error| {
                error_events(OutputEvent::Failed {
                    stream,
                    kind: classify_stream_error_kind(error.kind()),
                });
            },
            None,
        )
        .map_err(|error| {
            let error_kind = error.kind();
            error!(
                "audio.output.stream_build_failed kind={error_kind:?} sample_format={sample_format:?} sample_rate={config_sample_rate} channels={config_channels} buffer_size={config_buffer_size:?}"
            );
            match error_kind {
                cpal::ErrorKind::DeviceNotAvailable => OutputError::DeviceUnavailable,
                cpal::ErrorKind::UnsupportedConfig => {
                    OutputError::StreamConfigurationUnsupported
                }
                _ => OutputError::StreamBuildFailed,
            }
        })
}

fn elapsed_frames(elapsed: Duration, sample_rate: u32) -> u64 {
    ((elapsed.as_nanos() * u128::from(sample_rate)) / 1_000_000_000).min(u128::from(u64::MAX))
        as u64
}

fn played_frame_position(
    update: PositionUpdate,
    now: StreamInstant,
    sample_rate: u32,
    max_frame_count: Option<u64>,
    last_position: u64,
) -> u64 {
    let elapsed = now
        .checked_duration_since(update.playback_time)
        .map_or(0, |duration| elapsed_frames(duration, sample_rate));
    let position = update
        .start_frame
        .saturating_add(elapsed)
        .min(update.end_frame);
    let position = max_frame_count.map_or(position, |max| position.min(max));
    last_position.max(position)
}

#[expect(
    clippy::manual_is_multiple_of,
    reason = "frame alignment is checked with `%`, which reads clearly here"
)]
fn calculate_end_time(
    playback_start: StreamInstant,
    written_sample_count: usize,
    channel_count: usize,
    sample_rate: u32,
) -> Option<StreamInstant> {
    if channel_count == 0 || sample_rate == 0 || written_sample_count % channel_count != 0 {
        return None;
    }

    let written_frame_count = written_sample_count / channel_count;
    let seconds = written_frame_count as f64 / f64::from(sample_rate);
    if !seconds.is_finite() || seconds >= u64::MAX as f64 {
        return None;
    }

    playback_start.checked_add(Duration::from_secs_f64(seconds))
}

#[derive(Debug, Clone, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AudioOutputSelection {
    SystemDefault,
    Device { device_id: String },
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDeviceIdentity {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputDevice {
    pub id: String,
    pub name: String,
}

pub(crate) struct ResolvedAudioOutputDevice {
    pub(crate) device: cpal::Device,
    pub(crate) identity: AudioOutputDeviceIdentity,
}

pub(crate) fn list_output_devices() -> Result<Vec<AudioOutputDevice>> {
    let devices = cpal::default_host().output_devices()?;
    let mut output_devices = devices
        .filter_map(|device| {
            let id = device
                .id()
                .map(|id| id.to_string())
                .inspect_err(|cause| log::warn!("audio.devices.id_failed cause={cause}"))
                .ok()?;
            let name = device
                .description()
                .map(|description| description.name().to_owned())
                .inspect_err(|cause| log::warn!("audio.devices.name_failed cause={cause}"))
                .ok()?;
            Some(AudioOutputDevice { id, name })
        })
        .collect::<Vec<_>>();
    sort_output_devices(&mut output_devices);
    Ok(output_devices)
}

/// The device a selection names. A device that cannot be named, found or identified is unavailable.
pub(crate) fn resolve_output_selection(
    selection: &AudioOutputSelection,
) -> Result<ResolvedAudioOutputDevice, OutputError> {
    let host = cpal::default_host();
    let device = match selection {
        AudioOutputSelection::SystemDefault => host
            .default_output_device()
            .ok_or(OutputError::NoOutputDevice)?,
        AudioOutputSelection::Device { device_id } => {
            let id = device_id
                .parse::<cpal::DeviceId>()
                .inspect_err(|cause| log::warn!("audio.devices.id_invalid cause={cause}"))
                .ok()
                .ok_or(OutputError::DeviceUnavailable)?;
            host.device_by_id(&id)
                .ok_or(OutputError::DeviceUnavailable)?
        }
    };
    let identity = device_identity(&device)
        .inspect_err(|cause| log::warn!("audio.devices.identity_failed cause={cause}"))
        .ok()
        .ok_or(OutputError::DeviceUnavailable)?;
    Ok(ResolvedAudioOutputDevice { device, identity })
}

fn device_identity(device: &cpal::Device) -> Result<AudioOutputDeviceIdentity, cpal::Error> {
    Ok(AudioOutputDeviceIdentity {
        id: device.id()?.to_string(),
        name: device.description()?.name().to_owned(),
    })
}

fn sort_output_devices(devices: &mut [AudioOutputDevice]) {
    devices.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
}

/// The consumer wakes a waiting producer when occupancy falls below this fraction (1/2).
const WAKE_NUMERATOR: usize = 1;
const WAKE_DENOMINATOR: usize = 2;

/// A full wake channel already holds a pending wake, so only a closed one is a failure.
fn ignore_full(result: Result<(), TrySendError<()>>) -> Result<(), TrySendError<()>> {
    match result {
        Err(TrySendError::Full(())) => Ok(()),
        other => other,
    }
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

pub struct PcmConsumer {
    consumer: ringbuf::HeapCons<f32>,
    room: SyncSender<()>,
    finished: Arc<AtomicBool>,
}

/// Wakes a producer that is waiting for room, so it can notice that it was cancelled.
#[derive(Clone)]
pub(crate) struct PcmWaker(SyncSender<()>);

impl PcmWaker {
    pub(crate) fn wake(&self) {
        if let Err(cause) = ignore_full(self.0.try_send(())) {
            log::debug!("audio.pcm_queue.wake_failed cause={cause}");
        }
    }
}

/// A queue of `capacity_frames` frames. `None` when it has no room or its size overflows.
pub(crate) fn bounded_pcm_queue(
    capacity_frames: usize,
    channel_count: ChannelCount,
) -> Option<(PcmProducer, PcmConsumer)> {
    if capacity_frames == 0 {
        return None;
    }
    let channel_count = usize::from(channel_count.get());
    let capacity_samples = capacity_frames.checked_mul(channel_count)?;
    let (producer, consumer) = HeapRb::<f32>::new(capacity_samples).split();
    let (room_sender, room) = mpsc::sync_channel(1);
    let finished = Arc::new(AtomicBool::new(false));
    Some((
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
        self.producer
            .push_slice(&samples[..writable.min(samples.len())])
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
            let pushed = self.push_samples(&samples[offset.min(samples.len())..]);
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
                // This runs in the output callback, which does not log. A full channel has a wake
                // pending, and a closed one means no producer is waiting for room.
                match self.room.try_send(()) {
                    Ok(()) | Err(TrySendError::Full(()) | TrySendError::Disconnected(())) => {}
                }
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
mod device_tests {
    use super::{AudioOutputDevice, AudioOutputSelection, sort_output_devices};

    fn device(id: &str, name: &str) -> AudioOutputDevice {
        AudioOutputDevice {
            id: id.to_owned(),
            name: name.to_owned(),
        }
    }

    #[test]
    fn sorts_devices_by_name() {
        let mut devices = vec![device("id-b", "Speakers"), device("id-a", "Headphones")];

        sort_output_devices(&mut devices);

        assert_eq!(devices[0].name, "Headphones");
        assert_eq!(devices[1].name, "Speakers");
    }

    #[test]
    fn sorts_equal_names_by_id() {
        let mut devices = vec![device("id-b", "Speakers"), device("id-a", "Speakers")];

        sort_output_devices(&mut devices);

        assert_eq!(devices[0].id, "id-a");
        assert_eq!(devices[1].id, "id-b");
    }

    #[test]
    fn accepts_an_empty_device_list() {
        let mut devices = Vec::new();

        sort_output_devices(&mut devices);

        assert_eq!(devices.len(), 0);
    }

    #[test]
    fn serializes_system_default_selection() {
        assert_eq!(
            serde_json::to_value(AudioOutputSelection::SystemDefault).unwrap(),
            serde_json::json!({"kind": "systemDefault"})
        );
    }

    #[test]
    fn serializes_and_round_trips_specific_selection() {
        let selection = AudioOutputSelection::Device {
            device_id: "device-id".into(),
        };
        let value = serde_json::to_value(&selection).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"kind": "device", "deviceId": "device-id"})
        );
        assert_eq!(
            serde_json::from_value::<AudioOutputSelection>(value).unwrap(),
            selection
        );
    }
}

#[cfg(test)]
mod pcm_queue_tests {
    use super::{WaitCancelled, bounded_pcm_queue};
    use crate::player::pcm::ChannelCount;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
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
        assert!(bounded_pcm_queue(0, ChannelCount::new(2).unwrap()).is_none());
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
        let writer = std::thread::Builder::new()
            .name("pcm-producer".into())
            .spawn(move || producer.write_all(&[1.0, 2.0, 3.0, 4.0], || false, |_| {}))
            .unwrap();

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
        let writer = std::thread::Builder::new()
            .name("pcm-producer".into())
            .spawn(move || {
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
            })
            .unwrap();

        let mut out = [0.0; 10];
        let mut drained = 0;
        while drained < 4_000 {
            let popped = consumer.pop_samples(&mut out);
            drained += popped;
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
        let writer = std::thread::Builder::new()
            .name("pcm-producer".into())
            .spawn(move || producer.write_all(&[1.0, 2.0], || flag.load(Ordering::SeqCst), |_| {}))
            .unwrap();

        std::thread::sleep(Duration::from_millis(20));
        cancelled.store(true, Ordering::SeqCst);
        waker.wake();

        assert_eq!(writer.join().unwrap(), Err(WaitCancelled));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CallbackState, Chain, LatestPosition, OutputEvent, OutputStreamId, PipelineId,
        PipelineQueue, PositionUpdate, StreamCallbacks, StreamFailureKind, calculate_end_time,
        classify_stream_error_kind, played_frame_position, sample_format_rank,
        select_output_config,
    };
    use crate::meter::Meter;
    use crate::player::output::{PcmProducer, bounded_pcm_queue};
    use crate::player::pcm::ChannelCount;
    use crate::player::volume::AtomicEffectiveGain;
    use cpal::{
        Sample, SampleFormat, StreamInstant, SupportedBufferSize, SupportedStreamConfigRange,
    };
    use parking_lot::Mutex;
    use std::sync::Arc;
    use std::time::Duration;

    fn range(sample_format: SampleFormat, channels: u16) -> SupportedStreamConfigRange {
        SupportedStreamConfigRange::new(
            channels,
            44_100,
            48_000,
            SupportedBufferSize::Unknown,
            sample_format,
        )
    }

    #[test]
    fn selects_matching_configuration_and_prefers_f32() {
        let config = select_output_config(
            [
                range(SampleFormat::I16, 2),
                range(SampleFormat::F32, 2),
                range(SampleFormat::F64, 2),
                range(SampleFormat::F32, 1),
            ],
            44_100,
            2,
        )
        .expect("matching format must be selected");

        assert_eq!(config.sample_format(), SampleFormat::F32);
        assert_eq!(config.channels(), 2);
        assert_eq!(config.sample_rate(), 44_100);
    }

    #[test]
    fn classifies_stream_error_kinds() {
        assert_eq!(
            classify_stream_error_kind(cpal::ErrorKind::DeviceChanged),
            StreamFailureKind::DeviceChanged
        );
        assert_eq!(
            classify_stream_error_kind(cpal::ErrorKind::DeviceNotAvailable),
            StreamFailureKind::DeviceUnavailable
        );
        assert_eq!(
            classify_stream_error_kind(cpal::ErrorKind::BackendError),
            StreamFailureKind::RuntimeFailed
        );
    }

    #[test]
    fn rejects_mismatched_or_unsupported_configurations() {
        assert!(select_output_config([range(SampleFormat::F32, 1)], 44_100, 2).is_err());
        assert!(select_output_config([range(SampleFormat::F32, 2)], 96_000, 2).is_err());
        assert!(select_output_config([range(SampleFormat::DsdU8, 2)], 44_100, 2).is_err());
    }

    #[test]
    fn ranks_all_supported_sample_formats_deterministically() {
        let formats = [
            SampleFormat::F32,
            SampleFormat::F64,
            SampleFormat::I32,
            SampleFormat::I24,
            SampleFormat::I16,
            SampleFormat::I8,
            SampleFormat::U32,
            SampleFormat::U24,
            SampleFormat::U16,
            SampleFormat::U8,
            SampleFormat::I64,
            SampleFormat::U64,
        ];
        let mut ranked = formats
            .into_iter()
            .map(|format| (sample_format_rank(format).unwrap(), format))
            .collect::<Vec<_>>();
        ranked.sort_by_key(|(rank, _)| *rank);

        assert_eq!(
            ranked.iter().map(|(_, format)| *format).collect::<Vec<_>>(),
            formats
        );
    }

    #[test]
    fn calculates_completion_time_from_frames() {
        let start = StreamInstant::new(10, 0);
        let end = calculate_end_time(start, 4, 2, 44_100).expect("time must calculate");
        assert_eq!(
            end.checked_duration_since(start),
            Some(Duration::from_secs_f64(2.0 / 44_100.0))
        );
        assert!(calculate_end_time(start, 3, 2, 44_100).is_none());
        assert!(calculate_end_time(start, usize::MAX, 1, 0).is_none());
    }

    #[test]
    fn latest_position_keeps_the_newest_report() {
        let cell = LatestPosition::default();
        for start_frame in [0, 480, 960] {
            cell.publish(PositionUpdate {
                pipeline: PipelineId(1),
                start_frame,
                end_frame: start_frame + 480,
                playback_time: StreamInstant::new(10, 0),
            });
        }
        assert_eq!(cell.take().map(|update| update.start_frame), Some(960));
        assert!(cell.take().is_none());
    }

    #[test]
    fn calculates_played_frames_from_stream_clock_elapsed_time() {
        let position = played_frame_position(
            PositionUpdate {
                pipeline: PipelineId(1),
                start_frame: 100,
                end_frame: 300,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(11, 500_000_000),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 250);
    }

    #[test]
    fn clamps_and_keeps_played_position_monotonic() {
        let update = PositionUpdate {
            pipeline: PipelineId(1),
            start_frame: 900,
            end_frame: 1_000,
            playback_time: StreamInstant::new(10, 0),
        };

        assert_eq!(
            played_frame_position(update, StreamInstant::new(12, 0), 100, Some(1_000), 0),
            1_000
        );
        assert_eq!(
            played_frame_position(update, StreamInstant::new(10, 0), 100, Some(1_000), 950),
            950
        );
    }

    #[test]
    fn stops_at_callback_end_when_stream_clock_runs_past_callback_length() {
        let position = played_frame_position(
            PositionUpdate {
                pipeline: PipelineId(1),
                start_frame: 100,
                end_frame: 150,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(20, 0),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 150);
    }

    #[test]
    fn stops_at_track_end_even_when_callback_end_is_later() {
        let position = played_frame_position(
            PositionUpdate {
                pipeline: PipelineId(1),
                start_frame: 900,
                end_frame: 1_100,
                playback_time: StreamInstant::new(10, 0),
            },
            StreamInstant::new(20, 0),
            100,
            Some(1_000),
            0,
        );

        assert_eq!(position, 1_000);
    }

    #[test]
    fn does_not_move_backwards_when_stream_clock_is_before_playback_timestamp() {
        let update = PositionUpdate {
            pipeline: PipelineId(1),
            start_frame: 100,
            end_frame: 300,
            playback_time: StreamInstant::new(20, 0),
        };
        let now = StreamInstant::new(10, 0);

        assert_eq!(played_frame_position(update, now, 100, Some(1_000), 0), 100);
        assert_eq!(
            played_frame_position(update, now, 100, Some(1_000), 250),
            250
        );
    }

    struct Callback {
        state: CallbackState,
        producer: PcmProducer,
        position: LatestPosition,
        events: Arc<Mutex<Vec<OutputEvent>>>,
        handoff: triple_buffer::Input<Option<PipelineQueue>>,
        chain: triple_buffer::Input<Option<Chain>>,
        meter: Meter,
    }

    fn callback(channels: usize, capacity_frames: usize, gain: f32) -> Callback {
        let (producer, consumer) =
            bounded_pcm_queue(capacity_frames, ChannelCount::new(channels).unwrap()).unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&events);
        let position = LatestPosition::default();
        let meter = Meter::new();
        let (handoff, slot) = triple_buffer::TripleBuffer::default().split();
        let (chain, chain_slot) = triple_buffer::TripleBuffer::default().split();
        let state = CallbackState::new(
            PipelineQueue {
                consumer,
                pipeline: PipelineId(1),
            },
            slot,
            chain_slot,
            channels,
            100,
            StreamCallbacks {
                stream: OutputStreamId(1),
                gain: AtomicEffectiveGain::new(gain),
                events: Arc::new(move |event| sink.lock().push(event)),
                meter: meter.clone(),
            },
            position.clone(),
        );
        Callback {
            state,
            producer,
            position,
            events,
            handoff,
            chain,
            meter,
        }
    }

    fn at(seconds: u64) -> StreamInstant {
        StreamInstant::new(seconds, 0)
    }

    #[test]
    fn fill_applies_gain_before_integer_conversion_and_pads_with_equilibrium() {
        let mut callback = callback(1, 3, 0.5);
        assert_eq!(callback.producer.push_samples(&[-1.0, 0.5, 1.0]), 3);
        let mut output = [0i16; 4];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output[..3], [-16_384, 8_192, 16_384]);
        assert_eq!(output[3], i16::EQUILIBRIUM);

        let mut empty = [0u16; 2];
        callback.state.fill(&mut empty, at(11));
        assert_eq!(empty, [u16::EQUILIBRIUM; 2]);
    }

    #[test]
    fn fill_feeds_the_meter_what_it_played_after_gain() {
        let mut callback = callback(2, 8, 0.5);
        callback.producer.push_samples(&[1.0; 8]);
        let (sender, receiver) = std::sync::mpsc::channel();
        callback.meter.start(Box::new(move |frame| {
            sender.send(frame.clone()).ok();
        }));
        callback.meter.set_running(true);

        let mut output = [0.0_f32; 8];
        callback.state.fill(&mut output, at(10));

        let frame = receiver
            .recv_timeout(Duration::from_secs(5))
            .expect("a frame arrives");
        assert!((frame.peak[0] - 20.0 * 0.5_f32.log10()).abs() < 0.01);
        assert_eq!(frame.clip, [false; 2], "clip is judged after the volume");
    }

    #[test]
    fn fill_handles_buffers_larger_than_one_chunk() {
        let mut callback = callback(2, 2_048, 1.0);
        let samples: Vec<f32> = (0..2_000).map(|index| index as f32 / 4_000.0).collect();
        callback.producer.push_samples(&samples);
        let mut output = vec![0.0_f32; 2_400];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output[..2_000], samples[..]);
        assert!(output[2_000..].iter().all(|sample| *sample == 0.0));
    }

    #[test]
    fn fill_reports_the_frames_it_consumed_as_the_newest_position() {
        let mut callback = callback(2, 8, 1.0);
        callback.producer.push_samples(&[0.1; 8]);
        let mut output = [0.0_f32; 4];

        callback.state.fill(&mut output, at(10));
        callback.state.fill(&mut output, at(11));

        let update = callback.position.take().expect("a position was reported");
        assert_eq!((update.start_frame, update.end_frame), (2, 4));
        assert_eq!(update.playback_time, at(11));
    }

    #[test]
    fn fill_reports_completion_once_after_the_producer_finished_and_the_queue_drained() {
        let mut callback = callback(1, 8, 1.0);
        callback.producer.push_samples(&[0.1; 4]);
        callback.producer.finish();
        let mut output = [0.0_f32; 3];

        callback.state.fill(&mut output, at(10));
        assert!(callback.events.lock().is_empty(), "one sample is left");

        callback.state.fill(&mut output, at(11));
        callback.state.fill(&mut output, at(12));

        let events = callback.events.lock().clone();
        assert_eq!(
            events,
            [OutputEvent::FinalFrames {
                pipeline: PipelineId(1),
                end_time: calculate_end_time(at(11), 1, 1, 100).unwrap()
            }],
            "completion is timed from the callback that submitted the last frames"
        );
    }

    #[test]
    fn fill_does_not_report_completion_while_the_producer_may_still_write() {
        let mut callback = callback(1, 8, 1.0);
        let mut output = [0.0_f32; 3];

        callback.state.fill(&mut output, at(10));

        assert!(callback.events.lock().is_empty());
    }

    #[test]
    fn fill_reports_a_timing_failure_when_nothing_was_ever_submitted() {
        let mut callback = callback(1, 8, 1.0);
        callback.producer.finish();
        let mut output = [0.0_f32; 3];

        callback.state.fill(&mut output, at(10));
        callback.state.fill(&mut output, at(11));

        assert_eq!(
            callback.events.lock().clone(),
            [OutputEvent::Failed {
                stream: OutputStreamId(1),
                kind: StreamFailureKind::CompletionTimingFailed,
            }]
        );
    }

    fn handoff_queue(callback: &mut Callback, pipeline: u64, samples: &[f32]) -> PcmProducer {
        let (mut producer, consumer) = bounded_pcm_queue(8, ChannelCount::new(1).unwrap()).unwrap();
        producer.push_samples(samples);
        callback.handoff.write(Some(PipelineQueue {
            consumer,
            pipeline: PipelineId(pipeline),
        }));
        producer
    }

    #[test]
    fn fill_switches_to_a_handed_off_queue_and_counts_frames_from_zero_again() {
        let mut callback = callback(1, 8, 1.0);
        callback.producer.push_samples(&[0.1; 4]);
        let mut output = [0.0_f32; 2];
        callback.state.fill(&mut output, at(10));
        assert_eq!(output, [0.1, 0.1]);

        let _next = handoff_queue(&mut callback, 2, &[0.5, 0.6, 0.7]);
        callback.state.fill(&mut output, at(11));

        assert_eq!(
            output,
            [0.5, 0.6],
            "the new queue plays, the old one is left"
        );
        let update = callback.position.take().expect("a position was reported");
        assert_eq!(update.pipeline, PipelineId(2));
        assert_eq!((update.start_frame, update.end_frame), (0, 2));
    }

    #[test]
    fn fill_plays_only_the_newest_of_several_handoffs() {
        let mut callback = callback(1, 8, 1.0);
        let _skipped = handoff_queue(&mut callback, 2, &[0.2; 2]);
        let _newest = handoff_queue(&mut callback, 3, &[0.3; 2]);
        let mut output = [0.0_f32; 2];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output, [0.3, 0.3]);
        assert_eq!(
            callback.position.take().map(|update| update.pipeline),
            Some(PipelineId(3))
        );
    }

    #[test]
    fn fill_reports_completion_for_the_pipeline_it_is_playing() {
        let mut callback = callback(1, 8, 1.0);
        let next = handoff_queue(&mut callback, 2, &[0.5; 2]);
        next.finish();
        let mut output = [0.0_f32; 3];

        callback.state.fill(&mut output, at(10));
        callback.state.fill(&mut output, at(11));

        assert_eq!(
            callback.events.lock().clone(),
            [OutputEvent::FinalFrames {
                pipeline: PipelineId(2),
                end_time: calculate_end_time(at(10), 2, 1, 100).unwrap()
            }]
        );
    }

    fn chain_queue(
        callback: &mut Callback,
        after: u64,
        pipeline: u64,
        samples: &[f32],
    ) -> PcmProducer {
        let (mut producer, consumer) = bounded_pcm_queue(8, ChannelCount::new(1).unwrap()).unwrap();
        producer.push_samples(samples);
        callback.chain.write(Some(Chain {
            after: PipelineId(after),
            next: PipelineQueue {
                consumer,
                pipeline: PipelineId(pipeline),
            },
        }));
        producer
    }

    /// Declares the end of the callback's first queue, which holds what it was given.
    fn finish_first_queue(callback: &mut Callback) {
        let spare = bounded_pcm_queue(1, ChannelCount::new(1).unwrap())
            .unwrap()
            .0;
        std::mem::replace(&mut callback.producer, spare).finish();
    }

    #[test]
    fn fill_moves_to_the_chained_queue_inside_one_buffer_without_silence() {
        let mut callback = callback(1, 8, 1.0);
        callback.producer.push_samples(&[0.1, 0.2, 0.3]);
        finish_first_queue(&mut callback);
        let next = chain_queue(&mut callback, 1, 2, &[0.4, 0.5, 0.6, 0.7]);
        let mut output = [9.0_f32; 6];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
        let update = callback.position.take().expect("a position was reported");
        assert_eq!(update.pipeline, PipelineId(2));
        assert_eq!((update.start_frame, update.end_frame), (0, 3));
        assert_eq!(
            callback.events.lock().clone(),
            [OutputEvent::FinalFrames {
                pipeline: PipelineId(1),
                end_time: calculate_end_time(at(10), 3, 1, 100).unwrap()
            }],
            "the first queue's end is reported as it was heard"
        );
        next.finish();
        let mut rest = [9.0_f32; 3];
        callback.state.fill(&mut rest, at(11));
        assert_eq!(rest, [0.7, 0.0, 0.0]);
    }

    #[test]
    fn fill_waits_for_the_current_queue_before_moving_on() {
        let mut callback = callback(1, 8, 1.0);
        callback.producer.push_samples(&[0.1, 0.2]);
        let _next = chain_queue(&mut callback, 1, 2, &[0.4, 0.5]);
        let mut output = [9.0_f32; 4];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output, [0.1, 0.2, 0.0, 0.0], "an underrun is silence");
        assert_eq!(
            callback.position.take().map(|update| update.pipeline),
            Some(PipelineId(1))
        );
    }

    #[test]
    fn fill_ignores_a_chain_for_a_queue_it_no_longer_plays() {
        let mut callback = callback(1, 8, 1.0);
        let _next = chain_queue(&mut callback, 1, 2, &[0.4; 2]);
        let _seeked = handoff_queue(&mut callback, 3, &[0.3; 4]);
        let mut output = [0.0_f32; 2];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output, [0.3, 0.3]);
        assert!(callback.state.chained.is_none());
    }

    #[test]
    fn a_withdrawn_chain_is_not_played() {
        let mut callback = callback(1, 8, 1.0);
        finish_first_queue(&mut callback);
        let _next = chain_queue(&mut callback, 1, 2, &[0.4; 2]);
        callback.chain.write(None);
        let mut output = [9.0_f32; 2];

        callback.state.fill(&mut output, at(10));

        assert_eq!(output, [0.0, 0.0]);
    }
}
