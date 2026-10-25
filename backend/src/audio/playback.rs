//! Playback: a `Player` that sends jobs to one worker thread, which owns the queue and the output
//! stream, and reads the states the worker publishes. Every job is answered by the worker, so a
//! call returns once the worker has done what was asked.
//!
//! This file is all the rest of the application sees of playback. Its modules are private.

use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use std::io;
use std::sync::{
    Arc,
    mpsc::{self, Sender, SyncSender},
};
use std::thread::{self, JoinHandle};

use crate::audio::meter::Meter;
use crate::audio::output::{AudioOutputSelection, OutputStreamFactory};
use crate::audio::volume::{
    AtomicEffectiveGain, DEFAULT_PLAYBACK_VOLUME, NormalizedVolume, VolumeState,
};
use crate::audio::waveform::Waveforms;
use crate::errors::CommandError;
use crate::ids::{QueueItemId, TrackId};
use crate::library::Library;
use crate::messages::Versioned;
use crate::state_store::StateStore;
use log::{debug, error};

mod pipeline;
mod queue;
mod state;
#[cfg(test)]
mod tests;
mod transport;
mod worker;

use queue::PlaybackQueue;
use worker::{Input, PlaybackWorker, WorkerLinks};

pub use queue::RepeatMode;
pub use state::{
    PlaybackFailureCode, PlaybackPosition, PlaybackState, QueueState, QueueWindow, UPCOMING_WINDOW,
};

/// The playback choices that outlive a session: what the listener set, restored at startup.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct PlaybackPreferences {
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub repeat_mode: RepeatMode,
    pub shuffle_enabled: bool,
}

impl Default for PlaybackPreferences {
    fn default() -> Self {
        Self {
            volume: DEFAULT_PLAYBACK_VOLUME,
            muted: false,
            output_selection: AudioOutputSelection::SystemDefault,
            repeat_mode: RepeatMode::Off,
            shuffle_enabled: false,
        }
    }
}

type Reply<T> = SyncSender<Result<T, CommandError>>;

/// Answers a request, if anyone is waiting for the answer. A caller that has gone away is not an
/// error.
fn respond<T>(reply: impl Into<Option<Reply<T>>>, result: Result<T, CommandError>) {
    let reply: Option<Reply<T>> = reply.into();
    if let Some(reply) = reply
        && reply.send(result).is_err()
    {
        log::debug!("playback.reply_closed");
    }
}

/// The one object the application holds to play music. The worker stops when it is dropped or
/// `shutdown` is called.
pub(crate) struct Player {
    inputs: Sender<Input>,
    state_store: Arc<StateStore>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    library: Option<Arc<Library>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl Drop for Player {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl Player {
    /// Starts the worker with the saved preferences, on the audio output `output_stream_factory`
    /// opens streams on. Tracks are read from `library`; without one, playing fails with
    /// `LibraryUnavailable`. Its state goes to `state_store`, which holds `PlaybackState::stopped`
    /// until the worker sets its first change. `meter` takes the taps of this player's output
    /// streams, and `waveforms` hears about each track as it is loaded or is about to play.
    /// `on_preferences` hears about every change so the caller can persist it.
    pub(crate) fn start(
        library: Option<Arc<Library>>,
        state_store: Arc<StateStore>,
        meter: Meter,
        waveforms: Arc<Waveforms>,
        preferences: PlaybackPreferences,
        on_preferences: impl Fn(&PlaybackPreferences) + Send + Sync + 'static,
        output_stream_factory: Box<dyn OutputStreamFactory>,
    ) -> io::Result<Self> {
        let (inputs_sender, inputs) = mpsc::channel();
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let output_selection = preferences.output_selection;
        let queue = PlaybackQueue::new(preferences.repeat_mode, preferences.shuffle_enabled);
        let position = Arc::new(RwLock::new(None));
        let links = WorkerLinks {
            state_store: Arc::clone(&state_store),
            position: Arc::clone(&position),
            effective_gain,
            meter,
            inbox: inputs_sender.clone(),
            library: library.clone(),
            waveforms,
            on_preferences: Box::new(on_preferences),
            output_stream_factory,
        };
        let worker = thread::Builder::new()
            .name("worker".into())
            .spawn(move || {
                PlaybackWorker::new(links, queue, volume_state, output_selection).run(&inputs);
            })
            .inspect_err(|cause| log::warn!("playback.worker.start_failed cause={cause}"))?;
        Ok(Self {
            inputs: inputs_sender,
            state_store,
            position,
            library,
            worker: Mutex::new(Some(worker)),
        })
    }

    pub(crate) fn queue_state(&self) -> Versioned<QueueState> {
        self.state_store.queue()
    }

    /// The newest position of the loaded track, `None` when nothing is loaded.
    pub(crate) fn position(&self) -> Option<PlaybackPosition> {
        self.position.read().clone()
    }

    /// Upcoming items from `offset`, read from the published queue and the library now. It does
    /// not wait for the worker.
    pub(crate) fn queue_window(&self, offset: u32, limit: u32) -> QueueWindow {
        let queue_state = self.queue_state();
        queue_state.value.window(
            queue_state.version,
            offset as usize,
            limit as usize,
            self.library.as_deref(),
        )
    }

    /// Replaces the queue with the tracks `track_ids` (in play order) and starts the one at
    /// `start`. Returns once that track is playing; the others are read when needed.
    pub(crate) fn play_queue(
        &self,
        track_ids: Vec<TrackId>,
        start: usize,
    ) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(move |worker, reply| worker.play_queue(track_ids, start, reply))
    }

    pub(crate) fn previous(&self) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(PlaybackWorker::previous)
    }

