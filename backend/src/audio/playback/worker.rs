//! The playback worker thread: owns the queue, the transport state and every in-flight operation.
//!
//! The worker sleeps until something arrives on its one input channel: a command from a caller or
//! an event from a decode, source-load or output thread. It ticks only while a track is playing,
//! to publish the position and notice the end of the track.

use std::sync::{mpsc::Receiver, Arc, RwLock};
use std::time::{Duration, Instant};

use super::input::{
    Inbox, PlaybackId, PlaybackIds, SourceLoadId, SourceLoadIds, WorkerEvent, WorkerInput,
};
use super::item::{PlaybackItem, PlaybackItemSeed};
use super::pipeline::{
    open_pipeline, OpenedPipeline, PipelineError, PipelineKind, PipelineRequest,
};
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{AdvanceReason, PlaybackQueue, QueueError};
use super::service::{respond, PlaybackCommand, PlaybackServiceError, Reply};
use super::session::{
    should_publish_position, LoadStage, Loaded, Loading, Position, Prebuffering, SeekInFlight,
    StartRequest, Transport,
};
use super::snapshot::{
    ActiveSession, PlaybackFailureCode, PlaybackProcessingInfo, PlaybackQueueSnapshot,
    PlaybackSnapshot, SnapshotBase,
};
use super::source_loader::SourceLoad;
use crate::audio::compressed_source::{CompressedAudioSource, CompressedSourceError};
use crate::audio::devices::{
    AudioOutputDeviceIdentity, AudioOutputSelection, DeviceResolutionError,
};
use crate::audio::output::{
    AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, StreamFailureKind,
};
use crate::audio::timebase::millis_to_frame;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::events::{BackendEvent, SharedEventSink};
use log::{error, info};
use rand::{rngs::StdRng, SeedableRng};

mod failure;
mod preferences;
mod progress;
mod publish;
mod seek;
mod start;
mod transport;

const TICK_INTERVAL: Duration = Duration::from_millis(50);

/// "Previous" restarts the track instead of leaving it once it has played this long.
const PREVIOUS_RESTART_THRESHOLD_MS: u64 = 3_000;

#[derive(Debug, Copy, Clone)]
pub(super) enum StartFailurePhase {
    SourceOpen,
    SourceMetadata,
    SourceRead,
    SourceChanged,
    SourceWorker,
    DecoderOpen,
    FirstPacketDecode,
    OutputPrepare,
    ProcessorCreate,
    PrebufferDecode,
    PrebufferConversion,
    StreamStart,
}

/// What a failure condemns, which decides whether the queue survives it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum FailureScope {
    /// This file cannot be played (unreadable, undecodable). The next one may be fine.
    Item,
    /// The output path failed (device, stream). Another file would fail the same way.
    Output,
}

impl StartFailurePhase {
    pub(super) fn scope(self) -> FailureScope {
        match self {
            Self::SourceOpen
            | Self::SourceMetadata
            | Self::SourceRead
            | Self::SourceChanged
            | Self::DecoderOpen
            | Self::FirstPacketDecode
            | Self::ProcessorCreate
            | Self::PrebufferDecode
            | Self::PrebufferConversion => FailureScope::Item,
            Self::SourceWorker | Self::OutputPrepare | Self::StreamStart => FailureScope::Output,
        }
    }
}

struct StartFailure {
    code: PlaybackFailureCode,
    phase: StartFailurePhase,
    error: PlaybackServiceError,
}

impl StartFailure {
    /// The file could not be decoded.
    fn item(phase: StartFailurePhase) -> Self {
        Self {
            code: PlaybackFailureCode::DecodeFailed,
            phase,
            error: PlaybackServiceError::Decode,
        }
    }

    fn output(phase: StartFailurePhase, code: PlaybackFailureCode) -> Self {
        Self {
            error: PlaybackServiceError::Output(code.clone()),
            code,
            phase,
        }
    }
}

