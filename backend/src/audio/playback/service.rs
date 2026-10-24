//! The public face of playback: a command channel to the worker thread plus shared, read-only
//! snapshots.

use parking_lot::{Mutex, RwLock};
use std::sync::{
    Arc,
    mpsc::{self, SyncSender},
};
use std::thread::{self, JoinHandle};

use super::TrackListener;
use super::input::{Inbox, WorkerInput};
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{PlaybackQueue, RepeatMode};
use super::resolver::TrackResolver;
use super::snapshot::{
    PlaybackControls, PlaybackFailureCode, PlaybackPosition, PlaybackState, QueueState, QueueWindow,
};
use super::worker::{PlaybackWorker, WorkerLinks};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::meter::MeterHub;
use crate::audio::output::OutputBackend;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::errors::CommandError;
use crate::ids::{QueueItemId, TrackId};
use crate::library::store::{PlaybackLookupError, PlaybackSourceError};
use crate::messages::{Revisioned, SharedMessageListener};
use log::{debug, error};

/// Why a playback request failed: the one error vocabulary for every command that plays or
/// queues, serialized as `{ "code": "<camelCase>" }`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackServiceError {
    Common {
        error: CommandError,
    },
    /// The output or the decoder failed.
    Output {
        failure: PlaybackFailureCode,
    },
    /// The Library could not give the tracks to play.
    Source {
        error: PlaybackSourceError,
    },
    WorkerUnavailable,
    /// A newer request replaced this one before it finished; the caller should not report it.
    Superseded,
    QueueItemNotFound,
    QueueBusy,
    InvalidVolume,
    InvalidDeviceId,
    InvalidPlaybackState,
    DurationUnavailable,
    SeekFailed,
}

impl From<PlaybackFailureCode> for PlaybackServiceError {
    fn from(failure: PlaybackFailureCode) -> Self {
        Self::Output { failure }
    }
}

impl From<PlaybackLookupError> for PlaybackServiceError {
    fn from(error: PlaybackLookupError) -> Self {
        match error {
            PlaybackLookupError::Common(error) => Self::Common { error },
            PlaybackLookupError::Source(error) => Self::Source { error },
        }
    }
}