    pub(crate) fn next(&self) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(PlaybackWorker::next)
    }

    pub(crate) fn pause(&self) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(|worker, reply| respond(reply, worker.pause()))
    }

    pub(crate) fn resume(&self) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(PlaybackWorker::resume)
    }

    /// The worker clamps `position_ms` to the duration of the track it has loaded; the clamp is not
    /// done here, where the loaded track could change before the job arrives.
    pub(crate) fn seek(&self, position_ms: u64) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(move |worker, reply| worker.seek(position_ms, Some(reply)))
    }

    /// The one check of the volume range: a value outside it is refused, not clamped.
    pub(crate) fn set_volume(&self, volume: f32) -> Result<Versioned<PlaybackState>, CommandError> {
        let volume = NormalizedVolume::new(volume).ok_or(CommandError::InvalidVolume)?;
        self.run(move |worker, reply| respond(reply, Ok(worker.set_volume(volume))))
    }

    pub(crate) fn set_muted(&self, muted: bool) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(move |worker, reply| respond(reply, Ok(worker.set_muted(muted))))
    }

    pub(crate) fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(move |worker, reply| worker.set_output_selection(selection, reply))
    }

    pub(crate) fn set_repeat_mode(
        &self,
        mode: RepeatMode,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.run(move |worker, reply| worker.set_repeat_mode(mode, reply))
    }

    pub(crate) fn set_shuffle(&self, enabled: bool) -> Result<Versioned<QueueState>, CommandError> {
        self.run(move |worker, reply| worker.set_shuffle(enabled, reply))
    }

    pub(crate) fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.run(move |worker, reply| worker.remove_queue_item(id, reply))
    }

    /// `to` is a position in the upcoming list, 0 being next up.
    pub(crate) fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.run(move |worker, reply| worker.move_queue_item(id, to, reply))
    }

    /// Makes an upcoming item current and plays it.
    pub(crate) fn play_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(move |worker, reply| worker.play_queue_item(id, reply))
    }

    /// Adds `track` after the current item (`next`) or at the end. With nothing queued it starts
    /// playing instead; the worker decides, so the check cannot race a stop.
    pub(crate) fn enqueue(
        &self,
        track: TrackId,
        next: bool,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.run(move |worker, reply| worker.enqueue(vec![track], next, reply))
    }

    pub(crate) fn clear_queue(&self) -> Result<Versioned<QueueState>, CommandError> {
        self.run(PlaybackWorker::clear_queue)
    }

    /// Puts back the queue before the last replacement, playing the item that was current.
    pub(crate) fn restore_previous_queue(&self) -> Result<Versioned<PlaybackState>, CommandError> {
        self.run(PlaybackWorker::restore_previous_queue)
    }

    /// Stops the worker and waits for it to finish. Calling it again does nothing.
    pub(crate) fn shutdown(&self) {
        if self.inputs.send(Input::Shutdown).is_err() {
            debug!("playback.shutdown_worker_gone");
        }
        if let Some(worker) = self.worker.lock().take()
            && worker.join().is_err()
        {
            error!("playback.worker_panicked");
        }
    }

    /// Runs `job` on the worker thread and blocks until it answers. Callers on an async runtime must
    /// not call this on the runtime itself.
    fn run<T: Send + 'static>(
        &self,
        job: impl FnOnce(&mut PlaybackWorker, Reply<T>) + Send + 'static,
    ) -> Result<T, CommandError> {
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        let job = Box::new(move |worker: &mut PlaybackWorker| job(worker, reply_sender));
        if self.inputs.send(Input::Run(job)).is_err() {
            return Err(CommandError::TaskFailed);
        }
        reply_receiver
            .recv()
            .inspect_err(|cause| log::warn!("playback.worker.reply_lost cause={cause}"))
            .map_err(|_| CommandError::TaskFailed)?
    }
}
