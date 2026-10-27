//! The output stream and the tracks that play through it: where playback is in a track, and the
//! track a stream is playing or is about to play.

use cpal::StreamInstant;
use std::time::Instant;

use super::queue::QueueEntry;
use crate::ids::PlaybackId;
use crate::library::read::playback::PlayableTrack;
use crate::player::audio::output::{OutputStream, OutputStreamId, PreparedOutputConfig};
use crate::player::audio::pcm::{frame_to_millis, millis_to_frame};
use crate::player::audio::pipeline::Pipeline;

/// Why the loaded session started.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StartedBy {
    Next,
    Previous,
    /// The player moved on by itself: the track ended, or it skipped a track.
    Auto,
    /// Any other start: play a context, play a queue item, restore the queue.
    Jump,
}

/// The output stream. It outlives the pipelines that play through it.
pub(in crate::player) struct Output {
    pub id: OutputStreamId,
    pub stream: Box<dyn OutputStream>,
    pub config: PreparedOutputConfig,
}

impl Output {
    pub(in crate::player) fn sample_rate(&self) -> u32 {
        self.config.processing_plan.output().sample_rate().get()
    }
}

/// Where playback is, in output frames.
pub(in crate::player) struct Position {
    pub sample_rate: u32,
    pub duration_ms: Option<u64>,
    pub frame: u64,
    /// The frame listeners were last told about.
    pub sent_frame: u64,
    /// The frame the current pipeline started from; a seek starts a new one mid-track.
    pub base_frame: u64,
    pub remaining_frames: Option<u64>,
    pub last_send: Instant,
}

impl Position {
    pub(in crate::player) fn from_start(sample_rate: u32, duration_ms: Option<u64>) -> Self {
        Self {
            sample_rate,
            duration_ms,
            frame: 0,
            sent_frame: 0,
            base_frame: 0,
            remaining_frames: duration_ms.map(|duration| millis_to_frame(duration, sample_rate)),
            last_send: Instant::now(),
        }
    }

    pub(in crate::player) fn position_ms(&self) -> u64 {
        frame_to_millis(self.frame, self.sample_rate)
    }

    /// Reads the newest position report from the stream into the position, and returns it.
    pub(in crate::player) fn sample(&mut self, stream: &mut dyn OutputStream) -> u64 {
        let max_frames = self
            .duration_ms
            .map(|duration| millis_to_frame(duration, self.sample_rate));
        let relative = stream.played_frame_position(self.sample_rate, max_frames);
        self.frame = self.absolute(relative);
        self.frame
    }

    /// The frame `relative_frame` into the current stream, never past the end of the track.
    fn absolute(&self, relative_frame: u64) -> u64 {
        self.base_frame.saturating_add(relative_frame).min(
            self.base_frame
                .saturating_add(self.remaining_frames.unwrap_or(u64::MAX)),
        )
    }
}

/// A track on the output: the queue entry it plays, its file, and the pipeline that decodes it.
pub(in crate::player) struct Track {
    pub id: PlaybackId,
    pub entry: QueueEntry,
    pub playable: PlayableTrack,
    pub started_by: StartedBy,
    pub pipeline: Pipeline,
    pub position: Position,
    /// When its last frames are heard, once the stream has reported it.
    pub completion_time: Option<StreamInstant>,
    pub paused: bool,
}

impl Track {
    pub(in crate::player) fn position_ms(&self) -> u64 {
        self.position.position_ms()
    }
}
