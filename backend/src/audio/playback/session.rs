//! The stream-side state of playback: the loaded track and the operations still in flight.

use std::time::{Duration, Instant};

use super::decode_worker::{DecodePipeline, DecodeWorker};
use super::item::PlaybackItem;
use super::service::Reply;
use super::snapshot::PlaybackSnapshot;
use super::source_loader::SourceLoadWorker;
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::output::{OutputStreamId, PreparedOutputConfig, PreparedOutputStream};
use cpal::StreamInstant;

pub(super) const POSITION_UPDATE_INTERVAL: Duration = Duration::from_millis(250);

pub(super) struct ActivePlayback {
    pub session_id: u64,
    pub id: OutputStreamId,
    pub item: PlaybackItem,
    pub source: CompressedAudioSource,
    pub output_config: PreparedOutputConfig,
    pub stream: PreparedOutputStream,
    pub completion_time: Option<StreamInstant>,
    pub sample_rate: u32,
    pub duration_ms: Option<u64>,
    pub position_frame: u64,
    pub position_base_frame: u64,
    pub remaining_frames: Option<u64>,
    pub last_position_publish: Instant,
    pub decoder_worker: DecodeWorker,
}

pub(super) struct PendingPlayback {
    pub session_id: u64,
    pub item: PlaybackItem,
    pub source: CompressedAudioSource,
    pub output_config: PreparedOutputConfig,
    pub id: OutputStreamId,
    pub stream: PreparedOutputStream,
    pub decode_pipeline: DecodePipeline,
    pub sample_rate: u32,
    pub duration_ms: Option<u64>,
    pub reply: Reply<PlaybackSnapshot>,
    pub start_paused: bool,
}

impl PendingPlayback {
    pub fn into_active(self) -> (ActivePlayback, Reply<PlaybackSnapshot>, bool) {
        let Self {
            session_id,
            item,
            source,
            output_config,
            id,
            stream,
            decode_pipeline,
            sample_rate,
            duration_ms,
            reply,
            start_paused,
        } = self;
        (
            ActivePlayback {
                session_id,
                id,
                item,
                source,
                output_config,
                stream,
                completion_time: None,
                sample_rate,
                duration_ms,
                position_frame: 0,
                position_base_frame: 0,
                remaining_frames: duration_ms
                    .map(|duration| duration_to_frames(duration, sample_rate)),
                last_position_publish: Instant::now(),
                decoder_worker: decode_pipeline.into_worker(),
            },
            reply,
            start_paused,
        )
    }
}

pub(super) struct PendingSeek {
    pub session_id: u64,
    pub id: OutputStreamId,
    pub confirmed_position_ms: u64,
    pub output_base_frame: u64,
    pub remaining_frames: u64,
    pub stream: PreparedOutputStream,
    pub output_config: PreparedOutputConfig,
    pub decode_pipeline: DecodePipeline,
    pub sample_rate: u32,
    pub duration_ms: u64,
    pub reply: Reply<PlaybackSnapshot>,
}

pub(super) struct PendingSourceLoad {
    pub item: PlaybackItem,
    pub worker: SourceLoadWorker,
    pub reply: Reply<PlaybackSnapshot>,
    pub start_paused: bool,
}

pub(super) fn frame_to_millis(frame_position: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    ((u128::from(frame_position) * 1_000) / u128::from(sample_rate)).min(u128::from(u64::MAX))
        as u64
}

pub(super) fn millis_to_frame(position_ms: u64, sample_rate: u32) -> u64 {
    u128::from(position_ms)
        .saturating_mul(u128::from(sample_rate))
        .checked_div(1_000)
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

pub(super) fn absolute_position(active: &ActivePlayback, relative_frame: u64) -> u64 {
    active
        .position_base_frame
        .saturating_add(relative_frame)
        .min(
            active
                .position_base_frame
                .saturating_add(active.remaining_frames.unwrap_or(u64::MAX)),
        )
}

pub(super) fn source_to_output_frame(source_frame: u64, output_rate: u32, source_rate: u32) -> u64 {
    u128::from(source_frame)
        .saturating_mul(u128::from(output_rate))
        .checked_div(u128::from(source_rate))
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

pub(super) fn duration_to_frames(duration_ms: u64, sample_rate: u32) -> u64 {
    millis_to_frame(duration_ms, sample_rate)
}

pub(super) fn should_publish_position(
    elapsed_since_publish: Duration,
    position_changed: bool,
) -> bool {
    elapsed_since_publish >= POSITION_UPDATE_INTERVAL && position_changed
}