/// The codes the Renderer shows for a playback command. A worker or device id the program
/// produced is a bug, so it is shown as a failed task.
impl From<PlaybackServiceError> for CommandError {
    fn from(error: PlaybackServiceError) -> Self {
        match error {
            PlaybackServiceError::Common { error } => error,
            PlaybackServiceError::Output { failure } => Self::Output { failure },
            PlaybackServiceError::Source { error } => error.into(),
            PlaybackServiceError::WorkerUnavailable | PlaybackServiceError::InvalidDeviceId => {
                Self::TaskFailed
            }
            PlaybackServiceError::Superseded => Self::Superseded,
            PlaybackServiceError::QueueItemNotFound => Self::QueueItemNotFound,
            PlaybackServiceError::QueueBusy => Self::QueueBusy,
            PlaybackServiceError::InvalidVolume => Self::InvalidVolume,
            PlaybackServiceError::InvalidPlaybackState => Self::InvalidPlaybackState,
            PlaybackServiceError::DurationUnavailable => Self::DurationUnavailable,
            PlaybackServiceError::SeekFailed => Self::SeekFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommandError, PlaybackServiceError, PlaybackSourceError};

    #[test]
    fn worker_and_device_faults_are_failed_tasks() {
        assert_eq!(
            CommandError::from(PlaybackServiceError::WorkerUnavailable),
            CommandError::TaskFailed
        );
        assert_eq!(
            CommandError::from(PlaybackServiceError::InvalidDeviceId),
            CommandError::TaskFailed
        );
    }

    #[test]
    fn source_reasons_map_to_the_shared_codes() {
        assert_eq!(
            CommandError::from(PlaybackServiceError::Source {
                error: PlaybackSourceError::TrackNotMember,
            }),
            CommandError::TrackNotFound
        );
        assert_eq!(
            CommandError::from(PlaybackServiceError::Source {
                error: PlaybackSourceError::NoPlayablePlaybackTracks,
            }),
            CommandError::TrackUnavailable
        );
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub(crate) enum PlaybackServiceStartError {
    #[error("the playback worker thread could not start")]
    WorkerStartFailed,
}

pub(super) type Reply<T> = SyncSender<Result<T, PlaybackServiceError>>;

/// Answers a request, if anyone is waiting for the answer. A caller that has gone away is logged,
/// not an error.
pub(super) fn respond<T>(
    reply: impl Into<Option<Reply<T>>>,
    result: Result<T, PlaybackServiceError>,
) {
    let reply: Option<Reply<T>> = reply.into();
    if let Some(reply) = reply
        && reply.send(result).is_err()
    {
        debug!("playback.reply_closed");
    }
}

pub(super) enum PlaybackCommand {
    Start {
        track_ids: Vec<TrackId>,
        start_index: usize,
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Previous {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Next {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Pause {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Resume {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Seek {
        position_ms: u64,
        reply: Reply<Revisioned<PlaybackState>>,
    },
    SetVolume {
        volume: f32,
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Mute {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Unmute {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
        reply: Reply<Revisioned<PlaybackState>>,
    },
    SetRepeatMode {
        mode: RepeatMode,
        reply: Reply<Revisioned<QueueState>>,
    },
    SetShuffle {
        enabled: bool,
        reply: Reply<Revisioned<QueueState>>,
    },
    RemoveQueueItem {
        id: QueueItemId,
        reply: Reply<Revisioned<QueueState>>,
    },
    MoveQueueItem {
        id: QueueItemId,
        /// Position in the upcoming list, 0 being next up.
        to: usize,
        reply: Reply<Revisioned<QueueState>>,
    },
    ClearQueue {
        reply: Reply<Revisioned<QueueState>>,
    },
    /// Puts back the queue the last replacement (or Clear upcoming) took away.
    RestorePreviousQueue {
        reply: Reply<Revisioned<PlaybackState>>,
    },
    /// Makes an upcoming item current and plays it.
    PlayQueueItem {
        id: QueueItemId,
        reply: Reply<Revisioned<PlaybackState>>,
    },
    Enqueue {
        track_ids: Vec<TrackId>,
        /// Right after the current item rather than at the end.
        next: bool,
        reply: Reply<Revisioned<QueueState>>,
    },
}

#[derive(Clone)]
pub(crate) struct PlaybackServiceHandle {
    inbox: Inbox,
    snapshot: Arc<RwLock<Revisioned<PlaybackState>>>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    queue_snapshot: Arc<RwLock<Revisioned<QueueState>>>,
    meter: MeterHub,
}

pub(crate) struct PlaybackService {
    handle: PlaybackServiceHandle,
    pub(super) worker: Mutex<Option<JoinHandle<()>>>,
}

impl PlaybackService {
    /// Starts the worker with the saved preferences, on the audio output `backend` opens streams
    /// on. `observer` hears about every later change so the caller can persist them; `tracks` is
    /// where queue entries get their metadata; `listener` hears about each track when it is loaded
    /// and when it starts opening as the next one.
    pub(crate) fn start_with_backend(
        messages: SharedMessageListener,
        preferences: PlaybackPreferences,
        observer: PreferencesObserver,
        tracks: Arc<TrackResolver>,
        listener: TrackListener,
        backend: Box<dyn OutputBackend>,
    ) -> Result<Self, PlaybackServiceStartError> {
        let preferences = preferences.sanitized();
        let (inbox, inputs) = Inbox::channel();
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let meter = MeterHub::new();
        let output_selection = preferences.output_selection;
        let queue = PlaybackQueue::new(preferences.repeat_mode, preferences.shuffle_enabled);
        let state = Arc::new(RwLock::new(Revisioned::new(PlaybackState::Stopped {
            base: PlaybackControls::new(volume_state, output_selection.clone()),
            item: None,
        })));
        let queue_state = Arc::new(RwLock::new(Revisioned::new(QueueState::empty(
            queue.repeat(),
            queue.shuffle(),
        ))));
        let position = Arc::new(RwLock::new(None));
        let links = WorkerLinks {
            snapshot: Arc::clone(&state),
            position: Arc::clone(&position),
            queue_snapshot: Arc::clone(&queue_state),
            effective_gain,
            meter: meter.clone(),
            inbox: inbox.clone(),
            messages,
            observer,
            backend,
            tracks,
            listener,
        };
        let worker = thread::Builder::new()
            .name("worker".into())
            .spawn(move || {
                PlaybackWorker::new(links, queue, volume_state, output_selection).run(&inputs);
            })
            .inspect_err(|cause| log::warn!("playback.worker.start_failed cause={cause}"))
            .map_err(|_| PlaybackServiceStartError::WorkerStartFailed)?;
        Ok(Self {
            handle: PlaybackServiceHandle {
                inbox,
                snapshot: state,
                position,
                queue_snapshot: queue_state,
                meter,
            },
            worker: Mutex::new(Some(worker)),
        })
    }

    pub(crate) fn handle(&self) -> PlaybackServiceHandle {
        self.handle.clone()
    }

    /// Where Meter frames are subscribed to; its taps belong to this service's output streams.
    pub(crate) fn meter(&self) -> MeterHub {
        self.handle.meter.clone()
    }

    pub(crate) fn snapshot(&self) -> PlaybackState {
        self.handle.snapshot()
    }

    /// The transport snapshot with the revision of its topic.
    pub(crate) fn versioned_snapshot(&self) -> Revisioned<PlaybackState> {
        self.handle.versioned_snapshot()
    }

    pub(crate) fn position(&self) -> Option<PlaybackPosition> {
        self.handle.position()
    }

    /// The queue snapshot with the revision of its topic.
    pub(crate) fn versioned_queue_snapshot(&self) -> Revisioned<QueueState> {
        self.handle.versioned_queue_snapshot()
    }

    pub(crate) fn shutdown(&self) {
        self.handle.inbox.send(WorkerInput::Shutdown);
        if let Some(worker) = self.worker.lock().take()
            && worker.join().is_err()
        {
            error!("playback.worker_panicked");
        }
    }
}

impl Drop for PlaybackService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl PlaybackServiceHandle {
    pub(crate) fn snapshot(&self) -> PlaybackState {
        self.versioned_snapshot().value
    }

    pub(crate) fn versioned_snapshot(&self) -> Revisioned<PlaybackState> {
        self.snapshot.read().clone()
    }

    /// The newest position of the loaded track, `None` when nothing is loaded.
    pub(crate) fn position(&self) -> Option<PlaybackPosition> {
        self.position.read().clone()
    }

    pub(crate) fn versioned_queue_snapshot(&self) -> Revisioned<QueueState> {
        self.queue_snapshot.read().clone()
    }

    /// Upcoming items from `offset`; a window of the queue the snapshot only starts. Reads the
    /// library, so it blocks like the other requests.
    pub(crate) fn queue_window(&self, offset: usize, limit: usize) -> QueueWindow {
        // Copy the snapshot out first: the library is read without holding the worker's lock.
        let queue = self.versioned_queue_snapshot();
        queue.value.window(queue.revision, offset, limit)
    }

    /// Replaces the queue with the tracks `track_ids` (in play order) and starts the one at
    /// `start_index`. Returns once that track is playing; the others are read when needed.
    pub(crate) fn start(
        &self,
        track_ids: Vec<TrackId>,
        start_index: usize,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start {
            track_ids,
            start_index,
            reply,
        })
    }

    pub(crate) fn previous(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Previous { reply })
    }

    pub(crate) fn next(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Next { reply })
    }

    pub(crate) fn pause(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Pause { reply })
    }

    pub(crate) fn resume(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Resume { reply })
    }

    pub(crate) fn seek(
        &self,
        position_ms: u64,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Seek { position_ms, reply })
    }

    pub(crate) fn set_volume(
        &self,
        volume: f32,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetVolume { volume, reply })
    }

    pub(crate) fn mute(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Mute { reply })
    }

    pub(crate) fn unmute(&self) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Unmute { reply })
    }

