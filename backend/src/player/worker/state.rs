//! The stages of the worker state. Each stage holds what it needs, and leaving a stage drops it.

use super::PlayerWorker;
use super::types::StartRequest;
use crate::ids::QueueItemId;
use crate::library::read::playback::PlayableTrack;
use crate::player::output::PcmConsumer;
use crate::player::pipeline::{Pipeline, SourceLoad};
use crate::player::queue::QueueEntry;
use crate::player::state::PlaybackFailureCode;
use crate::player::transport::{Output, Track};

/// A start whose file is being read.
pub(super) struct StartLoad {
    pub(super) load: SourceLoad,
    pub(super) request: StartRequest,
}

/// A start whose stream is open and whose first samples are decoding.
pub(super) struct Starting {
    pub(super) request: StartRequest,
    pub(super) track: Track,
}

/// The track that follows the playing one, being read.
pub(super) struct NextLoad {
    pub(super) load: SourceLoad,
    pub(super) entry: QueueEntry,
    pub(super) playable: PlayableTrack,
}

/// A seek whose file is being read. The playing track keeps playing until the seek is ready.
pub(super) struct SeekLoad {
    pub(super) load: SourceLoad,
    pub(super) duration_ms: u64,
}

/// A seek whose new pipeline is decoding. The stream switches to its queue once it is prebuffered.
pub(super) struct PendingSeek {
    pub(super) pipeline: Pipeline,
    pub(super) queue: PcmConsumer,
    pub(super) base_frame: u64,
    pub(super) remaining_frames: u64,
    pub(super) duration_ms: u64,
}

/// The last failure. The worker state is stopped until the listener retries or moves on.
pub(super) struct Failed {
    pub(super) code: PlaybackFailureCode,
    /// The worker moves on to the next item by itself: a skip, not a stop that waits for Retry.
    pub(super) skipping: bool,
}

/// What the worker state is doing. Each stage holds what it needs. Leaving a stage drops it, which
/// stops the loads and decode threads it owns and closes the stream when no output is left.
pub(super) enum WorkerState {
    /// Nothing plays. `failed` is the last failure, kept until the listener retries or moves on.
    Idle { failed: Option<Failed> },
    /// A start's file is being read.
    Loading(StartLoad),
    /// A start's stream is open and its first samples are decoding.
    Starting { output: Output, starting: Starting },
    /// The track plays or is paused on `output`. A track may be chained after it, and a seek may
    /// be in flight.
    Loaded {
        output: Output,
        current: Track,
        next: Next,
        seek: Seek,
    },
}

/// The track that follows the loaded one.
pub(super) enum Next {
    None,
    /// The file is being read.
    Loading(NextLoad),
    /// Decoded and chained to the stream, so it plays without a gap.
    Ready(Track),
    /// Its prefetch failed. The entry is not prefetched again until the worker state moves on.
    Failed(QueueItemId),
}

/// A seek of the loaded track.
pub(super) enum Seek {
    None,
    Loading(SeekLoad),
    Decoding(PendingSeek),
}

impl PlayerWorker {
    pub(super) fn is_playing(&self) -> bool {
        self.current().is_some_and(|track| !track.paused)
    }

    /// Replaces what follows the playing track. A track that was chained to the stream is unchained
    /// first, and the rest is dropped with its value.
    pub(super) fn set_next(&mut self, value: Next) {
        if let WorkerState::Loaded { output, next, .. } = &mut self.state {
            if let Next::Ready(_) = next {
                output.stream.clear_next();
            }
            *next = value;
        }
    }

    /// Replaces the seek of the loaded track. Nothing happens when no track is loaded.
    pub(super) fn set_seek(&mut self, value: Seek) {
        if let WorkerState::Loaded { seek, .. } = &mut self.state {
            *seek = value;
        }
    }

    /// Lets go of everything in flight. Dropping the worker state stops its threads, and the output
    /// stream is closed.
    pub(super) fn discard_state(&mut self) {
        self.meter.set_running(false);
        self.state = WorkerState::Idle { failed: None };
    }

    /// Takes the worker state out, leaving nothing in flight. The caller puts back the stage it keeps.
    pub(super) fn take_state(&mut self) -> WorkerState {
        std::mem::replace(&mut self.state, WorkerState::Idle { failed: None })
    }

    /// The loaded track, playing or paused.
    pub(super) fn current(&self) -> Option<&Track> {
        if let WorkerState::Loaded { current, .. } = &self.state {
            Some(current)
        } else {
            None
        }
    }

    /// The output stream of the start in progress or of the loaded track.
    pub(super) fn output(&self) -> Option<&Output> {
        match &self.state {
            WorkerState::Starting { output, .. } | WorkerState::Loaded { output, .. } => {
                Some(output)
            }
            WorkerState::Idle { .. } | WorkerState::Loading(_) => None,
        }
    }

    pub(super) fn output_mut(&mut self) -> Option<&mut Output> {
        match &mut self.state {
            WorkerState::Starting { output, .. } | WorkerState::Loaded { output, .. } => {
                Some(output)
            }
            WorkerState::Idle { .. } | WorkerState::Loading(_) => None,
        }
    }

    /// Whether a start has begun and not yet produced its track.
    pub(super) fn is_starting(&self) -> bool {
        matches!(
            self.state,
            WorkerState::Loading(_) | WorkerState::Starting { .. }
        )
    }

    /// The start in progress: its file is being read, or its first samples are decoding.
    pub(super) fn loading_request(&self) -> Option<&StartRequest> {
        match &self.state {
            WorkerState::Loading(load) => Some(&load.request),
            WorkerState::Starting { starting, .. } => Some(&starting.request),
            _ => None,
        }
    }
}
