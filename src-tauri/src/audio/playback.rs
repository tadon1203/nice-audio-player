use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc, Mutex, RwLock,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::decoding::{open_playback_decoder, DecodeStep, PcmDecodeError, SeekStep};
use super::devices::{
    resolve_output_device_id, resolve_output_selection, AudioOutputDeviceIdentity,
    AudioOutputSelection, DeviceResolutionError,
};
use super::output::{
    prepare_output_stream, prepare_output_stream_with_config, AudioOutputError, OutputSignal,
    OutputStreamId, PreparedOutputConfig, PreparedOutputStream, ProducerState,
};
use super::output_processing::{ChannelConversion, OutputPcmProcessor};
use super::volume::{AtomicEffectiveGain, VolumeState};
use crate::media::validation::ValidatedAudioFile;
use cpal::StreamInstant;

mod decode_worker;
use decode_worker::{DecodePipeline, DecodeTaskInput, DecodeWorker, DecodeWorkerSetup};

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
        can_go_previous: bool,
        can_go_next: bool,
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
        channel_conversion: PlaybackChannelConversion,
        source_sample_rate: u32,
        output_sample_rate: u32,
        resampling_active: bool,
        can_go_previous: bool,
        can_go_next: bool,
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
        channel_conversion: PlaybackChannelConversion,
        source_sample_rate: u32,
        output_sample_rate: u32,
        resampling_active: bool,
        can_go_previous: bool,
        can_go_next: bool,
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
        can_go_previous: bool,
        can_go_next: bool,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackChannelConversion {
    None,
    MonoToStereo,
    StereoToMono,
}

impl From<ChannelConversion> for PlaybackChannelConversion {
    fn from(value: ChannelConversion) -> Self {
        match value {
            ChannelConversion::None => Self::None,
            ChannelConversion::MonoToStereo => Self::MonoToStereo,
            ChannelConversion::StereoToMono => Self::StereoToMono,
        }
    }
}

#[derive(Debug, Copy, Clone)]
struct PlaybackProcessingInfo {
    channel_conversion: PlaybackChannelConversion,
    source_sample_rate: u32,
    output_sample_rate: u32,
}

impl PlaybackProcessingInfo {
    fn from_plan(plan: super::output_processing::OutputProcessingPlan) -> Self {
        Self {
            channel_conversion: plan.channel_conversion().into(),
            source_sample_rate: plan.source().sample_rate().get(),
            output_sample_rate: plan.output().sample_rate().get(),
        }
    }
    fn resampling_active(self) -> bool {
        self.source_sample_rate != self.output_sample_rate
    }
}

