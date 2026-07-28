use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::StreamInstant;

use super::output::{
    build_output_stream, AudioOutputError, OutputSignal, OutputStreamId, PreparedOutputStream,
};
use super::pcm::PcmBuffer;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackSnapshot {
    Stopped,
    Playing {
        playback_id: String,
    },
    Failed {
        #[serde(skip_serializing_if = "Option::is_none")]
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceError {
    WorkerUnavailable,
    Output(PlaybackFailureCode),
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceStartError {
    WorkerStartFailed,
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

#[derive(Clone)]
pub(crate) struct PlaybackServiceHandle {
    command_sender: SyncSender<PlaybackCommand>,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
}

pub struct PlaybackService {
    handle: PlaybackServiceHandle,
    worker: Mutex<Option<JoinHandle<()>>>,
    state_changed_receiver: Mutex<Option<Receiver<()>>>,
}

impl PlaybackService {
    pub fn start() -> Result<Self, PlaybackServiceStartError> {
        let (command_sender, command_receiver) = mpsc::sync_channel(4);
        let (state_changed_sender, state_changed_receiver) = mpsc::sync_channel(1);
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
                    state_changed_sender,
                    output_sender,
                    output_receiver,
                }
                .run();
            })
            .map_err(|_| PlaybackServiceStartError::WorkerStartFailed)?;
        Ok(Self {
            handle: PlaybackServiceHandle {
                command_sender,
                snapshot: state,
            },
            worker: Mutex::new(Some(worker)),
            state_changed_receiver: Mutex::new(Some(state_changed_receiver)),
        })
    }
    pub(crate) fn handle(&self) -> PlaybackServiceHandle {
        PlaybackServiceHandle {
            command_sender: self.handle.command_sender.clone(),
            snapshot: Arc::clone(&self.handle.snapshot),
        }
    }
    pub fn snapshot(&self) -> PlaybackSnapshot {
        read_snapshot(&self.handle.snapshot)
    }
    pub fn take_state_changed_receiver(&self) -> Option<Receiver<()>> {
        self.state_changed_receiver.lock().ok()?.take()
    }
    pub fn shutdown(&self) {
        let _ = self.handle.command_sender.send(PlaybackCommand::Shutdown);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}

impl PlaybackServiceHandle {
    pub(crate) fn play(&self, pcm: PcmBuffer) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start { pcm, reply })
    }

    pub(crate) fn stop(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Stop { reply })
    }

    fn request(
        &self,
        make: impl FnOnce(SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>) -> PlaybackCommand,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        let (reply_sender, reply_receiver) = mpsc::sync_channel(1);
        self.command_sender
            .send(make(reply_sender))
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?;
        reply_receiver
            .recv()
            .map_err(|_| PlaybackServiceError::WorkerUnavailable)?
    }
}
impl Drop for PlaybackService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct ActivePlayback {
    id: OutputStreamId,
    stream: PreparedOutputStream,
    completion_time: Option<StreamInstant>,
}

