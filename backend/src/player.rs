//! Playback: a `Player` that sends commands to one worker thread, which owns the queue and the output
//! stream. A command is answered once the worker has applied it; the worker reports what it does
//! next through the Backend's messages.
//!
//! This file is all the rest of the application sees of playback. Its modules are private, except
//! the audio stages (`decode`, `output`, `pcm`, `processing`, `volume`, `waveform`) and the
//! `fake_output` double, which the rest of the crate names.

use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    mpsc::{self, Sender},
};

use crate::Result;
use crate::ids::{QueueItemId, TrackId};
use crate::library::Library;
use crate::messages::BackendMessage;
use crate::meter::Meter;
use crate::player::output::{AudioOutputSelection, OutputStreamFactory};
use crate::player::volume::{DEFAULT_PLAYBACK_VOLUME, NormalizedVolume};
use crate::player::waveform::Waveforms;
use crate::settings::SettingsStore;
use crate::threads::{Reply, WorkerThread, request};

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

use worker::{PlayerCommand, PlayerWorker, WorkerInput};

pub use queue::RepeatMode;
pub use state::{PlaybackPosition, PlayerState, QueueState, QueueWindow, UPCOMING_WINDOW};

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
    inputs: Sender<WorkerInput>,
    worker: WorkerThread,
}

impl Drop for Player {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl Player {
    /// Starts the worker, on the audio output `output_stream_factory` opens streams on. The worker
    /// begins with the preferences `settings` saved, and records each change in `settings`. Tracks
    /// are read from `library`; an unavailable one makes playing fail with `LibraryUnavailable`. The worker
    /// sends its state to `messages`, starting with the first values. `meter` takes the taps of this
    /// player's output streams, and `waveforms` hears about each track as it is loaded or is about to
    /// play.
    pub(crate) fn start(
        library: Arc<Library>,
        messages: Sender<BackendMessage>,
        meter: Meter,
        waveforms: Arc<Waveforms>,
        settings: Arc<SettingsStore>,
        output_stream_factory: Box<dyn OutputStreamFactory>,
    ) -> Self {
        let (inputs_sender, inputs) = mpsc::channel();
        let worker_inbox = inputs_sender.clone();
        // The worker is built on its own thread: the output stream it holds is not `Send`.
        let thread = WorkerThread::spawn("worker", move || {
            PlayerWorker::new(
                worker_inbox,
                messages,
                library,
                waveforms,
                meter,
                settings,
                output_stream_factory,
            )
            .run(&inputs);
        });
        Self {
            inputs: inputs_sender,
            worker: thread,
        }
    }

    /// Upcoming items from `offset`, at most `limit`, read by the worker from the queue and the
    /// library. The rows carry the queue version they were cut from.
    pub(crate) fn queue_window(&self, offset: u32, limit: u32) -> Result<QueueWindow> {
        self.call(|reply| PlayerCommand::QueueWindow {
            offset,
            limit,
            reply,
        })
    }

    /// Replaces the queue with the tracks `track_ids` (in play order) and starts the one at
    /// `start`. Returns once that track's start has begun; the load and the stream follow.
    pub(crate) fn play_queue(&self, track_ids: Vec<TrackId>, start: usize) -> Result<()> {
        self.call(|reply| PlayerCommand::PlayQueue {
            tracks: track_ids,
            start,
            reply,
        })
    }

    pub(crate) fn previous(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::Previous { reply })
    }

    pub(crate) fn next(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::Next { reply })
    }

    pub(crate) fn pause(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::Pause { reply })
    }

    pub(crate) fn resume(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::Resume { reply })
    }

    /// The worker clamps `position_ms` to the duration of the track it has loaded; the clamp is not
    /// done here, where the loaded track could change before the command arrives.
    pub(crate) fn seek(&self, position_ms: u64) -> Result<()> {
        self.call(|reply| PlayerCommand::Seek { position_ms, reply })
    }

    pub(crate) fn set_volume(&self, volume: NormalizedVolume) -> Result<()> {
        self.call(|reply| PlayerCommand::SetVolume { volume, reply })
    }

    pub(crate) fn set_muted(&self, muted: bool) -> Result<()> {
        self.call(|reply| PlayerCommand::SetMuted { muted, reply })
    }

    pub(crate) fn set_output_selection(&self, selection: AudioOutputSelection) -> Result<()> {
        self.call(|reply| PlayerCommand::SetOutputSelection { selection, reply })
    }

    pub(crate) fn set_repeat_mode(&self, mode: RepeatMode) -> Result<()> {
        self.call(|reply| PlayerCommand::SetRepeatMode { mode, reply })
    }

    pub(crate) fn set_shuffle(&self, enabled: bool) -> Result<()> {
        self.call(|reply| PlayerCommand::SetShuffle { enabled, reply })
    }

    pub(crate) fn remove_queue_item(&self, id: QueueItemId) -> Result<()> {
        self.call(|reply| PlayerCommand::RemoveQueueItem { id, reply })
    }

    /// `to` is a position in the upcoming list, 0 being next up.
    pub(crate) fn move_queue_item(&self, id: QueueItemId, to: usize) -> Result<()> {
        self.call(|reply| PlayerCommand::MoveQueueItem { id, to, reply })
    }

    /// Makes an upcoming item current and plays it.
    pub(crate) fn play_queue_item(&self, id: QueueItemId) -> Result<()> {
        self.call(|reply| PlayerCommand::PlayQueueItem { id, reply })
    }

    /// Adds `track` after the current item (`next`) or at the end. With nothing queued it starts
    /// playing instead; the worker decides, so the check cannot race a stop.
    pub(crate) fn enqueue(&self, track: TrackId, next: bool) -> Result<()> {
        self.call(|reply| PlayerCommand::Enqueue {
            tracks: vec![track],
            next,
            reply,
        })
    }

    pub(crate) fn clear_queue(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::ClearQueue { reply })
    }

    /// Puts back the queue before the last replacement, playing the item that was current.
    pub(crate) fn restore_previous_queue(&self) -> Result<()> {
        self.call(|reply| PlayerCommand::RestorePreviousQueue { reply })
    }

    /// Stops the worker and waits for it to finish. Calling it again does nothing.
    pub(crate) fn shutdown(&self) {
        // The worker may have stopped already; then there is nothing to stop.
        let _ = self
            .inputs
            .send(WorkerInput::Command(PlayerCommand::Shutdown));
        self.worker.join();
    }

    /// Sends a command and waits for the worker's answer. Callers on an async runtime must not call
    /// this on the runtime itself.
    fn call<T>(&self, command: impl FnOnce(Reply<T>) -> PlayerCommand) -> Result<T> {
        request(&self.inputs, |reply| WorkerInput::Command(command(reply)))
    }
}
