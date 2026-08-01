use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use cpal::StreamInstant;

use super::conversion::PcmConverter;
use super::decoding::{
    open_streaming_decoder, DecodeCancellation, DecodeStep, DecodedAudioSpec, PcmDecodeError,
    SeekStep, StreamingDecoder,
};
use super::devices::{
    resolve_output_device_id, resolve_output_selection, AudioOutputDeviceIdentity,
    AudioOutputSelection, DeviceResolutionError,
};
use super::output::{
    prepare_output_stream, prepare_output_stream_with_config, AtomicProducerState,
    AudioOutputError, OutputSignal, OutputStreamId, PreparedOutputConfig, PreparedOutputStream,
    ProducerState,
};
use super::pcm_queue::PcmProducer;
use super::validation::ValidatedAudioFile;
use super::volume::{AtomicEffectiveGain, VolumeState};

#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackSnapshot {
    Stopped {
        revision: u64,
        file: Option<ValidatedAudioFile>,
        #[specta(type = f64)]
        volume: f32,
        muted: bool,
        output_selection: AudioOutputSelection,
    },
    Playing {
        revision: u64,
        file: ValidatedAudioFile,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
        #[specta(type = f64)]
        volume: f32,
        muted: bool,
        output_selection: AudioOutputSelection,
        output_device: AudioOutputDeviceIdentity,
    },
    Paused {
        revision: u64,
        file: ValidatedAudioFile,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
        #[specta(type = f64)]
        volume: f32,
        muted: bool,
        output_selection: AudioOutputSelection,
        output_device: AudioOutputDeviceIdentity,
    },
    Failed {
        revision: u64,
        file: Option<ValidatedAudioFile>,
        #[serde(skip_serializing_if = "Option::is_none")]
        playback_id: Option<String>,
        error: PlaybackFailureCode,
        #[specta(type = f64)]
        volume: f32,
        muted: bool,
        output_selection: AudioOutputSelection,
    },
}

impl PlaybackSnapshot {
    fn stopped_with_selection(
        volume: VolumeState,
        output_selection: AudioOutputSelection,
        file: Option<ValidatedAudioFile>,
    ) -> Self {
        Self::Stopped {
            revision: 0,
            file,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
        }
    }

