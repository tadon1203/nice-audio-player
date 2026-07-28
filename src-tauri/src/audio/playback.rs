use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::StreamInstant;

use super::output::{build_output_stream, AudioOutputError, PreparedOutputStream};
use super::pcm::PcmBuffer;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PlaybackId(pub(crate) u64);

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum PlaybackSnapshot {
    Stopped,
    Playing {
        playback_id: String,
    },
    Failed {
        playback_id: Option<String>,
        error: PlaybackFailureCode,
    },
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackFailureCode {
    NoOutputDevice,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    PlaybackWorkerUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceError {
    WorkerUnavailable,
    Output(PlaybackFailureCode),
    StatePoisoned,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceStartError {
    WorkerStartFailed,
}

pub(crate) enum OutputSignal {
    FinalFramesSubmitted {
        playback_id: PlaybackId,
        end_time: StreamInstant,
    },
    StreamFailed {
        playback_id: PlaybackId,
    },
    CompletionTimingFailed {
        playback_id: PlaybackId,
    },
}

enum PlaybackCommand {
    Start {
        pcm: PcmBuffer,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Stop {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Shutdown,
}

pub struct PlaybackService {
    command_sender: SyncSender<PlaybackCommand>,
    state: Arc<RwLock<PlaybackSnapshot>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    state_receiver: Mutex<Option<Receiver<PlaybackSnapshot>>>,
}

impl PlaybackService {
    pub fn start() -> Result<Self, PlaybackServiceStartError> {
        let (command_sender, command_receiver) = mpsc::sync_channel(4);
        let (state_sender, state_receiver) = mpsc::sync_channel(1);
        let (output_sender, output_receiver) = mpsc::sync_channel(4);
        let state = Arc::new(RwLock::new(PlaybackSnapshot::Stopped));
        let worker_state = Arc::clone(&state);
        let worker = thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                PlaybackWorker {
                    active: None,
                    next_playback_id: 0,
                    snapshot: worker_state,
                    command_receiver,
                    state_sender,
                    output_sender,
                    output_receiver,
                }
                .run();
            })
            .map_err(|_| PlaybackServiceStartError::WorkerStartFailed)?;
        Ok(Self {
            command_sender,
            state,
            worker: Mutex::new(Some(worker)),
            state_receiver: Mutex::new(Some(state_receiver)),
        })
    }
    pub fn play(&self, pcm: PcmBuffer) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start { pcm, reply })
    }
    pub fn stop(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Stop { reply })
    }
    fn request(
        &self,
        make: impl FnOnce(SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>) -> PlaybackCommand,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if self.state.read().is_err() {
            return Err(PlaybackServiceError::StatePoisoned);
        }
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        self.command_sender
            .send(make(reply_sender))
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?;
        reply_receiver
            .recv()
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?
    }
    pub fn snapshot(&self) -> PlaybackSnapshot {
        self.state
            .read()
            .map(|value| value.clone())
            .unwrap_or(PlaybackSnapshot::Failed {
                playback_id: None,
                error: PlaybackFailureCode::PlaybackWorkerUnavailable,
            })
    }
    pub fn take_state_receiver(&self) -> Option<Receiver<PlaybackSnapshot>> {
        self.state_receiver.lock().ok()?.take()
    }
    pub fn shutdown(&self) {
        let _ = self.command_sender.send(PlaybackCommand::Shutdown);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}
impl Drop for PlaybackService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct ActivePlayback {
    id: PlaybackId,
    stream: PreparedOutputStream,
    completion_time: Option<StreamInstant>,
}
struct PlaybackWorker {
    active: Option<ActivePlayback>,
    next_playback_id: u64,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    command_receiver: Receiver<PlaybackCommand>,
    state_sender: SyncSender<PlaybackSnapshot>,
    output_sender: SyncSender<OutputSignal>,
    output_receiver: Receiver<OutputSignal>,
}
impl PlaybackWorker {
    fn run(mut self) {
        loop {
            while let Ok(signal) = self.output_receiver.try_recv() {
                self.handle_signal(signal);
            }
            match self.command_receiver.recv_timeout(Duration::from_millis(5)) {
                Ok(PlaybackCommand::Start { pcm, reply }) => {
                    let _ = reply.send(self.start(pcm));
                }
                Ok(PlaybackCommand::Stop { reply }) => {
                    let _ = reply.send(Ok(self.stop()));
                }
                Ok(PlaybackCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            self.finish_if_due();
        }
        self.active = None;
        self.publish(PlaybackSnapshot::Stopped);
    }
    fn start(&mut self, pcm: PcmBuffer) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.next_playback_id = self.next_playback_id.wrapping_add(1);
        let id = PlaybackId(self.next_playback_id);
        let stream =
            build_output_stream(id, pcm, self.output_sender.clone()).map_err(map_output)?;
        self.active = None;
        if let Err(error) = stream.start() {
            let error = output_failure_code(error);
            let snapshot = PlaybackSnapshot::Failed {
                playback_id: Some(id.0.to_string()),
                error: error.clone(),
            };
            self.publish(snapshot.clone());
            return Err(PlaybackServiceError::Output(error));
        }
        let snapshot = PlaybackSnapshot::Playing {
            playback_id: id.0.to_string(),
        };
        self.active = Some(ActivePlayback {
            id,
            stream,
            completion_time: None,
        });
        self.publish(snapshot.clone());
        Ok(snapshot)
    }
    fn stop(&mut self) -> PlaybackSnapshot {
        self.active = None;
        let snapshot = PlaybackSnapshot::Stopped;
        if self.current() != snapshot {
            self.publish(snapshot.clone());
        }
        snapshot
    }
    fn current(&self) -> PlaybackSnapshot {
        self.snapshot
            .read()
            .map(|v| v.clone())
            .unwrap_or(PlaybackSnapshot::Failed {
                playback_id: None,
                error: PlaybackFailureCode::PlaybackWorkerUnavailable,
            })
    }
    fn publish(&self, snapshot: PlaybackSnapshot) {
        if let Ok(mut state) = self.snapshot.write() {
            *state = snapshot.clone();
        }
        let _ = self.state_sender.try_send(snapshot);
    }
    fn handle_signal(&mut self, signal: OutputSignal) {
        let id = match signal {
            OutputSignal::FinalFramesSubmitted { playback_id, .. }
            | OutputSignal::StreamFailed { playback_id }
            | OutputSignal::CompletionTimingFailed { playback_id } => playback_id,
        };
        if self.active.as_ref().map(|active| active.id) != Some(id) {
            return;
        }
        match signal {
            OutputSignal::FinalFramesSubmitted { end_time, .. } => {
                if let Some(active) = &mut self.active {
                    active.completion_time = Some(end_time);
                }
            }
            OutputSignal::StreamFailed { .. } => {
                self.fail(id, PlaybackFailureCode::OutputStreamRuntimeFailed)
            }
            OutputSignal::CompletionTimingFailed { .. } => {
                self.fail(id, PlaybackFailureCode::CompletionTimingFailed)
            }
        }
    }
    fn finish_if_due(&mut self) {
        let due = self.active.as_ref().is_some_and(|active| {
            active
                .completion_time
                .is_some_and(|end| active.stream.now() >= end)
        });
        if due {
            self.active = None;
            self.publish(PlaybackSnapshot::Stopped);
        }
    }
    fn fail(&mut self, id: PlaybackId, error: PlaybackFailureCode) {
        self.active = None;
        self.publish(PlaybackSnapshot::Failed {
            playback_id: Some(id.0.to_string()),
            error,
        });
    }
}
fn map_output(error: AudioOutputError) -> PlaybackServiceError {
    PlaybackServiceError::Output(output_failure_code(error))
}

fn output_failure_code(error: AudioOutputError) -> PlaybackFailureCode {
    match error {
        AudioOutputError::NoDefaultOutputDevice => PlaybackFailureCode::NoOutputDevice,
        AudioOutputError::UnsupportedConfiguration | AudioOutputError::ConfigurationQueryFailed => {
            PlaybackFailureCode::UnsupportedOutputConfiguration
        }
        AudioOutputError::StreamBuildFailed => PlaybackFailureCode::OutputStreamBuildFailed,
        AudioOutputError::StreamStartFailed => PlaybackFailureCode::OutputStreamStartFailed,
    }
}