#[derive(Debug, Clone)]
struct TimedPlaybackSnapshotData {
    file: ValidatedAudioFile,
    playback_id: String,
    position_ms: u64,
    duration_ms: Option<u64>,
    output_selection: AudioOutputSelection,
    output_device: AudioOutputDeviceIdentity,
    processing: PlaybackProcessingInfo,
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
            can_go_previous: false,
            can_go_next: false,
        }
    }

    #[cfg(test)]
    fn playing_with_conversion(
        volume: VolumeState,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
        channel_conversion: PlaybackChannelConversion,
    ) -> Self {
        Self::playing_with_data(
            TimedPlaybackSnapshotData {
                file: test_file(),
                playback_id,
                position_ms,
                duration_ms,
                output_selection: AudioOutputSelection::SystemDefault,
                output_device: AudioOutputDeviceIdentity {
                    id: "test-device".into(),
                    name: "Test device".into(),
                },
                processing: PlaybackProcessingInfo {
                    channel_conversion,
                    source_sample_rate: 44_100,
                    output_sample_rate: 44_100,
                },
            },
            volume,
        )
    }

    fn playing_with_data(data: TimedPlaybackSnapshotData, volume: VolumeState) -> Self {
        Self::Playing {
            revision: 0,
            file: data.file,
            playback_id: data.playback_id,
            position_ms: data.position_ms,
            duration_ms: data.duration_ms,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection: data.output_selection,
            output_device: data.output_device,
            channel_conversion: data.processing.channel_conversion,
            source_sample_rate: data.processing.source_sample_rate,
            output_sample_rate: data.processing.output_sample_rate,
            resampling_active: data.processing.resampling_active(),
            can_go_previous: false,
            can_go_next: false,
        }
    }

    #[cfg(test)]
    fn paused_with_conversion(
        volume: VolumeState,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
        channel_conversion: PlaybackChannelConversion,
    ) -> Self {
        Self::paused_with_data(
            TimedPlaybackSnapshotData {
                file: test_file(),
                playback_id,
                position_ms,
                duration_ms,
                output_selection: AudioOutputSelection::SystemDefault,
                output_device: AudioOutputDeviceIdentity {
                    id: "test-device".into(),
                    name: "Test device".into(),
                },
                processing: PlaybackProcessingInfo {
                    channel_conversion,
                    source_sample_rate: 44_100,
                    output_sample_rate: 44_100,
                },
            },
            volume,
        )
    }

    fn paused_with_data(data: TimedPlaybackSnapshotData, volume: VolumeState) -> Self {
        Self::Paused {
            revision: 0,
            file: data.file,
            playback_id: data.playback_id,
            position_ms: data.position_ms,
            duration_ms: data.duration_ms,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection: data.output_selection,
            output_device: data.output_device,
            channel_conversion: data.processing.channel_conversion,
            source_sample_rate: data.processing.source_sample_rate,
            output_sample_rate: data.processing.output_sample_rate,
            resampling_active: data.processing.resampling_active(),
            can_go_previous: false,
            can_go_next: false,
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
            can_go_previous: false,
            can_go_next: false,
        }
    }

    fn with_volume(mut self, volume: VolumeState) -> Self {
        match &mut self {
            Self::Stopped {
                volume: current,
                muted,
                ..
            }
            | Self::Playing {
                volume: current,
                muted,
                ..
            }
            | Self::Paused {
                volume: current,
                muted,
                ..
            }
            | Self::Failed {
                volume: current,
                muted,
                ..
            } => {
                *current = volume.volume();
                *muted = volume.muted();
            }
        }
        self
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

    fn set_navigation(&mut self, can_go_previous: bool, can_go_next: bool) {
        match self {
            Self::Stopped {
                can_go_previous: previous,
                can_go_next: next,
                ..
            }
            | Self::Playing {
                can_go_previous: previous,
                can_go_next: next,
                ..
            }
            | Self::Paused {
                can_go_previous: previous,
                can_go_next: next,
                ..
            }
            | Self::Failed {
                can_go_previous: previous,
                can_go_next: next,
                ..
            } => {
                *previous = can_go_previous;
                *next = can_go_next;
            }
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
        Self::playing_with_conversion(
            volume,
            playback_id,
            position_ms,
            duration_ms,
            PlaybackChannelConversion::None,
        )
    }

    #[cfg(test)]
    fn paused(
        volume: VolumeState,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> Self {
        Self::paused_with_conversion(
            volume,
            playback_id,
            position_ms,
            duration_ms,
            PlaybackChannelConversion::None,
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
    SampleRateConversionFailed,
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
    StartSequence {
        files: Vec<ValidatedAudioFile>,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    StartSequenceAt {
        files: Vec<ValidatedAudioFile>,
        index: usize,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Previous {
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    },
    Next {
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
                    sequence: None,
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
    pub(crate) fn play_sequence(
        &self,
        files: Vec<ValidatedAudioFile>,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::StartSequence { files, reply })
    }
    pub(crate) fn play_sequence_at(
        &self,
        files: Vec<ValidatedAudioFile>,
        index: usize,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::StartSequenceAt {
            files,
            index,
            reply,
        })
    }
    pub(crate) fn previous(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Previous { reply })
    }
    pub(crate) fn next(&self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        self.request(|reply| PlaybackCommand::Next { reply })
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
    output_config: PreparedOutputConfig,
    id: OutputStreamId,
    stream: PreparedOutputStream,
    decode_pipeline: DecodePipeline,
    sample_rate: u32,
    duration_ms: Option<u64>,
    reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    start_paused: bool,
    sequence_index: usize,
}

impl PendingPlayback {
    fn into_active(
        self,
    ) -> (
        ActivePlayback,
        SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    ) {
        let Self {
            session_id,
            source_file,
            output_config,
            id,
            stream,
            decode_pipeline,
            sample_rate,
            duration_ms,
            reply,
            start_paused: _,
            sequence_index: _,
        } = self;
        (
            ActivePlayback {
                session_id,
                id,
                source_file,
                output_config,
                stream,
                completion_time: None,
                sample_rate,
                duration_ms,
                position_frame: 0,
                position_base_frame: 0,
                remaining_frames: duration_ms
                    .map(|duration| duration_to_frames(duration, sample_rate)),
                last_position_publish: Instant::now(),
                decoder_worker: decode_pipeline.into_worker(),
            },
            reply,
        )
    }
}

struct PendingSeek {
    session_id: u64,
    id: OutputStreamId,
    confirmed_position_ms: u64,
    output_base_frame: u64,
    remaining_frames: u64,
    stream: PreparedOutputStream,
    output_config: PreparedOutputConfig,
    decode_pipeline: DecodePipeline,
    sample_rate: u32,
    duration_ms: u64,
    reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
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
    sequence: Option<PlaybackSequence>,
    volume_state: VolumeState,
    effective_gain: AtomicEffectiveGain,
    output_selection: AudioOutputSelection,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    command_receiver: Receiver<PlaybackCommand>,
    state_changed_sender: SyncSender<()>,
    output_sender: SyncSender<OutputSignal>,
    output_receiver: Receiver<OutputSignal>,
}

#[derive(Debug, Clone)]
struct PlaybackSequence {
    files: Vec<ValidatedAudioFile>,
    current_index: usize,
}

impl PlaybackSequence {
    fn new(files: Vec<ValidatedAudioFile>) -> Option<Self> {
        (!files.is_empty()).then_some(Self {
            files,
            current_index: 0,
        })
    }
    fn current(&self) -> &ValidatedAudioFile {
        &self.files[self.current_index]
    }
    fn previous(&self) -> Option<&ValidatedAudioFile> {
        self.current_index
            .checked_sub(1)
            .and_then(|i| self.files.get(i))
    }
    fn next(&self) -> Option<&ValidatedAudioFile> {
        self.files.get(self.current_index + 1)
    }
    fn can_go_previous(&self) -> bool {
        self.previous().is_some()
    }
    fn can_go_next(&self) -> bool {
        self.next().is_some()
    }
}
impl PlaybackWorker {
    fn run(mut self) {
        loop {
            while let Ok(signal) = self.output_receiver.try_recv() {
                self.handle_signal(signal);
            }
            match self.command_receiver.recv_timeout(Duration::from_millis(5)) {
                Ok(PlaybackCommand::Start { file, reply }) => {
                    self.sequence = PlaybackSequence::new(vec![file]);
                    let file = self
                        .sequence
                        .as_ref()
                        .expect("single-item sequence")
                        .current()
                        .clone();
                    self.begin_start(file, reply, false, 0);
                }
                Ok(PlaybackCommand::StartSequence { files, reply }) => {
                    let Some(sequence) = PlaybackSequence::new(files) else {
                        let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
                        continue;
                    };
                    let file = sequence.current().clone();
                    self.sequence = Some(sequence);
                    self.begin_start(file, reply, false, 0);
                }
                Ok(PlaybackCommand::StartSequenceAt {
                    files,
                    index,
                    reply,
                }) => {
                    let Some(mut sequence) = PlaybackSequence::new(files) else {
                        let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
                        continue;
                    };
                    if index >= sequence.files.len() {
                        let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
                        continue;
                    }
                    sequence.current_index = index;
                    let file = sequence.current().clone();
                    self.sequence = Some(sequence);
                    self.begin_start(file, reply, false, index);
                }
                Ok(PlaybackCommand::Previous { reply }) => {
                    self.navigate(false, reply);
                }
                Ok(PlaybackCommand::Next { reply }) => {
                    self.navigate(true, reply);
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
        start_paused: bool,
        sequence_index: usize,
    ) {
        self.discard_pending();
        self.discard_pending_seek();
        self.discard_active();
        let mut decoder = match open_playback_decoder(&file) {
            Ok(decoder) => decoder,
            Err(_) => {
                self.fail_start(
                    reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    PlaybackServiceError::Decode,
                );
                return;
            }
        };
        let spec = decoder.spec();
        let duration_ms = decoder.duration_ms();
        let mut first_packet = Vec::new();
        match decoder.decode_next(&mut first_packet) {
            Err(_) | Ok(DecodeStep::EndOfStream) => {
                self.fail_start(
                    reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    PlaybackServiceError::Decode,
                );
                return;
            }
            Ok(DecodeStep::Samples) => {}
        }
        let decode_setup = DecodeWorkerSetup::new();
        self.next_playback_session_id = self.next_playback_session_id.wrapping_add(1);
        self.next_output_stream_id = self.next_output_stream_id.wrapping_add(1);
        let session_id = self.next_playback_session_id;
        let id = OutputStreamId(self.next_output_stream_id);
        let resolved_device = match resolve_output_selection(&self.output_selection) {
            Ok(device) => device,
            Err(error) => {
                let code = device_resolution_failure_code(error);
                self.fail_start(
                    reply,
                    Some(id.0.to_string()),
                    code.clone(),
                    PlaybackServiceError::Output(code),
                );
                return;
            }
        };
        let preparation = match prepare_output_stream(
            id,
            spec,
            resolved_device,
            self.effective_gain.clone(),
            decode_setup.producer_state(),
            decode_setup.capacity_sender(),
            self.output_sender.clone(),
        ) {
            Ok(preparation) => preparation,
            Err(error) => {
                let code = output_failure_code(error);
                self.fail_start(
                    reply,
                    Some(id.0.to_string()),
                    code.clone(),
                    PlaybackServiceError::Output(code),
                );
                return;
            }
        };
        let decode_pipeline = match decode_setup.spawn(DecodeTaskInput {
            decoder,
            first_packet,
            producer: preparation.producer,
            processor: match OutputPcmProcessor::new(preparation.config.processing_plan) {
                Ok(processor) => processor,
                Err(_) => {
                    let error = PlaybackFailureCode::SampleRateConversionFailed;
                    self.fail_start(
                        reply,
                        Some(id.0.to_string()),
                        error.clone(),
                        PlaybackServiceError::Output(error),
                    );
                    return;
                }
            },
            output_sample_rate: preparation
                .config
                .processing_plan
                .output()
                .sample_rate()
                .get(),
            signal_sender: self.output_sender.clone(),
            stream_id: id,
            discard_output_samples: 0,
        }) {
            Ok(pipeline) => pipeline,
            Err(_) => {
                let error = PlaybackFailureCode::SampleRateConversionFailed;
                self.fail_start(
                    reply,
                    Some(id.0.to_string()),
                    error.clone(),
                    PlaybackServiceError::Output(error),
                );
                return;
            }
        };
        let sample_rate = preparation
            .config
            .processing_plan
            .output()
            .sample_rate()
            .get();
        let stream = preparation.stream;
        self.pending = Some(PendingPlayback {
            session_id,
            source_file: file,
            output_config: preparation.config.clone(),
            id,
            stream,
            decode_pipeline,
            sample_rate,
            duration_ms,
            reply,
            start_paused,
            sequence_index,
        });
    }

    fn fail_start(
        &mut self,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
        playback_id: Option<String>,
        code: PlaybackFailureCode,
        error: PlaybackServiceError,
    ) {
        self.sequence = None;
        self.publish(self.failed_snapshot(playback_id, code));
        let _ = reply.send(Err(error));
    }

    fn navigate(
        &mut self,
        forward: bool,
        reply: SyncSender<Result<PlaybackSnapshot, PlaybackServiceError>>,
    ) {
        let paused = matches!(self.current(), PlaybackSnapshot::Paused { .. });
        let target = self.sequence.as_ref().and_then(|sequence| {
            let index = if forward {
                sequence.current_index + 1
            } else {
                sequence.current_index.checked_sub(1)?
            };
            sequence.files.get(index).cloned().map(|file| (file, index))
        });
        let Some((file, index)) = target else {
            let _ = reply.send(Ok(self.current()));
            return;
        };
        self.begin_start(file, reply, paused, index);
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
        let source_spec = active.output_config.processing_plan.source();
        let target_source_frame = millis_to_frame(target_ms, source_spec.sample_rate().get());
        let processing_plan = active.output_config.processing_plan;
        let processor = match OutputPcmProcessor::new(processing_plan) {
            Ok(processor) => processor,
            Err(_) => {
                let _ = reply.send(Err(PlaybackServiceError::Output(
                    PlaybackFailureCode::SampleRateConversionFailed,
                )));
                return;
            }
        };
        let preroll_frames = processor.seek_preroll_frames(target_source_frame);
        let mut decoder = match open_playback_decoder(&source_file) {
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
        let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames) {
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
        let decode_setup = DecodeWorkerSetup::new();
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
            resolved_device,
            &output_config,
            self.effective_gain.clone(),
            decode_setup.producer_state(),
            decode_setup.capacity_sender(),
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
        let sample_rate = preparation
            .config
            .processing_plan
            .output()
            .sample_rate()
            .get();
        let discard_output_frames = source_to_output_frame(
            seek.confirmed_source_frame
                .saturating_sub(seek.preroll_source_frame),
            sample_rate,
            source_spec.sample_rate().get(),
        ) as usize;
        let discard_output_samples = discard_output_frames.saturating_mul(usize::from(
            output_config.processing_plan.output().channel_count().get(),
        ));
        let decode_pipeline = match decode_setup.spawn(DecodeTaskInput {
            decoder,
            first_packet: seek.first_packet,
            producer: preparation.producer,
            processor,
            output_sample_rate: output_config.processing_plan.output().sample_rate().get(),
            signal_sender: self.output_sender.clone(),
            stream_id: id,
            discard_output_samples,
        }) {
            Ok(pipeline) => pipeline,
            Err(_) => {
                let _ = reply.send(Err(PlaybackServiceError::Output(
                    PlaybackFailureCode::SampleRateConversionFailed,
                )));
                return;
            }
        };
        let output_base_frame = source_to_output_frame(
            seek.confirmed_source_frame,
            sample_rate,
            source_spec.sample_rate().get(),
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
            decode_pipeline,
            sample_rate,
            duration_ms,
            reply,
        });
    }

    fn advance_pending_seek(&mut self) {
        let Some(pending) = self.pending_seek.as_ref() else {
            return;
        };
        let ready = pending.decode_pipeline.prebuffer_ready();
        let state = pending.decode_pipeline.producer_state();
        if !ready && state == ProducerState::Running {
            return;
        }
        let pending = self.pending_seek.take().expect("pending seek exists");
        if state == ProducerState::DecodeFailed {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Decode));
            return;
        }
        if state == ProducerState::SampleRateConversionFailed {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Output(
                PlaybackFailureCode::SampleRateConversionFailed,
            )));
            return;
        }
        let Some(active) = self.active.as_ref() else {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        if active.session_id != pending.session_id {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        let was_playing = matches!(self.current(), PlaybackSnapshot::Playing { .. });
        if was_playing {
            if let Some(active) = self.active.as_mut() {
                if let Err(error) = active.stream.pause() {
                    pending.decode_pipeline.cancel_and_join();
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
                pending.decode_pipeline.cancel_and_join();
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
            output_config: pending.output_config,
            stream: pending.stream,
            completion_time: None,
            sample_rate: pending.sample_rate,
            duration_ms: Some(pending.duration_ms),
            position_frame: pending.output_base_frame,
            position_base_frame: pending.output_base_frame,
            remaining_frames: Some(pending.remaining_frames),
            last_position_publish: Instant::now(),
            decoder_worker: pending.decode_pipeline.into_worker(),
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
            pending.decode_pipeline.cancel_and_join();
            let _ = pending.reply.send(Err(error));
        }
    }
    fn advance_pending_playback(&mut self) {
        let Some(pending) = self.pending.as_ref() else {
            return;
        };
        let ready = pending.decode_pipeline.prebuffer_ready();
        let state = pending.decode_pipeline.producer_state();
        if !ready && state == ProducerState::Running {
            return;
        }

        let pending = self.pending.take().expect("pending playback exists");
        if state == ProducerState::DecodeFailed {
            self.fail_pending_start(
                pending,
                PlaybackFailureCode::DecodeFailed,
                PlaybackServiceError::Decode,
            );
            return;
        }
        if state == ProducerState::SampleRateConversionFailed {
            let code = PlaybackFailureCode::SampleRateConversionFailed;
            self.fail_pending_start(pending, code.clone(), PlaybackServiceError::Output(code));
            return;
        }
        if !pending.start_paused {
            if let Err(error) = pending.stream.start() {
                let code = output_failure_code(error);
                self.fail_pending_start(pending, code.clone(), PlaybackServiceError::Output(code));
                return;
            }
        }
        let start_paused = pending.start_paused;
        let sequence_index = pending.sequence_index;
        let (active, reply) = pending.into_active();
        let session_id = active.session_id;
        let duration_ms = active.duration_ms;
        self.current_file = Some(active.source_file.clone());
        self.active = Some(active);
        if let Some(sequence) = self.sequence.as_mut() {
            sequence.current_index = sequence_index;
        }
        let snapshot = if start_paused {
            self.publish(self.paused_snapshot(session_id.to_string(), 0, duration_ms))
        } else {
            self.publish(self.playing_snapshot(session_id.to_string(), 0, duration_ms))
        };
        let _ = reply.send(Ok(snapshot));
    }

    fn fail_pending_start(
        &mut self,
        pending: PendingPlayback,
        code: PlaybackFailureCode,
        error: PlaybackServiceError,
    ) {
        let playback_id = Some(pending.id.0.to_string());
        pending.decode_pipeline.cancel_and_join();
        self.fail_start(pending.reply, playback_id, code, error);
    }

    fn discard_pending(&mut self) {
        if let Some(pending) = self.pending.take() {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending
                .reply
                .send(Err(PlaybackServiceError::WorkerUnavailable));
        }
    }
    fn stop(&mut self) -> PlaybackSnapshot {
        self.discard_pending();
        self.discard_pending_seek();
        self.discard_active();
        self.sequence = None;
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

    fn timed_snapshot_data(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> TimedPlaybackSnapshotData {
        let active = self
            .active
            .as_ref()
            .expect("snapshot requires active playback");
        TimedPlaybackSnapshotData {
            file: active.source_file.clone(),
            playback_id,
            position_ms,
            duration_ms,
            output_selection: self.output_selection.clone(),
            output_device: AudioOutputDeviceIdentity {
                id: active.output_config.device_id.clone(),
                name: active.output_config.device_name.clone(),
            },
            processing: PlaybackProcessingInfo::from_plan(active.output_config.processing_plan),
        }
    }

    fn playing_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::playing_with_data(
            self.timed_snapshot_data(playback_id, position_ms, duration_ms),
            self.volume_state,
        )
    }

    fn paused_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::paused_with_data(
            self.timed_snapshot_data(playback_id, position_ms, duration_ms),
            self.volume_state,
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
        let (previous, next) = match (&snapshot, &self.sequence) {
            (
                PlaybackSnapshot::Playing { .. } | PlaybackSnapshot::Paused { .. },
                Some(sequence),
            ) => (sequence.can_go_previous(), sequence.can_go_next()),
            _ => (false, false),
        };
        snapshot.set_navigation(previous, next);
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
        self.sequence = None;
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
                self.sequence = None;
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
                self.sequence = None;
                self.publish(self.failed_snapshot(playback_id, PlaybackFailureCode::DecodeFailed));
            }
            OutputSignal::SampleRateConversionFailed { .. } => {
                let playback_id = self
                    .active
                    .as_ref()
                    .map(|active| active.session_id.to_string());
                self.cancel_pending_seek_with(PlaybackServiceError::Output(
                    PlaybackFailureCode::SampleRateConversionFailed,
                ));
                self.discard_active();
                self.sequence = None;
                self.publish(
                    self.failed_snapshot(
                        playback_id,
                        PlaybackFailureCode::SampleRateConversionFailed,
                    ),
                );
            }
        }
    }
    fn finish_if_due(&mut self) {
        let is_due = self.active.as_ref().is_some_and(|active| {
            should_finish(&self.current(), active.completion_time, active.stream.now())
        });
        if is_due {
            self.discard_pending_seek();
            self.discard_active();
            let next = self.sequence.as_ref().and_then(|sequence| {
                let index = sequence.current_index + 1;
                sequence.files.get(index).cloned().map(|file| (file, index))
            });
            if let Some((file, index)) = next {
                let (reply, _receiver) = mpsc::sync_channel(1);
                self.begin_start(file, reply, false, index);
            } else {
                self.sequence = None;
                self.publish(self.stopped_snapshot());
            }
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
        | OutputSignal::DecodeFailed { stream_id }
        | OutputSignal::SampleRateConversionFailed { stream_id } => *stream_id,
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

#[cfg(test)]
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
mod tests;