/// Which part of the transport a stream belongs to.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum StreamOwner {
    /// The stream of a start that is prebuffering.
    Start,
    /// The stream that is playing.
    Active,
    /// The stream of a seek that is prebuffering.
    Seek,
    /// A stream the worker has already let go of.
    Gone,
}

/// The channels and shared state the service hands to the worker thread.
pub(super) struct WorkerLinks {
    pub snapshot: Arc<RwLock<PlaybackSnapshot>>,
    pub queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
    pub effective_gain: AtomicEffectiveGain,
    pub inbox: Inbox,
    pub events: SharedEventSink,
    pub observer: PreferencesObserver,
    pub backend: Box<dyn OutputBackend>,
}

pub(super) struct PlaybackWorker {
    transport: Transport,
    ids: PlaybackIds,
    source_load_ids: SourceLoadIds,
    next_stream_id: u64,
    revision: u64,
    next_queue_revision: u64,
    /// Completed seeks; published with the session so the UI can tell a seek from a tick.
    seek_revision: u64,
    /// The last track that reached the output, kept so a stopped player can still name it.
    last_item: Option<PlaybackItem>,
    queue: PlaybackQueue,
    rng: StdRng,
    /// Files skipped in a row after failing; bounds the skipping to one pass over the queue.
    skipped_in_a_row: usize,
    volume_state: VolumeState,
    effective_gain: AtomicEffectiveGain,
    output_selection: AudioOutputSelection,
    last_tick: Instant,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
    inbox: Inbox,
    events: SharedEventSink,
    observer: PreferencesObserver,
    backend: Box<dyn OutputBackend>,
}

impl PlaybackWorker {
    pub(super) fn new(
        links: WorkerLinks,
        queue: PlaybackQueue,
        volume_state: VolumeState,
        output_selection: AudioOutputSelection,
    ) -> Self {
        Self {
            transport: Transport::Idle,
            ids: PlaybackIds::default(),
            source_load_ids: SourceLoadIds::default(),
            next_stream_id: 0,
            revision: 0,
            next_queue_revision: 0,
            seek_revision: 0,
            last_item: None,
            queue,
            rng: StdRng::from_rng(&mut rand::rng()),
            skipped_in_a_row: 0,
            volume_state,
            effective_gain: links.effective_gain,
            output_selection,
            last_tick: Instant::now(),
            snapshot: links.snapshot,
            queue_snapshot: links.queue_snapshot,
            inbox: links.inbox,
            events: links.events,
            observer: links.observer,
            backend: links.backend,
        }
    }

    pub(super) fn run(mut self, inputs: Receiver<WorkerInput>) {
        loop {
            let input = if self.wants_ticks() {
                match inputs.recv_timeout(TICK_INTERVAL) {
                    Ok(input) => Some(input),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        self.tick();
                        continue;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }
            } else {
                inputs.recv().ok()
            };
            let Some(input) = input else { break };
            if !self.handle(input) {
                break;
            }
            if self.wants_ticks() && self.last_tick.elapsed() >= TICK_INTERVAL {
                self.tick();
            }
        }
        self.shutdown();
    }

    /// Whether the worker has anything to do between inputs: only a playing track does.
    pub(super) fn wants_ticks(&self) -> bool {
        matches!(&self.transport, Transport::Loaded(loaded) if !loaded.paused)
    }

    /// Takes one input. Returns whether the worker should keep running.
    pub(super) fn handle(&mut self, input: WorkerInput) -> bool {
        match input {
            WorkerInput::Command(command) => self.handle_command(command),
            WorkerInput::Event(event) => self.handle_event(event),
            WorkerInput::Shutdown => return false,
        }
        true
    }

