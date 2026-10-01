//! The worker's transport state: what is loading, what is loaded, and the operations in flight.

use std::time::{Duration, Instant};

use super::decode_worker::DecodeWorker;
use super::input::PlaybackId;
use super::item::PlaybackItem;
use super::service::Reply;
use super::snapshot::{PlaybackFailureCode, PlaybackSnapshot};
use super::source_loader::SourceLoad;
use crate::audio::compressed_source::CompressedAudioSource;
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{OutputStream, OutputStreamId, PreparedOutputConfig};
use crate::audio::timebase::{frame_to_millis, millis_to_frame};
use cpal::StreamInstant;

pub(super) const POSITION_UPDATE_INTERVAL: Duration = Duration::from_millis(250);

/// The one state the worker is in. The published snapshot is rendered from it and never read back.
#[allow(clippy::large_enum_variant)] // one value lives on the worker; boxing buys nothing
pub(super) enum Transport {
    /// Nothing is loaded or loading.
    Idle,
    Loading(Loading),
    Loaded(Loaded),
    Failed {
        id: Option<PlaybackId>,
        code: PlaybackFailureCode,
    },
}

/// Everything a start carries: what to play, who is waiting for the answer, and how to begin.
pub(super) struct StartRequest {
    pub item: PlaybackItem,
    /// `None` for starts the worker begins on its own (skipping on, the next track, a device switch).
    pub responder: Option<Reply<PlaybackSnapshot>>,
    pub start_paused: bool,
    /// Where to seek to once playing, after a device switch restarted the track.
    pub resume_at_ms: Option<u64>,
    /// A device switch: the selection to commit once the restart is playing. Until then the
    /// current selection stands, and a failure does not skip to another track.
    pub selection: Option<AudioOutputSelection>,
}

pub(super) struct Loading {
    pub id: PlaybackId,
    pub request: StartRequest,
    pub stage: LoadStage,
}

pub(super) enum LoadStage {
    /// Reading and checking the file.
    Source(SourceLoad),
    /// Decoding the first moments into the output queue.
    Prebuffering(Prebuffering),
}

pub(super) struct Prebuffering {
    pub source: CompressedAudioSource,
    pub pipeline: Pipeline,
    pub duration_ms: Option<u64>,
}

/// An output stream and the decode thread feeding it.
pub(super) struct Pipeline {
    pub stream_id: OutputStreamId,
    pub stream: Box<dyn OutputStream>,
    pub config: PreparedOutputConfig,
    pub decode: DecodeWorker,
}

impl Pipeline {
    pub fn sample_rate(&self) -> u32 {
        self.config.processing_plan.output().sample_rate().get()
    }

    pub fn cancel(self) {
        self.decode.cancel_and_join();
    }
}

/// A track that reached the output.
pub(super) struct Loaded {
    pub id: PlaybackId,
    pub item: PlaybackItem,
    pub source: CompressedAudioSource,
    pub pipeline: Pipeline,
    pub position: Position,
    pub completion_time: Option<StreamInstant>,
    pub paused: bool,
    pub seek: Option<SeekInFlight>,
}

impl Loaded {
    pub fn position_ms(&self) -> u64 {
        frame_to_millis(self.position.frame, self.position.sample_rate)
    }

    /// Reads the newest position report from the output into the position.
    pub fn sample_position(&mut self) -> u64 {
        let rate = self.position.sample_rate;
        let max_frames = self
            .position
            .duration_ms
            .map(|duration| millis_to_frame(duration, rate));
        let relative = self.pipeline.stream.played_frame_position(rate, max_frames);
        self.position.absolute(relative)
    }
}

/// Where playback is, in output frames.
pub(super) struct Position {
    pub sample_rate: u32,
    pub duration_ms: Option<u64>,
    pub frame: u64,
    /// The frame the current stream started from; a seek starts a new stream mid-track.
    pub base_frame: u64,
    pub remaining_frames: Option<u64>,
    pub last_publish: Instant,
}

impl Position {
    pub fn from_start(sample_rate: u32, duration_ms: Option<u64>) -> Self {
        Self {
            sample_rate,
            duration_ms,
            frame: 0,
            base_frame: 0,
            remaining_frames: duration_ms.map(|duration| millis_to_frame(duration, sample_rate)),
            last_publish: Instant::now(),
        }
    }

    /// The frame `relative_frame` into the current stream, never past the end of the track.
    pub fn absolute(&self, relative_frame: u64) -> u64 {
        self.base_frame.saturating_add(relative_frame).min(
            self.base_frame
                .saturating_add(self.remaining_frames.unwrap_or(u64::MAX)),
        )
    }
}

/// A seek whose new pipeline is still prebuffering; the old one plays until it is ready.
pub(super) struct SeekInFlight {
    pub pipeline: Pipeline,
    pub output_base_frame: u64,
    pub remaining_frames: u64,
    pub duration_ms: u64,
    pub responder: Option<Reply<PlaybackSnapshot>>,
}

pub(super) fn should_publish_position(
    elapsed_since_publish: Duration,
    position_changed: bool,
) -> bool {
    elapsed_since_publish >= POSITION_UPDATE_INTERVAL && position_changed
}
