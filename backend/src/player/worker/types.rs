//! The inputs, the commands and the plain types that the worker uses.

use crate::ids::{PlaybackId, QueueItemId, TrackId};
use crate::library::Library;
use crate::library::read::playback::PlayableTrack;
use crate::messages::BackendMessage;
use crate::player::errors::PlayerError;
use crate::player::output::{AudioOutputSelection, OutputEvent, OutputStreamFactory};
use crate::player::pipeline::LoadEvent;
use crate::player::queue::{QueueEntry, RepeatMode};
use crate::player::state::{PlaybackPosition, PlayerState, QueueState, QueueWindow, StartedBy};
use crate::player::volume::NormalizedVolume;
use crate::player::waveform::Waveforms;
use crate::settings::SettingsStore;
use std::sync::Arc;
use std::sync::mpsc::Sender;

pub(super) type Reply<T> = crate::threads::Reply<T, PlayerError>;

/// Everything the worker receives.
pub(in crate::player) enum WorkerInput {
    Command(PlayerCommand),
    Load(LoadEvent),
    Output(OutputEvent),
}

/// A command from a caller. The worker answers it on its own reply, once the change is applied.
pub(in crate::player) enum PlayerCommand {
    PlayQueue {
        tracks: Vec<TrackId>,
        start: usize,
        reply: Reply<()>,
    },
    Enqueue {
        tracks: Vec<TrackId>,
        next: bool,
        reply: Reply<()>,
    },
    Pause {
        reply: Reply<()>,
    },
    Resume {
        reply: Reply<()>,
    },
    Previous {
        reply: Reply<()>,
    },
    Next {
        reply: Reply<()>,
    },
    Seek {
        position_ms: u64,
        reply: Reply<()>,
    },
    SetVolume {
        volume: NormalizedVolume,
        reply: Reply<()>,
    },
    SetMuted {
        muted: bool,
        reply: Reply<()>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
        reply: Reply<()>,
    },
    SetRepeatMode {
        mode: RepeatMode,
        reply: Reply<()>,
    },
    SetShuffle {
        enabled: bool,
        reply: Reply<()>,
    },
    RemoveQueueItem {
        id: QueueItemId,
        reply: Reply<()>,
    },
    MoveQueueItem {
        id: QueueItemId,
        to: usize,
        reply: Reply<()>,
    },
    PlayQueueItem {
        id: QueueItemId,
        reply: Reply<()>,
    },
    ClearQueue {
        reply: Reply<()>,
    },
    RestorePreviousQueue {
        reply: Reply<()>,
    },
    QueueWindow {
        offset: u32,
        limit: u32,
        reply: Reply<QueueWindow>,
    },
    Shutdown,
}

/// What a failure condemns. It decides whether the queue moves on.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum FailureAction {
    /// This file cannot be played. The next item is tried.
    SkipItem,
    /// The output failed. Another file would fail the same way, so playback stops with the queue
    /// intact and the listener can retry.
    StopOutput,
}

/// Sends an input to the worker. A worker that has stopped takes nothing, which is not an error.
pub(in crate::player) fn send(inbox: &Sender<WorkerInput>, input: WorkerInput) {
    let _ = inbox.send(input);
}

/// A start: what to play and how to begin.
pub(super) struct StartRequest {
    /// The playback this start belongs to. A device switch restarts the same playback.
    pub(super) id: PlaybackId,
    pub(super) entry: QueueEntry,
    pub(super) playable: PlayableTrack,
    pub(super) started_by: StartedBy,
    pub(super) start_paused: bool,
    /// Where to seek to once playing, after a device switch restarted the track.
    pub(super) resume_at_ms: Option<u64>,
    /// A device switch: the selection to commit once the restart is playing.
    pub(super) selection: Option<AudioOutputSelection>,
}

/// What listeners were last sent. A value is sent again only when it differs from this.
#[derive(Default)]
pub(super) struct LastSentState {
    pub(super) player: Option<PlayerState>,
    pub(super) queue: Option<QueueState>,
    pub(super) position: Option<PlaybackPosition>,
}

/// The services that the worker uses. Its owner creates them and passes them in once.
pub(super) struct WorkerContext {
    pub(super) library: Arc<Library>,
    pub(super) waveforms: Arc<Waveforms>,
    pub(super) settings: Arc<SettingsStore>,
    pub(super) messages: Sender<BackendMessage>,
    pub(super) output_stream_factory: Box<dyn OutputStreamFactory>,
}
