//! The public face of playback: a command channel to the worker thread plus shared, read-only
//! snapshots.

use std::sync::{
    mpsc::{self, SyncSender},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};

use super::item::PlaybackItemSeed;
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{PlaybackQueue, PlaybackRepeatMode};
use super::snapshot::{PlaybackFailureCode, PlaybackQueueSnapshot, PlaybackSnapshot, SnapshotBase};
use super::worker::{PlaybackWorker, WorkerLinks};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::OutputSignal;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::events::SharedEventSink;
use crate::media::validation::ValidatedAudioFile;
use log::error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceError {
    WorkerUnavailable,
    /// A newer request replaced this one before it finished; the caller should not report it.
    Superseded,
    QueueItemNotFound,
    QueueBusy,
    InvalidVolume,
    InvalidDeviceId,
    OutputDeviceUnavailable,
    InvalidPlaybackState,
    DurationUnavailable,
    Seek,
    Output(PlaybackFailureCode),
    Decode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceStartError {
    WorkerStartFailed,
}

pub(super) type Reply<T> = SyncSender<Result<T, PlaybackServiceError>>;

pub(super) enum PlaybackCommand {
    Start {
        items: Vec<PlaybackItemSeed>,
        start_index: usize,
        reply: Reply<PlaybackSnapshot>,
    },
    Previous {
        reply: Reply<PlaybackSnapshot>,
    },
    Next {
        reply: Reply<PlaybackSnapshot>,
    },
    Stop {
        reply: Reply<PlaybackSnapshot>,
    },
    Pause {
        reply: Reply<PlaybackSnapshot>,
    },
    Resume {
        reply: Reply<PlaybackSnapshot>,
    },
    Seek {
        position_ms: u64,
        reply: Reply<PlaybackSnapshot>,
    },
    SetVolume {
        volume: f32,
        reply: Reply<PlaybackSnapshot>,
    },
    Mute {
        reply: Reply<PlaybackSnapshot>,
    },
    Unmute {
        reply: Reply<PlaybackSnapshot>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
        reply: Reply<PlaybackSnapshot>,
    },
    SetRepeatMode {
        mode: PlaybackRepeatMode,
        reply: Reply<PlaybackQueueSnapshot>,
    },
    SetShuffle {
        enabled: bool,
        reply: Reply<PlaybackQueueSnapshot>,
    },
    RemoveQueueItem {
        id: String,
        reply: Reply<PlaybackQueueSnapshot>,
    },
    MoveQueueItem {
        id: String,
        /// Position in the upcoming list, 0 being next up.
        to: usize,
        reply: Reply<PlaybackQueueSnapshot>,
    },
    ClearQueue {
        reply: Reply<PlaybackQueueSnapshot>,
    },
    Output(OutputSignal),
    Shutdown,
}

#[derive(Clone)]
pub struct PlaybackServiceHandle {
    command_sender: SyncSender<PlaybackCommand>,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
}

pub struct PlaybackService {
    handle: PlaybackServiceHandle,
    pub(super) worker: Mutex<Option<JoinHandle<()>>>,
    signal_bridge: Mutex<Option<JoinHandle<()>>>,
}

impl PlaybackService {
    /// Starts the worker with the saved preferences. `observer` hears about every later change
    /// so the caller can persist them.
    pub fn start(
        events: SharedEventSink,
        preferences: PlaybackPreferences,
        observer: PreferencesObserver,
    ) -> Result<Self, PlaybackServiceStartError> {
        let preferences = preferences.sanitized();
        let (command_sender, command_receiver) = mpsc::sync_channel(4);
        let (output_sender, output_receiver) = mpsc::sync_channel(4);
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let output_selection = preferences.output_selection;
        let queue = PlaybackQueue::new(preferences.repeat_mode, preferences.shuffle_enabled);
        let state = Arc::new(RwLock::new(PlaybackSnapshot::Stopped {
            base: SnapshotBase::new(volume_state, output_selection.clone()),
            item: None,
        }));
        let queue_state = Arc::new(RwLock::new(PlaybackQueueSnapshot::of(0, &queue)));
        let links = WorkerLinks {
            snapshot: Arc::clone(&state),
            queue_snapshot: Arc::clone(&queue_state),
            effective_gain,
            command_receiver,
            output_sender,
            events,
            observer,
        };
        let signal_bridge_sender = command_sender.clone();
        let signal_bridge = thread::Builder::new()
            .name("audio-playback-signal-bridge".into())
            .spawn(move || {
                while let Ok(signal) = output_receiver.recv() {
                    if signal_bridge_sender
                        .send(PlaybackCommand::Output(signal))
                        .is_err()
                    {
                        break;
                    }
                }
            })
            .map_err(|_| PlaybackServiceStartError::WorkerStartFailed)?;
        let worker = thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                PlaybackWorker::new(links, queue, volume_state, output_selection).run();
            })
            .map_err(|_| PlaybackServiceStartError::WorkerStartFailed)?;
        Ok(Self {
            handle: PlaybackServiceHandle {
                command_sender,
                snapshot: state,
                queue_snapshot: queue_state,
            },
            worker: Mutex::new(Some(worker)),
            signal_bridge: Mutex::new(Some(signal_bridge)),
        })
    }

    pub fn handle(&self) -> PlaybackServiceHandle {
        self.handle.clone()
    }

    pub fn snapshot(&self) -> PlaybackSnapshot {
        self.handle.snapshot()
    }

    pub fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
        self.handle.queue_snapshot()
    }

    pub fn shutdown(&self) {
        let _ = self.handle.command_sender.send(PlaybackCommand::Shutdown);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                if worker.join().is_err() {
                    error!("playback.worker_panicked");
                }
            }
        }
        if let Ok(mut bridge) = self.signal_bridge.lock() {
            if let Some(bridge) = bridge.take() {
                if bridge.join().is_err() {
                    error!("playback.signal_bridge_panicked");
                }
            }
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
        self.snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
        self.queue_snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Replaces the queue with `items` and starts the one at `start_index`.
    pub fn start(
        &self,
        items: Vec<PlaybackItemSeed>,
        start_index: usize,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start {
            items,
            start_index,
            reply,
        })
    }

    /// Plays one file that has no library identity.
    pub fn play_file(
        &self,
        file: ValidatedAudioFile,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.start(vec![PlaybackItemSeed::from_file(file)], 0)
    }

    pub fn previous(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Previous { reply })
    }

    pub fn next(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Next { reply })
    }

    pub fn stop(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Stop { reply })
    }

    pub fn pause(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Pause { reply })
    }

    pub fn resume(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Resume { reply })
    }

    pub fn seek(&self, position_ms: u64) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Seek { position_ms, reply })
    }

    pub fn set_volume(&self, volume: f32) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetVolume { volume, reply })
    }

    pub fn mute(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Mute { reply })
    }

    pub fn unmute(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Unmute { reply })
    }

    pub fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
    }

    pub fn set_repeat_mode(
        &self,
        mode: PlaybackRepeatMode,
    ) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetRepeatMode { mode, reply })
    }

    pub fn set_shuffle(
        &self,
        enabled: bool,
    ) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetShuffle { enabled, reply })
    }

    pub fn remove_queue_item(
        &self,
        id: String,
    ) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::RemoveQueueItem { id, reply })
    }

    pub fn move_queue_item(
        &self,
        id: String,
        to: usize,
    ) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::MoveQueueItem { id, to, reply })
    }

    pub fn clear_queue(&self) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::ClearQueue { reply })
    }

    /// Blocks until the worker answers, which for a start is after the source is loaded and the
    /// stream is running. Callers on an async runtime must not call this on the runtime itself.
    fn request<T>(
        &self,
        make: impl FnOnce(Reply<T>) -> PlaybackCommand,
    ) -> Result<T, PlaybackServiceError> {
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        self.command_sender
            .send(make(reply_sender))
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?;
        reply_receiver
            .recv()
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?
    }
}
