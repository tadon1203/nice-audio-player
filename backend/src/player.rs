//! Playback: a `Player` that sends jobs to one worker thread, which owns the queue and the output
//! stream. A command is answered once the worker has applied it; the worker reports what it does
//! next through the Backend's messages.
//!
//! This file is all the rest of the application sees of playback. Its modules are private, except
//! the audio stages (`decode`, `output`, `pcm`, `processing`, `volume`, `waveform`) and the
//! `fake_output` double, which the rest of the crate names.

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::io;
use std::sync::{
    Arc,
    mpsc::{self, Sender},
};
use std::thread::{self, JoinHandle};

use crate::errors::CommandError;
use crate::ids::{QueueItemId, TrackId};
use crate::library::Library;
use crate::messages::BackendMessage;
use crate::meter::Meter;
use crate::player::output::{AudioOutputSelection, OutputStreamFactory};
use crate::player::volume::{
    AtomicEffectiveGain, DEFAULT_PLAYBACK_VOLUME, NormalizedVolume, VolumeState,
};
use crate::player::waveform::Waveforms;
use log::{debug, error};

pub(crate) mod decode;
#[cfg(test)]
pub(crate) mod fake_output;
pub(crate) mod output;
pub(crate) mod pcm;
pub(crate) mod processing;
pub(crate) mod volume;
pub(crate) mod waveform;

mod pipeline;
mod queue;
mod state;
#[cfg(test)]
mod tests;
mod transport;
mod worker;

use queue::Queue;
use worker::{Input, PlayerWorker, WorkerLinks};

pub use queue::RepeatMode;
pub use state::{
    PlaybackFailureCode, PlaybackPosition, PlayerState, QueueState, QueueWindow, UPCOMING_WINDOW,
};

/// The playback choices that outlive a session: what the listener set, restored at startup.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct PlayerPreferences {
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub repeat_mode: RepeatMode,
    pub shuffle_enabled: bool,
}

impl Default for PlayerPreferences {
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

/// The one object the application holds to play music. The worker stops when it is dropped or
/// `shutdown` is called.
pub(crate) struct Player {
    inputs: Sender<Input>,
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
    /// `LibraryUnavailable`. The worker sends its state to `messages`, starting with the first
    /// values. `meter` takes the taps of this player's output streams, and `waveforms` hears about
    /// each track as it is loaded or is about to play. `on_preferences` hears about every change so
    /// the caller can persist it.
    pub(crate) fn start(
        library: Option<Arc<Library>>,
        messages: Sender<BackendMessage>,
        meter: Meter,
        waveforms: Arc<Waveforms>,
        preferences: PlayerPreferences,
        on_preferences: impl Fn(&PlayerPreferences) + Send + Sync + 'static,
        output_stream_factory: Box<dyn OutputStreamFactory>,
    ) -> io::Result<Self> {
        let (inputs_sender, inputs) = mpsc::channel();
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let output_selection = preferences.output_selection;
        let queue = Queue::new(preferences.repeat_mode, preferences.shuffle_enabled);
        let links = WorkerLinks {
            messages,
            effective_gain,
            meter,
            inbox: inputs_sender.clone(),
            library,
            waveforms,
            on_preferences: Box::new(on_preferences),
            output_stream_factory,
        };
        let worker = thread::Builder::new()
            .name("worker".into())
            .spawn(move || {
                PlayerWorker::new(links, queue, volume_state, output_selection).run(&inputs);
            })
            .inspect_err(|cause| log::warn!("playback.worker.start_failed cause={cause}"))?;
        Ok(Self {
            inputs: inputs_sender,
            worker: Mutex::new(Some(worker)),
        })
    }

    /// Upcoming items from `offset`, at most `limit`, read by the worker from the queue and the
    /// library. The rows carry the queue version they were cut from.
    pub(crate) fn queue_window(
        &self,
        offset: u32,
        limit: u32,
    ) -> Result<QueueWindow, CommandError> {
        self.run(move |worker| Ok(worker.queue_window(offset, limit)))
    }