    fn handle_command(&mut self, command: PlaybackCommand) {
        match command {
            PlaybackCommand::Start {
                items,
                start_index,
                reply,
            } => self.start_queue(items, start_index, reply),
            PlaybackCommand::Previous { reply } => {
                self.navigate(AdvanceReason::UserPrevious, reply)
            }
            PlaybackCommand::Next { reply } => self.navigate(AdvanceReason::UserNext, reply),
            PlaybackCommand::Stop { reply } => {
                let _ = reply.send(Ok(self.stop()));
            }
            PlaybackCommand::Pause { reply } => {
                let _ = reply.send(self.pause());
            }
            PlaybackCommand::Resume { reply } => {
                let _ = reply.send(self.resume());
            }
            PlaybackCommand::Seek { position_ms, reply } => {
                self.begin_seek(position_ms, Some(reply));
            }
            PlaybackCommand::SetVolume { volume, reply } => {
                let _ = reply.send(self.set_volume(volume));
            }
            PlaybackCommand::Mute { reply } => {
                let _ = reply.send(Ok(self.mute()));
            }
            PlaybackCommand::Unmute { reply } => {
                let _ = reply.send(Ok(self.unmute()));
            }
            PlaybackCommand::SetOutputSelection { selection, reply } => {
                self.change_output_selection(selection, reply);
            }
            PlaybackCommand::SetRepeatMode { mode, reply } => {
                let changed = self.queue.set_repeat(mode);
                if changed {
                    self.preferences_changed();
                }
                let _ = reply.send(Ok(self.queue_changed(changed)));
            }
            PlaybackCommand::SetShuffle { enabled, reply } => {
                let changed = self.queue.set_shuffle(enabled, &mut self.rng);
                if changed {
                    self.preferences_changed();
                }
                let _ = reply.send(Ok(self.queue_changed(changed)));
            }
            PlaybackCommand::RemoveQueueItem { id, reply } => {
                let result = self.edit_queue(|queue| queue.remove_upcoming(&id).map(|()| true));
                let _ = reply.send(result.map(|changed| self.queue_changed(changed)));
            }
            PlaybackCommand::MoveQueueItem { id, to, reply } => {
                let result = self.edit_queue(|queue| queue.move_upcoming(&id, to));
                let _ = reply.send(result.map(|changed| self.queue_changed(changed)));
            }
            PlaybackCommand::PlayQueueItem { id, reply } => {
                self.skipped_in_a_row = 0;
                match self.queue.jump_to(&id) {
                    Ok(()) => self.start_current(Some(reply), false),
                    Err(_) => {
                        let _ = reply.send(Err(PlaybackServiceError::QueueItemNotFound));
                    }
                }
            }
            PlaybackCommand::Enqueue { items, next, reply } => {
                let result = self.edit_queue(|queue| queue.enqueue(items, next).map(|()| true));
                let _ = reply.send(result.map(|changed| self.queue_changed(changed)));
            }
            PlaybackCommand::ClearQueue { reply } => {
                let changed = self.queue.clear_upcoming();
                let _ = reply.send(Ok(self.queue_changed(changed)));
            }
        }
    }

    fn handle_event(&mut self, event: WorkerEvent) {
        match event {
            WorkerEvent::SourceLoaded { id, result } => self.source_loaded(id, result),
            WorkerEvent::PrebufferReady { stream } => match self.owner_of(stream) {
                StreamOwner::Start => self.finish_start(),
                StreamOwner::Seek => self.finish_seek(),
                StreamOwner::Active | StreamOwner::Gone => {}
            },
            WorkerEvent::DecodeFailed { stream } => {
                error!("playback.decode_failed stream_id={}", stream.0);
                self.decode_stopped(stream, PlaybackFailureCode::DecodeFailed);
            }
            WorkerEvent::ConversionFailed { stream } => {
                error!(
                    "playback.sample_rate_conversion_failed stream_id={}",
                    stream.0
                );
                self.decode_stopped(stream, PlaybackFailureCode::SampleRateConversionFailed);
            }
            WorkerEvent::FinalFrames { stream, end_time } => {
                if let Transport::Loaded(loaded) = &mut self.transport {
                    if loaded.pipeline.stream_id == stream {
                        loaded.completion_time = Some(end_time);
                    }
                }
            }
            WorkerEvent::StreamFailed { stream, kind } => self.stream_failed(stream, kind),
        }
    }