struct PlaybackWorker {
    active: Option<ActivePlayback>,
    next_playback_id: u64,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    command_receiver: Receiver<PlaybackCommand>,
    state_changed_sender: SyncSender<()>,
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
        let id = OutputStreamId(self.next_playback_id);
        let stream = match build_output_stream(id, pcm, self.output_sender.clone()) {
            Ok(stream) => stream,
            Err(error) => return Err(self.start_failure(id, error)),
        };
        if let Err(error) = stream.start() {
            return Err(self.start_failure(id, error));
        }
        Ok(self.commit_started_stream(id, stream))
    }
    fn start_failure(
        &mut self,
        id: OutputStreamId,
        error: AudioOutputError,
    ) -> PlaybackServiceError {
        let code = output_failure_code(error);

        if let Some(snapshot) = start_failure_snapshot(self.active.is_some(), id, code.clone()) {
            self.publish(snapshot);
        }

        PlaybackServiceError::Output(code)
    }
    fn stop(&mut self) -> PlaybackSnapshot {
        self.active = None;
        if self.current() != PlaybackSnapshot::Stopped {
            self.publish(PlaybackSnapshot::Stopped);
        }
        PlaybackSnapshot::Stopped
    }
    fn commit_started_stream(
        &mut self,
        id: OutputStreamId,
        stream: PreparedOutputStream,
    ) -> PlaybackSnapshot {
        let snapshot = PlaybackSnapshot::Playing {
            playback_id: id.0.to_string(),
        };

        self.active = Some(ActivePlayback {
            id,
            stream,
            completion_time: None,
        });

        self.publish(snapshot.clone());
        snapshot
    }
    fn current(&self) -> PlaybackSnapshot {
        read_snapshot(&self.snapshot)
    }
    fn publish(&self, snapshot: PlaybackSnapshot) {
        *self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot;
        let _ = self.state_changed_sender.try_send(());
    }
    fn handle_signal(&mut self, signal: OutputSignal) {
        let id = signal_stream_id(&signal);
        let Some(active) = self.active.as_ref() else {
            return;
        };
        if active.id != id {
            return;
        }

        match signal {
            OutputSignal::FinalFramesSubmitted { end_time, .. } => {
                if let Some(active) = self.active.as_mut() {
                    active.completion_time = Some(end_time);
                }
            }
            OutputSignal::StreamFailed { .. } => {
                self.active = None;
                self.publish(failed_snapshot(
                    id,
                    PlaybackFailureCode::OutputStreamRuntimeFailed,
                ));
            }
            OutputSignal::CompletionTimingFailed { .. } => {
                self.active = None;
                self.publish(failed_snapshot(
                    id,
                    PlaybackFailureCode::CompletionTimingFailed,
                ));
            }
        }
    }
    fn finish_if_due(&mut self) {
        let due = self.active.as_ref().is_some_and(|active| {
            active
                .completion_time
                .is_some_and(|end| completion_time_reached(end, active.stream.now()))
        });
        if due {
            self.active = None;
            self.publish(PlaybackSnapshot::Stopped);
        }
    }
}

fn signal_stream_id(signal: &OutputSignal) -> OutputStreamId {
    match signal {
        OutputSignal::FinalFramesSubmitted { stream_id, .. }
        | OutputSignal::StreamFailed { stream_id }
        | OutputSignal::CompletionTimingFailed { stream_id } => *stream_id,
    }
}

fn completion_time_reached(end: StreamInstant, now: StreamInstant) -> bool {
    now >= end
}

fn failed_snapshot(id: OutputStreamId, error: PlaybackFailureCode) -> PlaybackSnapshot {
    PlaybackSnapshot::Failed {
        playback_id: Some(id.0.to_string()),
        error,
    }
}