    fn playing_with_output(
        volume: VolumeState,
        output_selection: AudioOutputSelection,
        output_device: AudioOutputDeviceIdentity,
        file: ValidatedAudioFile,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> Self {
        Self::Playing {
            revision: 0,
            file,
            playback_id,
            position_ms,
            duration_ms,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
            output_device,
        }
    }

    fn paused_with_output(
        volume: VolumeState,
        output_selection: AudioOutputSelection,
        output_device: AudioOutputDeviceIdentity,
        file: ValidatedAudioFile,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> Self {
        Self::Paused {
            revision: 0,
            file,
            playback_id,
            position_ms,
            duration_ms,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
            output_device,
        }
    }

    fn failed_with_selection(
        volume: VolumeState,
        output_selection: AudioOutputSelection,
        playback_id: Option<String>,
        error: PlaybackFailureCode,
        file: Option<ValidatedAudioFile>,
    ) -> Self {
        Self::Failed {
            revision: 0,
            file,
            playback_id,
            error,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
        }
    }

    fn with_volume(self, volume: VolumeState) -> Self {
        match self {
            Self::Stopped {
                output_selection,
                file,
                ..
            } => Self::stopped_with_selection(volume, output_selection, file),
            Self::Playing {
                file,
                playback_id,
                position_ms,
                duration_ms,
                output_selection,
                output_device,
                ..
            } => Self::playing_with_output(
                volume,
                output_selection,
                output_device,
                file,
                playback_id,
                position_ms,
                duration_ms,
            ),
            Self::Paused {
                file,
                playback_id,
                position_ms,
                duration_ms,
                output_selection,
                output_device,
                ..
            } => Self::paused_with_output(
                volume,
                output_selection,
                output_device,
                file,
                playback_id,
                position_ms,
                duration_ms,
            ),
            Self::Failed {
                playback_id,
                error,
                output_selection,
                file,
                ..
            } => Self::failed_with_selection(volume, output_selection, playback_id, error, file),
        }
    }

    fn set_revision(&mut self, revision: u64) {
        match self {
            Self::Stopped {
                revision: current, ..
            }
            | Self::Playing {
                revision: current, ..
            }
            | Self::Paused {
                revision: current, ..
            }
            | Self::Failed {
                revision: current, ..
            } => *current = revision,
        }
    }

    #[cfg(test)]
    fn stopped(volume: VolumeState) -> Self {
        Self::stopped_with_selection(volume, AudioOutputSelection::SystemDefault, None)
    }

    #[cfg(test)]
    fn playing(
        volume: VolumeState,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> Self {
        Self::playing_with_output(
            volume,
            AudioOutputSelection::SystemDefault,
            AudioOutputDeviceIdentity {
                id: "test-device".into(),
                name: "Test device".into(),
            },
            test_file(),
            playback_id,
            position_ms,
            duration_ms,
        )
    }

    #[cfg(test)]
    fn paused(
        volume: VolumeState,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> Self {
        Self::paused_with_output(
            volume,
            AudioOutputSelection::SystemDefault,
            AudioOutputDeviceIdentity {
                id: "test-device".into(),
                name: "Test device".into(),
            },
            test_file(),
            playback_id,
            position_ms,
            duration_ms,
        )
    }

    #[cfg(test)]
    fn failed(
        volume: VolumeState,
        playback_id: Option<String>,
        error: PlaybackFailureCode,
    ) -> Self {
        Self::failed_with_selection(
            volume,
            AudioOutputSelection::SystemDefault,
            playback_id,
            error,
            None,
        )
    }
}

#[cfg(test)]
fn test_file() -> ValidatedAudioFile {
    ValidatedAudioFile {
        path: "C:/test.flac".into(),
        file_name: "test.flac".into(),
        extension: "flac".into(),
    }
}

#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackFailureCode {
    NoOutputDevice,
    OutputDeviceUnavailable,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamPauseFailed,
    OutputStreamResumeFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    DecodeFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlaybackServiceError {
    WorkerUnavailable,
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

enum PlaybackCommand {
    Start {
        file: ValidatedAudioFile,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Stop {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Pause {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Resume {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Seek {
        position_ms: u64,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    SetVolume {
        volume: f32,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Mute {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Unmute {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
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
        let volume_state = VolumeState::default();
        let effective_gain = AtomicEffectiveGain::new(volume_state.effective_gain());
        let output_selection = AudioOutputSelection::SystemDefault;
        let state = Arc::new(RwLock::new(PlaybackSnapshot::stopped_with_selection(
            volume_state,
            output_selection.clone(),
            None,
        )));
        let worker_state = Arc::clone(&state);
        let worker_gain = effective_gain.clone();
        let worker = thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                PlaybackWorker {
                    active: None,
                    pending: None,
                    pending_seek: None,
                    next_playback_session_id: 0,
                    next_output_stream_id: 0,
                    next_snapshot_revision: 0,
                    current_file: None,
                    volume_state,
                    effective_gain: worker_gain,
                    output_selection,
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
    pub(crate) fn play(
        &self,
        file: ValidatedAudioFile,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Start { file, reply })
    }

    pub(crate) fn stop(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Stop { reply })
    }

    pub(crate) fn pause(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Pause { reply })
    }

    pub(crate) fn resume(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Resume { reply })
    }

    pub(crate) fn seek(&self, position_ms: u64) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Seek { position_ms, reply })
    }

    pub(crate) fn set_volume(&self, volume: f32) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetVolume { volume, reply })
    }

    pub(crate) fn mute(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Mute { reply })
    }

    pub(crate) fn unmute(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Unmute { reply })
    }

    pub(crate) fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
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
    session_id: u64,
    id: OutputStreamId,
    source_file: ValidatedAudioFile,
    source_spec: DecodedAudioSpec,
    output_config: PreparedOutputConfig,
    stream: PreparedOutputStream,
    completion_time: Option<StreamInstant>,
    sample_rate: u32,
    duration_ms: Option<u64>,
    position_frame: u64,
    position_base_frame: u64,
    remaining_frames: Option<u64>,
    last_position_publish: Instant,
    decoder_worker: DecodeWorker,
}

struct PendingPlayback {
    session_id: u64,
    source_file: ValidatedAudioFile,
    source_spec: DecodedAudioSpec,
    output_config: PreparedOutputConfig,
    id: OutputStreamId,
    stream: PreparedOutputStream,
    decoder_worker: DecodeWorker,
    producer_state: Arc<AtomicProducerState>,
    prebuffer_receiver: Receiver<()>,
    sample_rate: u32,
    duration_ms: Option<u64>,
    reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
}

struct PendingSeek {
    session_id: u64,
    id: OutputStreamId,
    confirmed_position_ms: u64,
    output_base_frame: u64,
    remaining_frames: u64,
    stream: PreparedOutputStream,
    output_config: PreparedOutputConfig,
    decoder_worker: DecodeWorker,
    producer_state: Arc<AtomicProducerState>,
    prebuffer_receiver: Receiver<()>,
    sample_rate: u32,
    duration_ms: u64,
    reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
}

struct DecodeWorker {
    cancellation: DecodeCancellation,
    join_handle: JoinHandle<()>,
    wake_sender: SyncSender<()>,
}

impl DecodeWorker {
    fn cancel_and_join(self) {
        self.cancellation.cancel();
        let _ = self.wake_sender.try_send(());
        let _ = self.join_handle.join();
    }
}

const POSITION_UPDATE_INTERVAL: Duration = Duration::from_millis(250);

struct PlaybackWorker {
    active: Option<ActivePlayback>,
    pending: Option<PendingPlayback>,
    pending_seek: Option<PendingSeek>,
    next_playback_session_id: u64,
    next_output_stream_id: u64,
    next_snapshot_revision: u64,
    current_file: Option<ValidatedAudioFile>,
    volume_state: VolumeState,
    effective_gain: AtomicEffectiveGain,
    output_selection: AudioOutputSelection,
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
                Ok(PlaybackCommand::Start { file, reply }) => {
                    self.begin_start(file, reply);
                }
                Ok(PlaybackCommand::Stop { reply }) => {
                    let _ = reply.send(Ok(self.stop()));
                }
                Ok(PlaybackCommand::Pause { reply }) => {
                    let _ = reply.send(self.pause());
                }
                Ok(PlaybackCommand::Resume { reply }) => {
                    let _ = reply.send(self.resume());
                }
                Ok(PlaybackCommand::Seek { position_ms, reply }) => {
                    self.begin_seek(position_ms, reply);
                }
                Ok(PlaybackCommand::SetVolume { volume, reply }) => {
                    let _ = reply.send(self.set_volume(volume));
                }
                Ok(PlaybackCommand::Mute { reply }) => {
                    let _ = reply.send(Ok(self.mute()));
                }
                Ok(PlaybackCommand::Unmute { reply }) => {
                    let _ = reply.send(Ok(self.unmute()));
                }
                Ok(PlaybackCommand::SetOutputSelection { selection, reply }) => {
                    let _ = reply.send(self.set_output_selection(selection));
                }
                Ok(PlaybackCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            self.advance_pending_playback();
            self.advance_pending_seek();
            self.finish_if_due();
            self.update_playback_position();
        }
        self.discard_pending();
        self.discard_pending_seek();
        self.discard_active();
        self.publish(self.stopped_snapshot());
    }
    fn begin_start(
        &mut self,
        file: ValidatedAudioFile,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    ) {
        self.discard_pending();
        self.discard_pending_seek();
        self.discard_active();
        let mut decoder = match open_streaming_decoder(&file) {
            Ok(decoder) => decoder,
            Err(_) => {
                let _ = reply.send(Err(PlaybackServiceError::Decode));
                return;
            }
        };
        let spec = decoder.spec();
        let duration_ms = decoder.duration_ms();
        let mut first_packet = Vec::new();
        match decoder.decode_next(&mut first_packet) {
            Err(_) | Ok(DecodeStep::EndOfStream) => {
                let _ = reply.send(Err(PlaybackServiceError::Decode));
                return;
            }
            Ok(DecodeStep::Samples) => {}
        }
        let producer_state = Arc::new(AtomicProducerState::new(ProducerState::Running));
        let (capacity_sender, capacity_receiver) = mpsc::sync_channel(1);
        let (prebuffer_sender, prebuffer_receiver) = mpsc::sync_channel(1);
        self.next_playback_session_id = self.next_playback_session_id.wrapping_add(1);
        self.next_output_stream_id = self.next_output_stream_id.wrapping_add(1);
        let session_id = self.next_playback_session_id;
        let id = OutputStreamId(self.next_output_stream_id);
        let worker_cancellation = DecodeCancellation::default();
        let resolved_device = match resolve_output_selection(&self.output_selection) {
            Ok(device) => device,
            Err(error) => {
                let _ = reply.send(Err(self.start_device_failure(id, error)));
                return;
            }
        };
        let preparation = match prepare_output_stream(
            id,
            spec,
            resolved_device,
            self.effective_gain.clone(),
            Arc::clone(&producer_state),
            capacity_sender.clone(),
            self.output_sender.clone(),
        ) {
            Ok(preparation) => preparation,
            Err(error) => {
                let _ = reply.send(Err(self.start_failure(id, error)));
                return;
            }
        };
        let sample_rate = preparation.sample_rate;
        let channel_count = preparation.channel_count;
        let prebuffer_frames = usize::try_from(sample_rate)
            .unwrap_or(usize::MAX)
            .saturating_mul(250)
            .checked_div(1_000)
            .unwrap_or(usize::MAX)
            .max(1);
        let stream = preparation.stream;
        let producer = preparation.producer;
        let worker_state = Arc::clone(&producer_state);
        let worker_signal = self.output_sender.clone();
        let worker_wake = capacity_sender.clone();
        let worker_cancel = worker_cancellation.clone();
        let join_handle = thread::spawn(move || {
            decode_loop(
                decoder,
                producer,
                first_packet,
                spec,
                sample_rate,
                channel_count,
                worker_cancel,
                worker_state,
                worker_signal,
                id,
                capacity_receiver,
                prebuffer_sender,
                prebuffer_frames,
            )
        });
        let decoder_worker = DecodeWorker {
            cancellation: worker_cancellation,
            join_handle,
            wake_sender: worker_wake,
        };
        self.pending = Some(PendingPlayback {
            session_id,
            source_file: file,
            source_spec: spec,
            output_config: preparation.config.clone(),
            id,
            stream,
            decoder_worker,
            producer_state,
            prebuffer_receiver,
            sample_rate,
            duration_ms,
            reply,
        });
    }

    fn begin_seek(
        &mut self,
        requested_position_ms: u64,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    ) {
        if self.pending_seek.is_some() {
            self.discard_pending_seek();
        }
        let current = self.current();
        if !matches!(
            current,
            PlaybackSnapshot::Playing { .. } | PlaybackSnapshot::Paused { .. }
        ) {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        let Some(active) = self.active.as_ref() else {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        let Some(duration_ms) = active.duration_ms else {
            let _ = reply.send(Err(PlaybackServiceError::DurationUnavailable));
            return;
        };
        let target_ms = requested_position_ms.min(duration_ms);
        if target_ms == duration_ms {
            let _ = reply.send(Ok(self.stop()));
            return;
        }
        let session_id = active.session_id;
        let source_file = active.source_file.clone();
        let source_spec = active.source_spec;
        let target_source_frame = millis_to_frame(target_ms, source_spec.sample_rate.get());
        let mut decoder = match open_streaming_decoder(&source_file) {
            Ok(decoder) => decoder,
            Err(_) => {
                let _ = reply.send(Err(PlaybackServiceError::Decode));
                return;
            }
        };
        if decoder.spec() != source_spec {
            let _ = reply.send(Err(PlaybackServiceError::Decode));
            return;
        }
        let seek = match decoder.seek_to_frame(target_source_frame) {
            Ok(SeekStep::Samples(seek)) => seek,
            Ok(SeekStep::EndOfStream) => {
                let _ = reply.send(Err(PlaybackServiceError::Decode));
                return;
            }
            Err(PcmDecodeError::SeekFailed) => {
                let _ = reply.send(Err(PlaybackServiceError::Seek));
                return;
            }
            Err(_) => {
                let _ = reply.send(Err(PlaybackServiceError::Decode));
                return;
            }
        };
        if seek.first_packet.is_empty() {
            let _ = reply.send(Err(PlaybackServiceError::Decode));
            return;
        }

        self.next_output_stream_id = self.next_output_stream_id.wrapping_add(1);
        let id = OutputStreamId(self.next_output_stream_id);
        let producer_state = Arc::new(AtomicProducerState::new(ProducerState::Running));
        let (capacity_sender, capacity_receiver) = mpsc::sync_channel(1);
        let (prebuffer_sender, prebuffer_receiver) = mpsc::sync_channel(1);
        let output_config = active.output_config.clone();
        let resolved_device = match resolve_output_device_id(&output_config.device_id) {
            Ok(device) => device,
            Err(error) => {
                let _ = reply.send(Err(PlaybackServiceError::Output(
                    device_resolution_failure_code(error),
                )));
                return;
            }
        };
        let preparation = match prepare_output_stream_with_config(
            id,
            source_spec,
            resolved_device,
            &output_config,
            self.effective_gain.clone(),
            Arc::clone(&producer_state),
            capacity_sender.clone(),
            self.output_sender.clone(),
        ) {
            Ok(preparation) => preparation,
            Err(error) => {
                let _ = reply.send(Err(PlaybackServiceError::Output(output_failure_code(
                    error,
                ))));
                return;
            }
        };
        let sample_rate = preparation.sample_rate;
        let channel_count = preparation.channel_count;
        let prebuffer_frames = prebuffer_frames(sample_rate);
        let cancellation = DecodeCancellation::default();
        let worker_cancel = cancellation.clone();
        let worker_state = Arc::clone(&producer_state);
        let worker_signal = self.output_sender.clone();
        let worker_wake = capacity_sender.clone();
        let join_handle = thread::spawn(move || {
            decode_loop(
                decoder,
                preparation.producer,
                seek.first_packet,
                source_spec,
                sample_rate,
                channel_count,
                worker_cancel,
                worker_state,
                worker_signal,
                id,
                capacity_receiver,
                prebuffer_sender,
                prebuffer_frames,
            )
        });
        let output_base_frame = source_to_output_frame(
            seek.confirmed_source_frame,
            sample_rate,
            source_spec.sample_rate.get(),
        );
        let total_output_frames = duration_to_frames(duration_ms, sample_rate);
        self.pending_seek = Some(PendingSeek {
            session_id,
            id,
            confirmed_position_ms: seek.confirmed_position_ms,
            output_base_frame: output_base_frame.min(total_output_frames),
            remaining_frames: total_output_frames.saturating_sub(output_base_frame),
            stream: preparation.stream,
            output_config: preparation.config,
            decoder_worker: DecodeWorker {
                cancellation,
                join_handle,
                wake_sender: worker_wake,
            },
            producer_state,
            prebuffer_receiver,
            sample_rate,
            duration_ms,
            reply,
        });
    }

    fn advance_pending_seek(&mut self) {
        let Some(pending) = self.pending_seek.as_ref() else {
            return;
        };
        let ready = pending.prebuffer_receiver.try_recv().is_ok();
        let state = pending.producer_state.load();
        if !ready && state == ProducerState::Running {
            return;
        }
        let pending = self.pending_seek.take().expect("pending seek exists");
        if state == ProducerState::Failed {
            pending.decoder_worker.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Decode));
            return;
        }
        let Some(active) = self.active.as_ref() else {
            pending.decoder_worker.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        if active.session_id != pending.session_id {
            pending.decoder_worker.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        let was_playing = matches!(self.current(), PlaybackSnapshot::Playing { .. });
        if was_playing {
            if let Some(active) = self.active.as_mut() {
                if let Err(error) = active.stream.pause() {
                    pending.decoder_worker.cancel_and_join();
                    let _ =
                        pending
                            .reply
                            .send(Err(PlaybackServiceError::Output(output_failure_code(
                                error,
                            ))));
                    return;
                }
            }
            if let Err(error) = pending.stream.start() {
                pending.decoder_worker.cancel_and_join();
                let rollback_failed = self.active.as_mut().is_none_or(|active| {
                    let failed = active.stream.resume().is_err();
                    if !failed {
                        active.stream.clear_timing_anchor();
                    }
                    failed
                });
                if rollback_failed {
                    let playback_id = self
                        .active
                        .as_ref()
                        .map(|active| active.session_id.to_string());
                    self.discard_active();
                    self.publish(self.failed_snapshot(
                        playback_id,
                        PlaybackFailureCode::OutputStreamResumeFailed,
                    ));
                }
                let _ = pending
                    .reply
                    .send(Err(PlaybackServiceError::Output(output_failure_code(
                        error,
                    ))));
                return;
            }
        }
        let old = self.active.take().expect("active playback exists");
        old.decoder_worker.cancel_and_join();
        self.active = Some(ActivePlayback {
            session_id: pending.session_id,
            id: pending.id,
            source_file: old.source_file,
            source_spec: old.source_spec,
            output_config: pending.output_config,
            stream: pending.stream,
            completion_time: None,
            sample_rate: pending.sample_rate,
            duration_ms: Some(pending.duration_ms),
            position_frame: pending.output_base_frame,
            position_base_frame: pending.output_base_frame,
            remaining_frames: Some(pending.remaining_frames),
            last_position_publish: Instant::now(),
            decoder_worker: pending.decoder_worker,
        });
        let snapshot = if was_playing {
            self.playing_snapshot(
                pending.session_id.to_string(),
                pending.confirmed_position_ms,
                Some(pending.duration_ms),
            )
        } else {
            self.paused_snapshot(
                pending.session_id.to_string(),
                pending.confirmed_position_ms,
                Some(pending.duration_ms),
            )
        };
        let snapshot = self.publish(snapshot);
        let _ = pending.reply.send(Ok(snapshot));
    }

    fn discard_pending_seek(&mut self) {
        self.cancel_pending_seek_with(PlaybackServiceError::InvalidPlaybackState);
    }

    fn cancel_pending_seek_with(&mut self, error: PlaybackServiceError) {
        if let Some(pending) = self.pending_seek.take() {
            pending.decoder_worker.cancel_and_join();
            let _ = pending.reply.send(Err(error));
        }
    }
    fn advance_pending_playback(&mut self) {
        let Some(pending) = self.pending.as_ref() else {
            return;
        };
        let ready = pending.prebuffer_receiver.try_recv().is_ok();
        let state = pending.producer_state.load();
        if !ready && state == ProducerState::Running {
            return;
        }

        let pending = self.pending.take().expect("pending playback exists");
        if state == ProducerState::Failed {
            pending.decoder_worker.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Decode));
            return;
        }
        if let Err(error) = pending.stream.start() {
            pending.decoder_worker.cancel_and_join();
            let error = self.start_failure(pending.id, error);
            let _ = pending.reply.send(Err(error));
            return;
        }
        let snapshot = self.commit_started_stream(
            pending.session_id,
            pending.source_file,
            pending.source_spec,
            pending.output_config,
            pending.id,
            pending.stream,
            pending.sample_rate,
            pending.duration_ms,
            pending.decoder_worker,
        );
        let _ = pending.reply.send(Ok(snapshot));
    }

    fn discard_pending(&mut self) {
        if let Some(pending) = self.pending.take() {
            pending.decoder_worker.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::WorkerUnavailable));
        }
    }
    fn start_failure(
        &mut self,
        id: OutputStreamId,
        error: AudioOutputError,
    ) -> PlaybackServiceError {
        let code = output_failure_code(error);

        if let Some(snapshot) = start_failure_snapshot(
            self.active.is_some(),
            id,
            code.clone(),
            self.volume_state,
            self.output_selection.clone(),
            self.current_file.clone(),
        ) {
            self.publish(snapshot);
        }

        PlaybackServiceError::Output(code)
    }

    fn start_device_failure(
        &mut self,
        id: OutputStreamId,
        error: DeviceResolutionError,
    ) -> PlaybackServiceError {
        let code = device_resolution_failure_code(error);
        if let Some(snapshot) = start_failure_snapshot(
            self.active.is_some(),
            id,
            code.clone(),
            self.volume_state,
            self.output_selection.clone(),
            self.current_file.clone(),
        ) {
            self.publish(snapshot);
        }
        PlaybackServiceError::Output(code)
    }
    fn stop(&mut self) -> PlaybackSnapshot {
        self.discard_pending();
        self.discard_pending_seek();
        self.discard_active();
        if matches!(self.current(), PlaybackSnapshot::Stopped { .. }) {
            return self.current();
        }
        self.publish(self.stopped_snapshot())
    }

    fn set_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if self.active.is_some() || self.pending.is_some() || self.pending_seek.is_some() {
            return Err(PlaybackServiceError::InvalidPlaybackState);
        }
        if let AudioOutputSelection::Device { .. } = &selection {
            resolve_output_selection(&selection).map_err(|error| match error {
                DeviceResolutionError::InvalidDeviceId => PlaybackServiceError::InvalidDeviceId,
                DeviceResolutionError::DeviceUnavailable => {
                    PlaybackServiceError::OutputDeviceUnavailable
                }
                DeviceResolutionError::NoDefaultOutputDevice => {
                    PlaybackServiceError::OutputDeviceUnavailable
                }
            })?;
        }
        let unchanged = self.output_selection == selection;
        self.output_selection = selection;
        if matches!(self.current(), PlaybackSnapshot::Failed { .. }) {
            let snapshot = self.stopped_snapshot();
            return Ok(self.publish(snapshot));
        }
        if unchanged {
            return Ok(self.current());
        }
        Ok(self.publish(self.stopped_snapshot()))
    }
    fn set_volume(&mut self, volume: f32) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        let changed = self
            .volume_state
            .set_volume(volume)
            .ok_or(PlaybackServiceError::InvalidVolume)?;
        if !changed {
            return Ok(self.current());
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        let snapshot = self.current().with_volume(self.volume_state);
        Ok(self.publish(snapshot))
    }