    pub(crate) fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
    }

    pub(crate) fn set_repeat_mode(
        &self,
        mode: RepeatMode,
    ) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetRepeatMode { mode, reply })
    }

    pub(crate) fn set_shuffle(
        &self,
        enabled: bool,
    ) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetShuffle { enabled, reply })
    }

    pub(crate) fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::RemoveQueueItem { id, reply })
    }

    pub(crate) fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::MoveQueueItem { id, to, reply })
    }

    pub(crate) fn play_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::PlayQueueItem { id, reply })
    }

    /// Adds `items` after the current item (`next`) or at the end. With nothing queued they
    /// start playing instead; the worker decides, so the check cannot race a stop.
    pub(crate) fn enqueue(
        &self,
        track_ids: Vec<TrackId>,
        next: bool,
    ) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next,
            reply,
        })
    }

    pub(crate) fn clear_queue(&self) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::ClearQueue { reply })
    }

    /// Puts back the queue before the last replacement, playing the item that was current.
    pub(crate) fn restore_previous_queue(
        &self,
    ) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::RestorePreviousQueue { reply })
    }

    /// Blocks until the worker answers, which for a start is after the source is loaded and the
    /// stream is running. Callers on an async runtime must not call this on the runtime itself.
    fn request<T>(
        &self,
        make: impl FnOnce(Reply<T>) -> PlaybackCommand,
    ) -> Result<T, PlaybackServiceError> {
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        if !self.inbox.send(WorkerInput::Command(make(reply_sender))) {
            return Err(PlaybackServiceError::WorkerUnavailable);
        }
        reply_receiver
            .recv()
            .inspect_err(|cause| log::warn!("playback.worker.reply_lost cause={cause}"))
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?
    }
}