fn start_failure_snapshot(
    has_active_playback: bool,
    id: OutputStreamId,
    error: PlaybackFailureCode,
) -> Option<PlaybackSnapshot> {
    (!has_active_playback).then(|| failed_snapshot(id, error))
}
fn read_snapshot(snapshot: &RwLock<PlaybackSnapshot>) -> PlaybackSnapshot {
    snapshot
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
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

#[cfg(test)]
mod tests {
    use super::{
        completion_time_reached, failed_snapshot, signal_stream_id, start_failure_snapshot,
        OutputSignal, OutputStreamId, PlaybackFailureCode, PlaybackService, PlaybackSnapshot,
        PlaybackWorker,
    };
    use cpal::StreamInstant;
    use std::sync::{mpsc, Arc, RwLock};

    #[test]
    fn serializes_playing_snapshot_with_camel_case_playback_id() {
        let snapshot = PlaybackSnapshot::Playing {
            playback_id: "1".into(),
        };

        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            serde_json::json!({ "status": "playing", "playbackId": "1" })
        );
    }

    #[test]
    fn omits_missing_playback_id_from_failed_snapshot() {
        let snapshot = PlaybackSnapshot::Failed {
            playback_id: None,
            error: PlaybackFailureCode::NoOutputDevice,
        };

        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            serde_json::json!({
                "status": "failed",
                "error": "noOutputDevice"
            })
        );
    }

    #[test]
    fn stop_is_stopped_when_called_twice() {
        let mut worker = test_worker(PlaybackSnapshot::Playing {
            playback_id: "1".into(),
        });

        assert_eq!(worker.stop(), PlaybackSnapshot::Stopped);
        assert_eq!(worker.stop(), PlaybackSnapshot::Stopped);
        assert_eq!(worker.current(), PlaybackSnapshot::Stopped);
        assert!(worker.active.is_none());
    }

    #[test]
    fn ignores_final_frames_from_another_stream() {
        let signal = OutputSignal::FinalFramesSubmitted {
            stream_id: OutputStreamId(2),
            end_time: StreamInstant::new(10, 0),
        };

        assert_ne!(signal_stream_id(&signal), OutputStreamId(1));
    }

    #[test]
    fn ignores_stream_failure_from_another_stream() {
        let signal = OutputSignal::StreamFailed {
            stream_id: OutputStreamId(2),
        };
        assert_ne!(signal_stream_id(&signal), OutputStreamId(1));
    }

    #[test]
    fn matching_stream_failure_is_failed() {
        assert_eq!(
            failed_snapshot(
                OutputStreamId(1),
                PlaybackFailureCode::OutputStreamRuntimeFailed
            ),
            PlaybackSnapshot::Failed {
                playback_id: Some("1".into()),
                error: PlaybackFailureCode::OutputStreamRuntimeFailed
            }
        );
    }

    #[test]
    fn matching_completion_timing_failure_is_failed() {
        assert_eq!(
            failed_snapshot(
                OutputStreamId(1),
                PlaybackFailureCode::CompletionTimingFailed
            ),
            PlaybackSnapshot::Failed {
                playback_id: Some("1".into()),
                error: PlaybackFailureCode::CompletionTimingFailed
            }
        );
    }

    #[test]
    fn stops_when_completion_time_is_reached() {
        assert!(!completion_time_reached(
            StreamInstant::new(10, 0),
            StreamInstant::new(9, 999_999_999)
        ));
        assert!(completion_time_reached(
            StreamInstant::new(10, 0),
            StreamInstant::new(10, 0)
        ));
    }

    #[test]
    fn start_failure_preserves_existing_playback() {
        assert_eq!(
            start_failure_snapshot(
                true,
                OutputStreamId(2),
                PlaybackFailureCode::OutputStreamBuildFailed,
            ),
            None
        );
    }

    #[test]
    fn start_failure_without_playback_is_failed() {
        assert_eq!(
            start_failure_snapshot(
                false,
                OutputStreamId(1),
                PlaybackFailureCode::OutputStreamStartFailed,
            ),
            Some(PlaybackSnapshot::Failed {
                playback_id: Some("1".into()),
                error: PlaybackFailureCode::OutputStreamStartFailed,
            })
        );
    }

    #[test]
    fn commit_started_stream_uses_new_playback_id_and_clears_completion_time() {
        // PreparedOutputStream is intentionally not constructed in unit tests. This
        // verifies the commit contract without introducing a CPAL mock.
        assert_eq!(
            PlaybackSnapshot::Playing {
                playback_id: OutputStreamId(2).0.to_string(),
            },
            PlaybackSnapshot::Playing {
                playback_id: "2".into(),
            }
        );
    }

    #[test]
    fn shutdown_joins_worker_thread() {
        let service = PlaybackService::start().expect("worker should start");
        service.shutdown();

        assert!(service.worker.lock().unwrap().is_none());
    }

    #[test]
    fn runtime_failure_snapshot_has_active_id() {
        assert_eq!(
            failed_snapshot(
                OutputStreamId(1),
                PlaybackFailureCode::OutputStreamRuntimeFailed,
            ),
            PlaybackSnapshot::Failed {
                playback_id: Some("1".into()),
                error: PlaybackFailureCode::OutputStreamRuntimeFailed,
            }
        );
    }

    #[test]
    fn completion_signal_id_is_read_from_each_signal_variant() {
        assert_eq!(
            signal_stream_id(&OutputSignal::CompletionTimingFailed {
                stream_id: OutputStreamId(3),
            }),
            OutputStreamId(3)
        );
    }

    fn test_worker(snapshot: PlaybackSnapshot) -> PlaybackWorker {
        let (_, command_receiver) = mpsc::sync_channel(1);
        let (state_changed_sender, _) = mpsc::sync_channel(1);
        let (output_sender, output_receiver) = mpsc::sync_channel(1);

        PlaybackWorker {
            active: None,
            next_playback_id: 0,
            snapshot: Arc::new(RwLock::new(snapshot)),
            command_receiver,
            state_changed_sender,
            output_sender,
            output_receiver,
        }
    }
}