    fn mute(&mut self) -> PlaybackSnapshot {
        if !self.volume_state.mute() {
            return self.current();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        let snapshot = self.current().with_volume(self.volume_state);
        self.publish(snapshot)
    }

    fn unmute(&mut self) -> PlaybackSnapshot {
        if !self.volume_state.unmute() {
            return self.current();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        let snapshot = self.current().with_volume(self.volume_state);
        self.publish(snapshot)
    }
    fn pause(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        match pause_action(&self.current()) {
            PlaybackControlAction::Idempotent => Ok(self.current()),
            PlaybackControlAction::Invalid => Err(PlaybackServiceError::InvalidPlaybackState),
            PlaybackControlAction::Change => {
                let Some(active) = self.active.as_mut() else {
                    return Err(PlaybackServiceError::InvalidPlaybackState);
                };
                let id = active.id;
                if let Err(error) = active.stream.pause() {
                    return Err(self.control_failure(id, error));
                }
                let relative_frame = active.stream.played_frame_position(
                    active.sample_rate,
                    active.duration_ms.map(|ms| {
                        ((u128::from(ms) * u128::from(active.sample_rate)) / 1_000) as u64
                    }),
                );
                active.stream.clear_timing_anchor();
                let position_frame = absolute_position(active, relative_frame);
                active.position_frame = position_frame;
                let playback_id = active.session_id.to_string();
                let position_ms = frame_to_millis(position_frame, active.sample_rate);
                let duration_ms = active.duration_ms;
                let snapshot = self.paused_snapshot(playback_id, position_ms, duration_ms);
                Ok(self.publish(snapshot))
            }
        }
    }
    fn resume(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        match resume_action(&self.current()) {
            PlaybackControlAction::Idempotent => Ok(self.current()),
            PlaybackControlAction::Invalid => Err(PlaybackServiceError::InvalidPlaybackState),
            PlaybackControlAction::Change => {
                let Some(active) = self.active.as_mut() else {
                    return Err(PlaybackServiceError::InvalidPlaybackState);
                };
                let id = active.id;
                if let Err(error) = active.stream.resume() {
                    return Err(self.control_failure(id, error));
                }
                let position_ms = frame_to_millis(active.position_frame, active.sample_rate);
                let playback_id = active.session_id.to_string();
                let duration_ms = active.duration_ms;
                let snapshot = self.playing_snapshot(playback_id, position_ms, duration_ms);
                Ok(self.publish(snapshot))
            }
        }
    }
    fn control_failure(
        &mut self,
        id: OutputStreamId,
        error: AudioOutputError,
    ) -> PlaybackServiceError {
        let playback_id = self
            .active
            .as_ref()
            .map(|active| active.session_id.to_string())
            .or_else(|| Some(id.0.to_string()));
        self.discard_active();
        let code = output_failure_code(error);
        self.publish(self.failed_snapshot(playback_id, code.clone()));
        PlaybackServiceError::Output(code)
    }
    #[allow(clippy::too_many_arguments)]
    fn commit_started_stream(
        &mut self,
        session_id: u64,
        source_file: ValidatedAudioFile,
        source_spec: DecodedAudioSpec,
        output_config: PreparedOutputConfig,
        id: OutputStreamId,
        stream: PreparedOutputStream,
        sample_rate: u32,
        duration_ms: Option<u64>,
        decoder_worker: DecodeWorker,
    ) -> PlaybackSnapshot {
        self.active = Some(ActivePlayback {
            session_id,
            id,
            source_file,
            source_spec,
            output_config,
            stream,
            completion_time: None,
            sample_rate,
            duration_ms,
            position_frame: 0,
            position_base_frame: 0,
            remaining_frames: duration_ms.map(|duration| duration_to_frames(duration, sample_rate)),
            last_position_publish: Instant::now(),
            decoder_worker,
        });
        self.current_file = self
            .active
            .as_ref()
            .map(|active| active.source_file.clone());

        let snapshot = self.playing_snapshot(session_id.to_string(), 0, duration_ms);

        self.publish(snapshot)
    }
    fn current(&self) -> PlaybackSnapshot {
        read_snapshot(&self.snapshot)
    }

    fn stopped_snapshot(&self) -> PlaybackSnapshot {
        PlaybackSnapshot::stopped_with_selection(
            self.volume_state,
            self.output_selection.clone(),
            self.current_file.clone(),
        )
    }

    fn playing_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        let device = self
            .active
            .as_ref()
            .map(|active| AudioOutputDeviceIdentity {
                id: active.output_config.device_id.clone(),
                name: active.output_config.device_name.clone(),
            })
            .expect("playing snapshot requires active output device");
        let file = self
            .active
            .as_ref()
            .map(|active| active.source_file.clone())
            .expect("playing snapshot requires active source file");
        PlaybackSnapshot::playing_with_output(
            self.volume_state,
            self.output_selection.clone(),
            device,
            file,
            playback_id,
            position_ms,
            duration_ms,
        )
    }

    fn paused_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        let device = self
            .active
            .as_ref()
            .map(|active| AudioOutputDeviceIdentity {
                id: active.output_config.device_id.clone(),
                name: active.output_config.device_name.clone(),
            })
            .expect("paused snapshot requires active output device");
        let file = self
            .active
            .as_ref()
            .map(|active| active.source_file.clone())
            .expect("paused snapshot requires active source file");
        PlaybackSnapshot::paused_with_output(
            self.volume_state,
            self.output_selection.clone(),
            device,
            file,
            playback_id,
            position_ms,
            duration_ms,
        )
    }