    /// Replaces the queue with the tracks `track_ids` (in play order) and starts the one at
    /// `start`. Returns once that track's start has begun; the load and the stream follow.
    pub(crate) fn play_queue(
        &self,
        track_ids: Vec<TrackId>,
        start: usize,
    ) -> Result<(), CommandError> {
        self.run(move |worker| worker.play_queue(track_ids, start))
    }

    pub(crate) fn previous(&self) -> Result<(), CommandError> {
        self.run(PlayerWorker::previous)
    }

    pub(crate) fn next(&self) -> Result<(), CommandError> {
        self.run(PlayerWorker::next)
    }

    pub(crate) fn pause(&self) -> Result<(), CommandError> {
        self.run(PlayerWorker::pause)
    }

    pub(crate) fn resume(&self) -> Result<(), CommandError> {
        self.run(PlayerWorker::resume)
    }

    /// The worker clamps `position_ms` to the duration of the track it has loaded; the clamp is not
    /// done here, where the loaded track could change before the job arrives.
    pub(crate) fn seek(&self, position_ms: u64) -> Result<(), CommandError> {
        self.run(move |worker| worker.seek(position_ms))
    }

    /// The one check of the volume range: a value outside it is refused, not clamped.
    pub(crate) fn set_volume(&self, volume: f32) -> Result<(), CommandError> {
        let volume = NormalizedVolume::new(volume).ok_or(CommandError::InvalidVolume)?;
        self.run(move |worker| {
            worker.set_volume(volume);
            Ok(())
        })
    }

    pub(crate) fn set_muted(&self, muted: bool) -> Result<(), CommandError> {
        self.run(move |worker| {
            worker.set_muted(muted);
            Ok(())
        })
    }

    pub(crate) fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<(), CommandError> {
        self.run(move |worker| worker.set_output_selection(selection))
    }

    pub(crate) fn set_repeat_mode(&self, mode: RepeatMode) -> Result<(), CommandError> {
        self.run(move |worker| {
            worker.set_repeat_mode(mode);
            Ok(())
        })
    }

    pub(crate) fn set_shuffle(&self, enabled: bool) -> Result<(), CommandError> {
        self.run(move |worker| {
            worker.set_shuffle(enabled);
            Ok(())
        })
    }

    pub(crate) fn remove_queue_item(&self, id: QueueItemId) -> Result<(), CommandError> {
        self.run(move |worker| worker.remove_queue_item(id))
    }

    /// `to` is a position in the upcoming list, 0 being next up.
    pub(crate) fn move_queue_item(&self, id: QueueItemId, to: usize) -> Result<(), CommandError> {
        self.run(move |worker| worker.move_queue_item(id, to))
    }

    /// Makes an upcoming item current and plays it.
    pub(crate) fn play_queue_item(&self, id: QueueItemId) -> Result<(), CommandError> {
        self.run(move |worker| worker.play_queue_item(id))
    }

    /// Adds `track` after the current item (`next`) or at the end. With nothing queued it starts
    /// playing instead; the worker decides, so the check cannot race a stop.
    pub(crate) fn enqueue(&self, track: TrackId, next: bool) -> Result<(), CommandError> {
        self.run(move |worker| worker.enqueue(vec![track], next))
    }

    pub(crate) fn clear_queue(&self) -> Result<(), CommandError> {
        self.run(|worker| {
            worker.clear_queue();
            Ok(())
        })
    }

    /// Puts back the queue before the last replacement, playing the item that was current.
    pub(crate) fn restore_previous_queue(&self) -> Result<(), CommandError> {
        self.run(PlayerWorker::restore_previous_queue)
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
        job: impl FnOnce(&mut PlayerWorker) -> Result<T, CommandError> + Send + 'static,
    ) -> Result<T, CommandError> {
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        let job = Box::new(move |worker: &mut PlayerWorker| {
            if reply_sender.send(job(worker)).is_err() {
                debug!("playback.reply_closed");
            }
        });
        if self.inputs.send(Input::Run(job)).is_err() {
            return Err(CommandError::TaskFailed);
        }
        reply_receiver
            .recv()
            .inspect_err(|cause| log::warn!("playback.worker.reply_lost cause={cause}"))
            .map_err(|_| CommandError::TaskFailed)?
    }
}