    fn owner_of(&self, stream: OutputStreamId) -> StreamOwner {
        match &self.transport {
            Transport::Loading(Loading {
                stage: LoadStage::Prebuffering(prebuffering),
                ..
            }) if prebuffering.pipeline.stream_id == stream => StreamOwner::Start,
            Transport::Loaded(loaded) if loaded.pipeline.stream_id == stream => StreamOwner::Active,
            Transport::Loaded(loaded)
                if loaded
                    .seek
                    .as_ref()
                    .is_some_and(|seek| seek.pipeline.stream_id == stream) =>
            {
                StreamOwner::Seek
            }
            _ => StreamOwner::Gone,
        }
    }

    pub(super) fn shutdown(&mut self) {
        self.discard_transport();
        self.publish_state();
    }

    fn open_pipeline(
        &mut self,
        source: &CompressedAudioSource,
        extension: &str,
        kind: PipelineKind,
    ) -> Result<OpenedPipeline, PipelineError> {
        let stream_id = self.next_stream_id();
        let links = self.output_links(stream_id);
        open_pipeline(
            self.backend.as_ref(),
            &self.inbox,
            PipelineRequest {
                source,
                extension,
                kind,
                stream_id,
                links,
            },
        )
    }

    fn next_stream_id(&mut self) -> OutputStreamId {
        self.next_stream_id = self.next_stream_id.wrapping_add(1);
        OutputStreamId(self.next_stream_id)
    }

    fn output_links(&self, stream: OutputStreamId) -> OutputLinks {
        OutputLinks {
            gain: self.effective_gain.clone(),
            events: self.inbox.output_events(stream),
        }
    }
}

pub(super) fn previous_restarts_track(position_ms: u64, duration_ms: Option<u64>) -> bool {
    duration_ms.is_some() && position_ms >= PREVIOUS_RESTART_THRESHOLD_MS
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum StreamSignalAction {
    RefreshDefaultDevice,
    PreservePlayback,
    Fail(PlaybackFailureCode),
}

pub(super) fn stream_signal_action(
    selection: &AudioOutputSelection,
    kind: StreamFailureKind,
) -> StreamSignalAction {
    match kind {
        StreamFailureKind::DeviceChanged => match selection {
            AudioOutputSelection::SystemDefault => StreamSignalAction::RefreshDefaultDevice,
            AudioOutputSelection::Device { .. } => StreamSignalAction::PreservePlayback,
        },
        StreamFailureKind::DeviceUnavailable => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
        }
        StreamFailureKind::RuntimeFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
        }
        StreamFailureKind::CompletionTimingFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::CompletionTimingFailed)
        }
    }
}

fn resolution_error(error: DeviceResolutionError) -> PlaybackServiceError {
    match error {
        DeviceResolutionError::InvalidDeviceId => PlaybackServiceError::InvalidDeviceId,
        DeviceResolutionError::DeviceUnavailable | DeviceResolutionError::NoDefaultOutputDevice => {
            PlaybackServiceError::OutputDeviceUnavailable
        }
    }
}

pub(super) fn output_failure_code(error: AudioOutputError) -> PlaybackFailureCode {
    match error {
        AudioOutputError::NoOutputDevice => PlaybackFailureCode::NoOutputDevice,
        AudioOutputError::UnsupportedConfiguration
        | AudioOutputError::ConfigurationQueryFailed
        | AudioOutputError::StreamConfigurationUnsupported => {
            PlaybackFailureCode::UnsupportedOutputConfiguration
        }
        AudioOutputError::StreamBuildFailed => PlaybackFailureCode::OutputStreamBuildFailed,
        AudioOutputError::StreamStartFailed => PlaybackFailureCode::OutputStreamStartFailed,
        AudioOutputError::StreamPauseFailed => PlaybackFailureCode::OutputStreamPauseFailed,
        AudioOutputError::StreamResumeFailed => PlaybackFailureCode::OutputStreamResumeFailed,
        AudioOutputError::DeviceUnavailable => PlaybackFailureCode::OutputDeviceUnavailable,
    }
}