    fn failed_snapshot(
        &self,
        playback_id: Option<String>,
        error: PlaybackFailureCode,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::failed_with_selection(
            self.volume_state,
            self.output_selection.clone(),
            playback_id,
            error,
            self.current_file.clone(),
        )
    }

    fn discard_active(&mut self) {
        if let Some(active) = self.active.take() {
            active.decoder_worker.cancel_and_join();
        }
    }
    fn publish(&mut self, mut snapshot: PlaybackSnapshot) -> PlaybackSnapshot {
        self.next_snapshot_revision = self.next_snapshot_revision.saturating_add(1);
        snapshot.set_revision(self.next_snapshot_revision);
        *self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        let _ = self.state_changed_sender.try_send(());
        snapshot
    }

    fn refresh_active_snapshot(&self) -> Option<PlaybackSnapshot> {
        let active = self.active.as_ref()?;
        let playback_id = active.session_id.to_string();
        let position_ms = frame_to_millis(active.position_frame, active.sample_rate);
        match self.current() {
            PlaybackSnapshot::Playing { .. } => {
                Some(self.playing_snapshot(playback_id, position_ms, active.duration_ms))
            }
            PlaybackSnapshot::Paused { .. } => {
                Some(self.paused_snapshot(playback_id, position_ms, active.duration_ms))
            }
            PlaybackSnapshot::Stopped { .. } | PlaybackSnapshot::Failed { .. } => None,
        }
    }

