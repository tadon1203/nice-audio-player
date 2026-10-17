//! The public face of playback: a command channel to the worker thread plus shared, read-only
//! snapshots.

use std::sync::{
    Arc, Mutex, RwLock,
    mpsc::{self, SyncSender},
};
use std::thread::{self, JoinHandle};

use super::input::{Inbox, WorkerInput};
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{PlaybackQueue, PlaybackRepeatMode};
use super::resolver::TrackResolver;
use super::snapshot::{
    PlaybackFailureCode, PlaybackPosition, PlaybackQueueSnapshot, PlaybackQueueWindow,
    PlaybackSnapshot, SnapshotBase,
};
use super::worker::{PlaybackWorker, WorkerLinks};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::meter::MeterHub;
use crate::audio::output::OutputBackend;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::audio::waveform::PrefetchObserver;
use crate::ids::{QueueItemId, TrackId};
use crate::library::store::PlaybackSourceError;
use crate::messages::{SharedMessageSink, Versioned};
use crate::tasks::TaskError;
use log::error;

/// Why a playback request failed: the one error vocabulary for every command that plays or
/// queues, serialized as `{ "code": "<camelCase>" }`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum PlaybackServiceError {
    InvalidArgument,
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
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamPauseFailed,
    OutputStreamResumeFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    SampleRateConversionFailed,
    // Resolving what to play from the library.
    InvalidTrackId,
    AlbumNotFound,
    TrackNotMember,
    TrackUnavailable,
    TrackNotPlayable,
    NoPlayableTracks,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}

impl From<PlaybackFailureCode> for PlaybackServiceError {
    fn from(code: PlaybackFailureCode) -> Self {
        match code {
            PlaybackFailureCode::NoOutputDevice => Self::NoOutputDevice,
            PlaybackFailureCode::OutputDeviceUnavailable => Self::OutputDeviceUnavailable,
            PlaybackFailureCode::UnsupportedOutputConfiguration => {
                Self::UnsupportedOutputConfiguration
            }
            PlaybackFailureCode::OutputStreamBuildFailed => Self::OutputStreamBuildFailed,
            PlaybackFailureCode::OutputStreamStartFailed => Self::OutputStreamStartFailed,
            PlaybackFailureCode::OutputStreamPauseFailed => Self::OutputStreamPauseFailed,
            PlaybackFailureCode::OutputStreamResumeFailed => Self::OutputStreamResumeFailed,
            PlaybackFailureCode::OutputStreamRuntimeFailed => Self::OutputStreamRuntimeFailed,
            PlaybackFailureCode::CompletionTimingFailed => Self::CompletionTimingFailed,
            PlaybackFailureCode::DecodeFailed => Self::DecodeFailed,
            PlaybackFailureCode::SampleRateConversionFailed => Self::SampleRateConversionFailed,
        }
    }
}

impl From<PlaybackSourceError> for PlaybackServiceError {
    fn from(error: PlaybackSourceError) -> Self {
        match error {
            PlaybackSourceError::InvalidTrackId => Self::InvalidTrackId,
            PlaybackSourceError::AlbumNotFound => Self::AlbumNotFound,
            PlaybackSourceError::TrackNotMember => Self::TrackNotMember,
            PlaybackSourceError::TrackUnavailable => Self::TrackUnavailable,
            PlaybackSourceError::TrackNotPlayable => Self::TrackNotPlayable,
            PlaybackSourceError::NoPlayableTracks => Self::NoPlayableTracks,
            PlaybackSourceError::PersistenceFailed => Self::PersistenceFailed,
        }
    }
}