    fn fail_active_stream(&mut self, error: PlaybackFailureCode) {
        let playback_id = self
            .active
            .as_ref()
            .map(|active| active.session_id.to_string());
        self.cancel_pending_seek_with(PlaybackServiceError::Output(error.clone()));
        self.discard_active();
        self.publish(self.failed_snapshot(playback_id, error));
    }

    fn refresh_default_device(&mut self) -> bool {
        let resolved = match resolve_output_selection(&AudioOutputSelection::SystemDefault) {
            Ok(resolved) => resolved,
            Err(_) => return false,
        };
        if let Some(active) = self.active.as_mut() {
            active.output_config.device_id = resolved.identity.id;
            active.output_config.device_name = resolved.identity.name;
        } else {
            return false;
        }
        if let Some(snapshot) = self.refresh_active_snapshot() {
            self.publish(snapshot);
        }
        true
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
            OutputSignal::StreamFailed { kind, .. } => {
                match stream_signal_action(&self.output_selection, kind) {
                    StreamSignalAction::RefreshDefaultDevice => {
                        self.cancel_pending_seek_with(PlaybackServiceError::Output(
                            PlaybackFailureCode::OutputDeviceUnavailable,
                        ));
                        if !self.refresh_default_device() {
                            self.fail_active_stream(PlaybackFailureCode::OutputDeviceUnavailable);
                        }
                    }
                    StreamSignalAction::PreservePlayback => {}
                    StreamSignalAction::Fail(error) => self.fail_active_stream(error),
                }
            }
            OutputSignal::CompletionTimingFailed { .. } => {
                let playback_id = self
                    .active
                    .as_ref()
                    .map(|active| active.session_id.to_string());
                self.cancel_pending_seek_with(PlaybackServiceError::Output(
                    PlaybackFailureCode::CompletionTimingFailed,
                ));
                self.discard_active();
                self.publish(
                    self.failed_snapshot(playback_id, PlaybackFailureCode::CompletionTimingFailed),
                );
            }
            OutputSignal::DecodeFailed { .. } => {
                let playback_id = self
                    .active
                    .as_ref()
                    .map(|active| active.session_id.to_string());
                self.cancel_pending_seek_with(PlaybackServiceError::Decode);
                self.discard_active();
                self.publish(self.failed_snapshot(playback_id, PlaybackFailureCode::DecodeFailed));
            }
        }
    }
    fn finish_if_due(&mut self) {
        let due = self.active.as_ref().is_some_and(|active| {
            should_finish(&self.current(), active.completion_time, active.stream.now())
        });
        if due {
            self.discard_pending_seek();
            self.discard_active();
            self.publish(self.stopped_snapshot());
        }
    }
    fn update_playback_position(&mut self) {
        let is_playing = matches!(self.current(), PlaybackSnapshot::Playing { .. });
        let Some((playback_id, position_frame, sample_rate, duration_ms)) =
            self.active.as_mut().and_then(|active| {
                if !is_playing {
                    return None;
                }
                let relative_frame = active.stream.played_frame_position(
                    active.sample_rate,
                    active.duration_ms.map(|ms| {
                        ((u128::from(ms) * u128::from(active.sample_rate)) / 1_000) as u64
                    }),
                );
                let position_frame = absolute_position(active, relative_frame);
                if !should_publish_position(
                    active.last_position_publish.elapsed(),
                    position_frame != active.position_frame,
                ) {
                    return None;
                }
                active.position_frame = position_frame;
                active.last_position_publish = Instant::now();
                Some((
                    active.session_id.to_string(),
                    position_frame,
                    active.sample_rate,
                    active.duration_ms,
                ))
            })
        else {
            return;
        };
        self.publish(self.playing_snapshot(
            playback_id,
            frame_to_millis(position_frame, sample_rate),
            duration_ms,
        ));
    }
}

#[allow(clippy::too_many_arguments)]
fn decode_loop(
    mut decoder: StreamingDecoder,
    mut producer: PcmProducer,
    first_packet: Vec<f32>,
    source_spec: super::decoding::DecodedAudioSpec,
    target_rate: u32,
    target_channels: u16,
    cancellation: DecodeCancellation,
    producer_state: Arc<AtomicProducerState>,
    signal_sender: SyncSender<OutputSignal>,
    stream_id: OutputStreamId,
    capacity_receiver: Receiver<()>,
    prebuffer_sender: SyncSender<()>,
    prebuffer_frames: usize,
) {
    let mut converter = match PcmConverter::new(
        source_spec.sample_rate,
        source_spec.channel_count,
        super::pcm::SampleRate::new(target_rate).expect("prepared output rate is nonzero"),
        super::pcm::ChannelCount::new(usize::from(target_channels))
            .expect("prepared output channels are nonzero"),
    ) {
        Ok(converter) => converter,
        Err(_) => {
            producer_state.store(ProducerState::Failed);
            let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
            let _ = prebuffer_sender.try_send(());
            return;
        }
    };
    let mut converted = Vec::new();
    let mut packet = Vec::new();
    let mut prebuffer_sent = false;
    if converter.convert(&first_packet, &mut converted).is_err() {
        producer_state.store(ProducerState::Failed);
        let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
        let _ = prebuffer_sender.try_send(());
        return;
    }
    if matches!(
        write_packet_fully(
            &mut producer,
            &converted,
            &cancellation,
            &capacity_receiver,
            prebuffer_frames,
            &mut prebuffer_sent,
            &prebuffer_sender
        ),
        QueueWriteResult::Cancelled
    ) {
        producer_state.store(ProducerState::Cancelled);
        return;
    }
    notify_prebuffer_if_ready(
        &producer,
        prebuffer_frames,
        &mut prebuffer_sent,
        &prebuffer_sender,
    );
    loop {
        if cancellation.is_cancelled() {
            producer_state.store(ProducerState::Cancelled);
            return;
        }
        packet.clear();
        match decoder.decode_next(&mut packet) {
            Ok(DecodeStep::EndOfStream) => {
                if decoder.finalize().is_err() {
                    producer_state.store(ProducerState::Failed);
                    let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
                    let _ = prebuffer_sender.try_send(());
                    return;
                }
                converter.flush(&mut converted);
                if matches!(
                    write_packet_fully(
                        &mut producer,
                        &converted,
                        &cancellation,
                        &capacity_receiver,
                        prebuffer_frames,
                        &mut prebuffer_sent,
                        &prebuffer_sender
                    ),
                    QueueWriteResult::Cancelled
                ) {
                    producer_state.store(ProducerState::Cancelled);
                    return;
                }
                notify_prebuffer_if_ready(
                    &producer,
                    prebuffer_frames,
                    &mut prebuffer_sent,
                    &prebuffer_sender,
                );
                producer_state.store(ProducerState::EndOfStream);
                let _ = prebuffer_sender.try_send(());
                return;
            }
            Ok(DecodeStep::Samples) => {
                if converter.convert(&packet, &mut converted).is_err() {
                    producer_state.store(ProducerState::Failed);
                    let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
                    let _ = prebuffer_sender.try_send(());
                    return;
                }
                if matches!(
                    write_packet_fully(
                        &mut producer,
                        &converted,
                        &cancellation,
                        &capacity_receiver,
                        prebuffer_frames,
                        &mut prebuffer_sent,
                        &prebuffer_sender,
                    ),
                    QueueWriteResult::Cancelled
                ) {
                    producer_state.store(ProducerState::Cancelled);
                    return;
                }
                notify_prebuffer_if_ready(
                    &producer,
                    prebuffer_frames,
                    &mut prebuffer_sent,
                    &prebuffer_sender,
                );
            }
            Err(_) => {
                producer_state.store(ProducerState::Failed);
                let _ = signal_sender.try_send(OutputSignal::DecodeFailed { stream_id });
                let _ = prebuffer_sender.try_send(());
                return;
            }
        }
    }
}

enum QueueWriteResult {
    Completed,
    Cancelled,
}

fn write_packet_fully(
    producer: &mut PcmProducer,
    samples: &[f32],
    cancellation: &DecodeCancellation,
    capacity_receiver: &Receiver<()>,
    prebuffer_frames: usize,
    prebuffer_sent: &mut bool,
    prebuffer_sender: &SyncSender<()>,
) -> QueueWriteResult {
    let mut offset = 0;
    while offset < samples.len() {
        if cancellation.is_cancelled() {
            return QueueWriteResult::Cancelled;
        }
        let pushed = producer.push_samples(&samples[offset..]);
        offset += pushed;
        notify_prebuffer_if_ready(producer, prebuffer_frames, prebuffer_sent, prebuffer_sender);
        if pushed == 0 {
            let _ = capacity_receiver.recv_timeout(Duration::from_millis(10));
        }
    }
    QueueWriteResult::Completed
}

fn notify_prebuffer_if_ready(
    producer: &PcmProducer,
    prebuffer_frames: usize,
    prebuffer_sent: &mut bool,
    prebuffer_sender: &SyncSender<()>,
) {
    if !*prebuffer_sent && producer.available_frames() >= prebuffer_frames {
        *prebuffer_sent = true;
        let _ = prebuffer_sender.try_send(());
    }
}

fn frame_to_millis(frame_position: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    ((u128::from(frame_position) * 1_000) / u128::from(sample_rate)).min(u128::from(u64::MAX))
        as u64
}