impl TaskError for PlaybackServiceError {
    fn task_failed() -> Self {
        Self::TaskFailed
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceStartError {
    WorkerStartFailed,
}

pub(super) type Reply<T> = SyncSender<Result<T, PlaybackServiceError>>;

/// Answers a request, if anyone is waiting for the answer.
pub(super) fn respond<T>(reply: Option<Reply<T>>, result: Result<T, PlaybackServiceError>) {
    if let Some(reply) = reply {
        let _ = reply.send(result);
    }
}

pub(super) enum PlaybackCommand {
    Start {
        track_ids: Vec<TrackId>,
        start_index: usize,
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Previous {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Next {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Pause {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Resume {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Seek {
        position_ms: u64,
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    SetVolume {
        volume: f32,
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Mute {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Unmute {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    SetRepeatMode {
        mode: PlaybackRepeatMode,
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
    SetShuffle {
        enabled: bool,
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
    RemoveQueueItem {
        id: QueueItemId,
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
    MoveQueueItem {
        id: QueueItemId,
        /// Position in the upcoming list, 0 being next up.
        to: usize,
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
    ClearQueue {
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
    /// Puts back the queue the last replacement (or Clear upcoming) took away.
    RestorePreviousQueue {
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    /// Makes an upcoming item current and plays it.
    PlayQueueItem {
        id: QueueItemId,
        reply: Reply<Versioned<PlaybackSnapshot>>,
    },
    Enqueue {
        track_ids: Vec<TrackId>,
        /// Right after the current item rather than at the end.
        next: bool,
        reply: Reply<Versioned<PlaybackQueueSnapshot>>,
    },
}

#[derive(Clone)]
pub struct PlaybackServiceHandle {
    inbox: Inbox,
    snapshot: Arc<RwLock<Versioned<PlaybackSnapshot>>>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    queue_snapshot: Arc<RwLock<Versioned<PlaybackQueueSnapshot>>>,
    meter: MeterHub,
}

pub struct PlaybackService {
    handle: PlaybackServiceHandle,
    pub(super) worker: Mutex<Option<JoinHandle<()>>>,
}

impl PlaybackService {
    /// Starts the worker with the saved preferences, on the audio output `backend` opens streams
    /// on. `observer` hears about every later change so the caller can persist them; `tracks` is
    /// where queue entries get their metadata; `on_prefetch` hears about each track the moment it
    /// starts opening as the next one.
    pub(crate) fn start_with_backend(
        messages: SharedMessageSink,
        preferences: PlaybackPreferences,
        observer: PreferencesObserver,
        tracks: Arc<TrackResolver>,
        on_prefetch: PrefetchObserver,
        backend: Box<dyn OutputBackend>,
    ) -> Result<Self, PlaybackServiceStartError> {
        let preferences = preferences.sanitized();
        let (inbox, inputs) = Inbox::channel();
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let meter = MeterHub::new();
        let output_selection = preferences.output_selection;
        let queue = PlaybackQueue::new(preferences.repeat_mode, preferences.shuffle_enabled);
        let state = Arc::new(RwLock::new(Versioned::new(PlaybackSnapshot::Stopped {
            base: SnapshotBase::new(volume_state, output_selection.clone()),
            item: None,
        })));
        let queue_state = Arc::new(RwLock::new(Versioned::new(PlaybackQueueSnapshot::empty(
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
            on_prefetch,
        };
        let worker = thread::Builder::new()
            .name("worker".into())
            .spawn(move || {
                PlaybackWorker::new(links, queue, volume_state, output_selection).run(inputs);
            })
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

    pub fn handle(&self) -> PlaybackServiceHandle {
        self.handle.clone()
    }

    /// Where Meter frames are subscribed to; its taps belong to this service's output streams.
    pub fn meter(&self) -> MeterHub {
        self.handle.meter.clone()
    }

    pub fn snapshot(&self) -> PlaybackSnapshot {
        self.handle.snapshot()
    }

    /// The transport snapshot with the revision of its topic.
    pub fn versioned_snapshot(&self) -> Versioned<PlaybackSnapshot> {
        self.handle.versioned_snapshot()
    }

    pub fn position(&self) -> Option<PlaybackPosition> {
        self.handle.position()
    }

    /// The queue snapshot with the revision of its topic.
    pub fn versioned_queue_snapshot(&self) -> Versioned<PlaybackQueueSnapshot> {
        self.handle.versioned_queue_snapshot()
    }

    pub fn shutdown(&self) {
        self.handle.inbox.send(WorkerInput::Shutdown);
        if let Ok(mut worker) = self.worker.lock()
            && let Some(worker) = worker.take()
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
    pub fn snapshot(&self) -> PlaybackSnapshot {
        self.versioned_snapshot().value
    }

    pub fn versioned_snapshot(&self) -> Versioned<PlaybackSnapshot> {
        self.snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// The newest position of the loaded track, `None` when nothing is loaded.
    pub fn position(&self) -> Option<PlaybackPosition> {
        self.position
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn versioned_queue_snapshot(&self) -> Versioned<PlaybackQueueSnapshot> {
        self.queue_snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Upcoming items from `offset`; a window of the queue the snapshot only starts. Reads the
    /// library, so it blocks like the other requests.
    pub fn queue_window(&self, offset: usize, limit: usize) -> PlaybackQueueWindow {
        // Copy the snapshot out first: the library is read without holding the worker's lock.
        let queue = self.versioned_queue_snapshot();
        queue.value.window(queue.revision, offset, limit)
    }

    /// Replaces the queue with the tracks `track_ids` (in play order) and starts the one at
    /// `start_index`. Returns once that track is playing; the others are read when needed.
    pub fn start(
        &self,
        track_ids: Vec<TrackId>,
        start_index: usize,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start {
            track_ids,
            start_index,
            reply,
        })
    }

    pub fn previous(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Previous { reply })
    }

    pub fn next(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Next { reply })
    }

    pub fn pause(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Pause { reply })
    }

    pub fn resume(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Resume { reply })
    }

    pub fn seek(
        &self,
        position_ms: u64,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Seek { position_ms, reply })
    }

    pub fn set_volume(
        &self,
        volume: f32,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetVolume { volume, reply })
    }

    pub fn mute(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Mute { reply })
    }

    pub fn unmute(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Unmute { reply })
    }

    pub fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
    }

    pub fn set_repeat_mode(
        &self,
        mode: PlaybackRepeatMode,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetRepeatMode { mode, reply })
    }

    pub fn set_shuffle(
        &self,
        enabled: bool,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetShuffle { enabled, reply })
    }

    pub fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::RemoveQueueItem { id, reply })
    }

    pub fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::MoveQueueItem { id, to, reply })
    }

    pub fn play_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::PlayQueueItem { id, reply })
    }

    /// Adds `items` after the current item (`next`) or at the end. With nothing queued they
    /// start playing instead; the worker decides, so the check cannot race a stop.
    pub fn enqueue(
        &self,
        track_ids: Vec<TrackId>,
        next: bool,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next,
            reply,
        })
    }

    pub fn clear_queue(&self) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::ClearQueue { reply })
    }

    /// Puts back the queue before the last replacement, playing the item that was current.
    pub fn restore_previous_queue(
        &self,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
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
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?
    }
}