fn millis_to_frame(position_ms: u64, sample_rate: u32) -> u64 {
    u128::from(position_ms)
        .saturating_mul(u128::from(sample_rate))
        .checked_div(1_000)
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

fn absolute_position(active: &ActivePlayback, relative_frame: u64) -> u64 {
    active
        .position_base_frame
        .saturating_add(relative_frame)
        .min(
            active
                .position_base_frame
                .saturating_add(active.remaining_frames.unwrap_or(u64::MAX)),
        )
}

fn source_to_output_frame(source_frame: u64, output_rate: u32, source_rate: u32) -> u64 {
    u128::from(source_frame)
        .saturating_mul(u128::from(output_rate))
        .checked_div(u128::from(source_rate))
        .unwrap_or(0)
        .min(u128::from(u64::MAX)) as u64
}

fn duration_to_frames(duration_ms: u64, sample_rate: u32) -> u64 {
    millis_to_frame(duration_ms, sample_rate)
}

fn prebuffer_frames(sample_rate: u32) -> usize {
    usize::try_from(sample_rate)
        .unwrap_or(usize::MAX)
        .saturating_mul(250)
        .checked_div(1_000)
        .unwrap_or(usize::MAX)
        .max(1)
}

#[cfg_attr(not(test), allow(dead_code))]
fn duration_ms(total_frame_count: u64, sample_rate: u32) -> u64 {
    frame_to_millis(total_frame_count, sample_rate)
}

fn should_publish_position(elapsed_since_publish: Duration, position_changed: bool) -> bool {
    elapsed_since_publish >= POSITION_UPDATE_INTERVAL && position_changed
}

fn signal_stream_id(signal: &OutputSignal) -> OutputStreamId {
    match signal {
        OutputSignal::FinalFramesSubmitted { stream_id, .. }
        | OutputSignal::StreamFailed { stream_id, .. }
        | OutputSignal::CompletionTimingFailed { stream_id }
        | OutputSignal::DecodeFailed { stream_id } => *stream_id,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StreamSignalAction {
    RefreshDefaultDevice,
    PreservePlayback,
    Fail(PlaybackFailureCode),
}

fn stream_signal_action(
    selection: &AudioOutputSelection,
    kind: super::output::StreamFailureKind,
) -> StreamSignalAction {
    match kind {
        super::output::StreamFailureKind::DeviceChanged => match selection {
            AudioOutputSelection::SystemDefault => StreamSignalAction::RefreshDefaultDevice,
            AudioOutputSelection::Device { .. } => StreamSignalAction::PreservePlayback,
        },
        super::output::StreamFailureKind::DeviceUnavailable => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
        }
        super::output::StreamFailureKind::RuntimeFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
        }
    }
}

fn completion_time_reached(end: StreamInstant, now: StreamInstant) -> bool {
    now >= end
}

fn should_finish(
    snapshot: &PlaybackSnapshot,
    completion_time: Option<StreamInstant>,
    now: StreamInstant,
) -> bool {
    matches!(snapshot, PlaybackSnapshot::Playing { .. })
        && completion_time.is_some_and(|end| completion_time_reached(end, now))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlaybackControlAction {
    Change,
    Idempotent,
    Invalid,
}

fn pause_action(snapshot: &PlaybackSnapshot) -> PlaybackControlAction {
    match snapshot {
        PlaybackSnapshot::Playing { .. } => PlaybackControlAction::Change,
        PlaybackSnapshot::Paused { .. } => PlaybackControlAction::Idempotent,
        PlaybackSnapshot::Stopped { .. } | PlaybackSnapshot::Failed { .. } => {
            PlaybackControlAction::Invalid
        }
    }
}

fn resume_action(snapshot: &PlaybackSnapshot) -> PlaybackControlAction {
    match snapshot {
        PlaybackSnapshot::Paused { .. } => PlaybackControlAction::Change,
        PlaybackSnapshot::Playing { .. } => PlaybackControlAction::Idempotent,
        PlaybackSnapshot::Stopped { .. } | PlaybackSnapshot::Failed { .. } => {
            PlaybackControlAction::Invalid
        }
    }
}

#[cfg(test)]
fn failed_snapshot(id: OutputStreamId, error: PlaybackFailureCode) -> PlaybackSnapshot {
    PlaybackSnapshot::failed(VolumeState::default(), Some(id.0.to_string()), error)
}

fn start_failure_snapshot(
    has_active_playback: bool,
    id: OutputStreamId,
    error: PlaybackFailureCode,
    volume: VolumeState,
    output_selection: AudioOutputSelection,
    file: Option<ValidatedAudioFile>,
) -> Option<PlaybackSnapshot> {
    (!has_active_playback).then(|| {
        PlaybackSnapshot::failed_with_selection(
            volume,
            output_selection,
            Some(id.0.to_string()),
            error,
            file,
        )
    })
}
fn read_snapshot(snapshot: &RwLock<PlaybackSnapshot>) -> PlaybackSnapshot {
    snapshot
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

fn output_failure_code(error: AudioOutputError) -> PlaybackFailureCode {
    match error {
        AudioOutputError::UnsupportedConfiguration | AudioOutputError::ConfigurationQueryFailed => {
            PlaybackFailureCode::UnsupportedOutputConfiguration
        }
        AudioOutputError::StreamConfigurationUnsupported => {
            PlaybackFailureCode::UnsupportedOutputConfiguration
        }
        AudioOutputError::StreamBuildFailed => PlaybackFailureCode::OutputStreamBuildFailed,
        AudioOutputError::StreamStartFailed => PlaybackFailureCode::OutputStreamStartFailed,
        AudioOutputError::StreamPauseFailed => PlaybackFailureCode::OutputStreamPauseFailed,
        AudioOutputError::StreamResumeFailed => PlaybackFailureCode::OutputStreamResumeFailed,
        AudioOutputError::DeviceUnavailable => PlaybackFailureCode::OutputDeviceUnavailable,
    }
}

fn device_resolution_failure_code(error: DeviceResolutionError) -> PlaybackFailureCode {
    match error {
        DeviceResolutionError::NoDefaultOutputDevice => PlaybackFailureCode::NoOutputDevice,
        DeviceResolutionError::InvalidDeviceId | DeviceResolutionError::DeviceUnavailable => {
            PlaybackFailureCode::OutputDeviceUnavailable
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::devices::AudioOutputSelection;
    use super::super::output::AudioOutputError;
    use super::super::output::StreamFailureKind;
    use super::super::volume::VolumeState;
    use super::{
        completion_time_reached, duration_ms, duration_to_frames, failed_snapshot, frame_to_millis,
        millis_to_frame, output_failure_code, pause_action, resume_action, should_finish,
        should_publish_position, signal_stream_id, source_to_output_frame, start_failure_snapshot,
        stream_signal_action, OutputSignal, OutputStreamId, PlaybackControlAction,
        PlaybackFailureCode, PlaybackService, PlaybackServiceError, PlaybackSnapshot,
        PlaybackWorker, StreamSignalAction,
    };
    use cpal::StreamInstant;
    use std::sync::{mpsc, Arc, RwLock};

    #[test]
    fn classifies_stream_signals_by_selection_and_failure_kind() {
        assert_eq!(
            stream_signal_action(
                &AudioOutputSelection::SystemDefault,
                StreamFailureKind::DeviceChanged
            ),
            StreamSignalAction::RefreshDefaultDevice
        );
        assert_eq!(
            stream_signal_action(
                &AudioOutputSelection::Device {
                    device_id: "device".into()
                },
                StreamFailureKind::DeviceChanged
            ),
            StreamSignalAction::PreservePlayback
        );
        assert_eq!(
            stream_signal_action(
                &AudioOutputSelection::SystemDefault,
                StreamFailureKind::DeviceUnavailable
            ),
            StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
        );
        assert_eq!(
            stream_signal_action(
                &AudioOutputSelection::SystemDefault,
                StreamFailureKind::RuntimeFailed
            ),
            StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
        );
    }

    #[test]
    fn serializes_playing_snapshot_with_camel_case_playback_id() {
        let snapshot =
            PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 1_000, Some(60_000));

        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            serde_json::json!({ "status": "playing", "revision": 0, "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" }, "playbackId": "1", "positionMs": 1_000, "durationMs": 60_000, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }, "outputDevice": { "id": "test-device", "name": "Test device" } })
        );
    }

    #[test]
    fn serializes_paused_snapshot_with_camel_case_playback_id() {
        let snapshot =
            PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 1_000, Some(60_000));

        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            serde_json::json!({ "status": "paused", "revision": 0, "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" }, "playbackId": "1", "positionMs": 1_000, "durationMs": 60_000, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }, "outputDevice": { "id": "test-device", "name": "Test device" } })
        );
    }

    #[test]
    fn omits_missing_playback_id_from_failed_snapshot() {
        let snapshot = PlaybackSnapshot::failed(
            VolumeState::default(),
            None,
            PlaybackFailureCode::NoOutputDevice,
        );

        assert_eq!(
            serde_json::to_value(snapshot).unwrap(),
            serde_json::json!({
                "status": "failed",
                "revision": 0,
                "file": null,
                "error": "noOutputDevice",
                "volume": 1.0,
                "muted": false,
                "outputSelection": { "kind": "systemDefault" }
            })
        );
    }

    #[test]
    fn stop_is_stopped_when_called_twice() {
        let mut worker = test_worker(PlaybackSnapshot::playing(
            VolumeState::default(),
            "1".into(),
            0,
            Some(60_000),
        ));

        let first = worker.stop();
        assert!(matches!(
            first,
            PlaybackSnapshot::Stopped { revision: 1, .. }
        ));
        assert_eq!(worker.stop(), first);
        assert_eq!(worker.current(), first);
        assert!(worker.active.is_none());
    }

    #[test]
    fn stop_from_paused_is_stopped() {
        let mut worker = test_worker(PlaybackSnapshot::paused(
            VolumeState::default(),
            "1".into(),
            10_000,
            Some(60_000),
        ));

        let stopped = worker.stop();
        assert!(matches!(
            stopped,
            PlaybackSnapshot::Stopped { revision: 1, .. }
        ));
        assert_eq!(worker.current(), stopped);
    }

    #[test]
    fn volume_commands_update_snapshot_without_rebuilding_playback() {
        let mut worker = test_worker(PlaybackSnapshot::playing(
            VolumeState::default(),
            "1".into(),
            250,
            Some(60_000),
        ));

        let changed = worker.set_volume(0.5).expect("valid volume must succeed");
        assert_eq!(changed_volume(&changed), (0.5, false));
        assert_eq!(worker.effective_gain.load(), 0.5);

        let before_invalid = worker.current();
        assert_eq!(
            worker.set_volume(f32::NAN),
            Err(PlaybackServiceError::InvalidVolume)
        );
        assert_eq!(worker.current(), before_invalid);
        assert_eq!(worker.effective_gain.load(), 0.5);

        let muted = worker.mute();
        assert_eq!(changed_volume(&muted), (0.5, true));
        assert_eq!(worker.effective_gain.load(), 0.0);
        assert_eq!(changed_volume(&worker.mute()), (0.5, true));
        assert_eq!(changed_volume(&worker.unmute()), (0.5, false));
        assert_eq!(worker.effective_gain.load(), 0.5);
    }

    #[test]
    fn published_snapshots_are_monotonic_and_idempotent_commands_keep_revision() {
        let mut worker = test_worker(PlaybackSnapshot::stopped(VolumeState::default()));

        let changed = worker.set_volume(0.5).expect("valid volume must succeed");
        let muted = worker.mute();
        let muted_again = worker.mute();

        assert_eq!(snapshot_revision(&changed), 1);
        assert_eq!(snapshot_revision(&muted), 2);
        assert_eq!(snapshot_revision(&muted_again), 2);
    }

    #[test]
    fn stopped_snapshot_retains_the_last_played_file_identity() {
        let mut worker = test_worker(PlaybackSnapshot::paused(
            VolumeState::default(),
            "1".into(),
            1_000,
            Some(60_000),
        ));
        worker.current_file = Some(super::test_file());

        let PlaybackSnapshot::Stopped {
            file: Some(file), ..
        } = worker.stop()
        else {
            panic!("stop must retain a file identity");
        };
        assert_eq!(file.file_name, "test.flac");
    }

    #[test]
    fn volume_state_is_present_in_initial_stopped_snapshot() {
        let service = PlaybackService::start().expect("worker should start");
        assert_eq!(
            serde_json::to_value(service.snapshot()).unwrap(),
            serde_json::json!({"status": "stopped", "revision": 0, "file": null, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }})
        );
        service.shutdown();
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
            kind: StreamFailureKind::RuntimeFailed,
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
            PlaybackSnapshot::failed(
                VolumeState::default(),
                Some("1".into()),
                PlaybackFailureCode::OutputStreamRuntimeFailed
            )
        );
    }

    #[test]
    fn matching_completion_timing_failure_is_failed() {
        assert_eq!(
            failed_snapshot(
                OutputStreamId(1),
                PlaybackFailureCode::CompletionTimingFailed
            ),
            PlaybackSnapshot::failed(
                VolumeState::default(),
                Some("1".into()),
                PlaybackFailureCode::CompletionTimingFailed
            )
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
    fn pause_and_resume_actions_are_idempotent_or_invalid_by_snapshot() {
        let playing =
            PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 0, Some(60_000));
        let paused =
            PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 10_000, Some(60_000));
        let stopped = PlaybackSnapshot::stopped(VolumeState::default());
        let failed = failed_snapshot(
            OutputStreamId(1),
            PlaybackFailureCode::OutputStreamRuntimeFailed,
        );

        assert_eq!(pause_action(&playing), PlaybackControlAction::Change);
        assert_eq!(pause_action(&paused), PlaybackControlAction::Idempotent);
        assert_eq!(pause_action(&stopped), PlaybackControlAction::Invalid);
        assert_eq!(pause_action(&failed), PlaybackControlAction::Invalid);
        assert_eq!(resume_action(&paused), PlaybackControlAction::Change);
        assert_eq!(resume_action(&playing), PlaybackControlAction::Idempotent);
        assert_eq!(resume_action(&stopped), PlaybackControlAction::Invalid);
        assert_eq!(resume_action(&failed), PlaybackControlAction::Invalid);
    }

    #[test]
    fn paused_playback_does_not_finish_naturally() {
        let paused =
            PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 10_000, Some(60_000));
        let end = StreamInstant::new(10, 0);

        assert!(!should_finish(&paused, Some(end), end));
        assert!(should_finish(
            &PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 0, Some(60_000)),
            Some(end),
            end
        ));
    }

    #[test]
    fn maps_pause_and_resume_output_failures() {
        assert_eq!(
            output_failure_code(AudioOutputError::StreamPauseFailed),
            PlaybackFailureCode::OutputStreamPauseFailed
        );
        assert_eq!(
            output_failure_code(AudioOutputError::StreamResumeFailed),
            PlaybackFailureCode::OutputStreamResumeFailed
        );
    }

    #[test]
    fn preserves_frontend_mapping_for_output_configuration_errors() {
        assert_eq!(
            output_failure_code(AudioOutputError::UnsupportedConfiguration),
            PlaybackFailureCode::UnsupportedOutputConfiguration
        );
        assert_eq!(
            output_failure_code(AudioOutputError::StreamConfigurationUnsupported),
            PlaybackFailureCode::UnsupportedOutputConfiguration
        );
        assert_eq!(
            output_failure_code(AudioOutputError::StreamBuildFailed),
            PlaybackFailureCode::OutputStreamBuildFailed
        );
    }

    #[test]
    fn start_failure_preserves_existing_playback() {
        assert_eq!(
            start_failure_snapshot(
                true,
                OutputStreamId(2),
                PlaybackFailureCode::OutputStreamBuildFailed,
                VolumeState::default(),
                AudioOutputSelection::SystemDefault,
                None,
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
                VolumeState::default(),
                AudioOutputSelection::SystemDefault,
                None,
            ),
            Some(PlaybackSnapshot::failed(
                VolumeState::default(),
                Some("1".into()),
                PlaybackFailureCode::OutputStreamStartFailed
            ))
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
            PlaybackSnapshot::failed(
                VolumeState::default(),
                Some("1".into()),
                PlaybackFailureCode::OutputStreamRuntimeFailed
            )
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

    #[test]
    fn converts_frames_and_calculates_duration_in_milliseconds() {
        assert_eq!(frame_to_millis(22_050, 44_100), 500);
        assert_eq!(duration_ms(132_300, 44_100), 3_000);
        assert_eq!(frame_to_millis(96_000, 96_000), 1_000);
    }

    #[test]
    fn position_publication_requires_interval_and_a_changed_position() {
        assert!(!should_publish_position(
            std::time::Duration::from_millis(249),
            true
        ));
        assert!(!should_publish_position(
            std::time::Duration::from_millis(250),
            false
        ));
        assert!(should_publish_position(
            std::time::Duration::from_millis(250),
            true
        ));
        assert!(should_publish_position(
            std::time::Duration::from_millis(500),
            true
        ));
    }

    fn test_worker(snapshot: PlaybackSnapshot) -> PlaybackWorker {
        let (_, command_receiver) = mpsc::sync_channel(1);
        let (state_changed_sender, _) = mpsc::sync_channel(1);
        let (output_sender, output_receiver) = mpsc::sync_channel(1);

        PlaybackWorker {
            active: None,
            pending: None,
            pending_seek: None,
            next_playback_session_id: 0,
            next_output_stream_id: 0,
            next_snapshot_revision: 0,
            current_file: None,
            volume_state: VolumeState::default(),
            effective_gain: super::super::volume::AtomicEffectiveGain::new(1.0),
            output_selection: AudioOutputSelection::SystemDefault,
            snapshot: Arc::new(RwLock::new(snapshot)),
            command_receiver,
            state_changed_sender,
            output_sender,
            output_receiver,
        }
    }

    fn changed_volume(snapshot: &PlaybackSnapshot) -> (f32, bool) {
        match snapshot {
            PlaybackSnapshot::Stopped { volume, muted, .. }
            | PlaybackSnapshot::Playing { volume, muted, .. }
            | PlaybackSnapshot::Paused { volume, muted, .. }
            | PlaybackSnapshot::Failed { volume, muted, .. } => (*volume, *muted),
        }
    }

    fn snapshot_revision(snapshot: &PlaybackSnapshot) -> u64 {
        match snapshot {
            PlaybackSnapshot::Stopped { revision, .. }
            | PlaybackSnapshot::Playing { revision, .. }
            | PlaybackSnapshot::Paused { revision, .. }
            | PlaybackSnapshot::Failed { revision, .. } => *revision,
        }
    }

    #[test]
    fn seek_position_helpers_use_floor_alignment_and_output_rate() {
        assert_eq!(millis_to_frame(999, 44_100), 44_055);
        assert_eq!(frame_to_millis(44_055, 44_100), 998);
        assert_eq!(source_to_output_frame(44_100, 48_000, 44_100), 48_000);
        assert_eq!(duration_to_frames(2_001, 48_000), 96_048);
    }

    #[test]
    fn seek_position_helpers_saturate_large_values() {
        assert_eq!(millis_to_frame(u64::MAX, u32::MAX), u64::MAX);
        assert_eq!(source_to_output_frame(u64::MAX, u32::MAX, 1), u64::MAX);
    }
}
