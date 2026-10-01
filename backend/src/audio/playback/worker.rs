//! The playback worker thread: owns the queue, the transport state and every in-flight operation.
//!
//! The worker sleeps until something arrives on its one input channel: a command from a caller or
//! an event from a decode, source-load or output thread. It ticks only while a track is playing,
//! to publish the position and notice the end of the track.

use std::sync::{mpsc::Receiver, Arc, RwLock};
use std::time::{Duration, Instant};

use super::decode_worker::{DecodeTaskInput, DecodeWorker};
use super::input::{Inbox, PlaybackId, PlaybackIds, WorkerEvent, WorkerInput};
use super::item::{PlaybackItem, PlaybackItemSeed};
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{AdvanceReason, PlaybackQueue, QueueError};
use super::service::{respond, PlaybackCommand, PlaybackServiceError, Reply};
use super::session::{
    duration_to_frames, millis_to_frame, should_publish_position, source_to_output_frame,
    LoadStage, Loaded, Loading, Pipeline, Position, Prebuffering, SeekInFlight, StartRequest,
    Transport,
};
use super::snapshot::{
    ActiveSession, PlaybackFailureCode, PlaybackProcessingInfo, PlaybackQueueSnapshot,
    PlaybackSnapshot, SnapshotBase,
};
use super::source_loader::SourceLoad;
use crate::audio::compressed_source::{CompressedAudioSource, CompressedSourceError};
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep};
use crate::audio::devices::{
    AudioOutputDeviceIdentity, AudioOutputSelection, DeviceResolutionError,
};
use crate::audio::output::{
    AudioOutputError, OutputBackend, OutputLinks, OutputStreamId, OutputTarget, StreamFailureKind,
};
use crate::audio::output_processing::OutputPcmProcessor;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::events::{BackendEvent, SharedEventSink};
use log::{error, info};
use rand::{rngs::StdRng, SeedableRng};

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

    // ---- starting ----

    /// Replaces the queue and starts its `start_index` item.
    fn start_queue(
        &mut self,
        items: Vec<PlaybackItemSeed>,
        start_index: usize,
        reply: Reply<PlaybackSnapshot>,
    ) {
        if self
            .queue
            .replace(items, start_index, &mut self.rng)
            .is_err()
        {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        self.skipped_in_a_row = 0;
        self.start_current(Some(reply), false);
    }

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    fn start_current(&mut self, responder: Option<Reply<PlaybackSnapshot>>, start_paused: bool) {
        let Some(item) = self.queue.current().cloned() else {
            respond(responder, Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        self.publish_queue();
        self.begin_start(StartRequest {
            item,
            responder,
            start_paused,
            resume_at_ms: None,
            selection: None,
        });
    }

    fn begin_start(&mut self, request: StartRequest) {
        let was_visible = matches!(
            self.transport,
            Transport::Loaded(_) | Transport::Failed { .. }
        );
        self.discard_transport();
        if was_visible {
            self.publish_state();
        }
        let id = self.ids.next();
        match SourceLoad::spawn(request.item.file.clone(), id, self.inbox.clone()) {
            Ok(load) => {
                self.transport = Transport::Loading(Loading {
                    id,
                    request,
                    stage: LoadStage::Source(load),
                });
            }
            Err(()) => self.fail_start(
                request,
                Some(id),
                StartFailure {
                    code: PlaybackFailureCode::DecodeFailed,
                    phase: StartFailurePhase::SourceWorker,
                    error: PlaybackServiceError::WorkerUnavailable,
                },
            ),
        }
    }

    fn source_loaded(
        &mut self,
        id: PlaybackId,
        result: Result<CompressedAudioSource, CompressedSourceError>,
    ) {
        let is_current_load = matches!(
            &self.transport,
            Transport::Loading(loading)
                if loading.id == id && matches!(loading.stage, LoadStage::Source(_))
        );
        if !is_current_load {
            return;
        }
        let Transport::Loading(loading) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return;
        };
        if let LoadStage::Source(load) = loading.stage {
            load.join();
        }
        let request = loading.request;
        match result {
            Ok(source) => self.begin_prebuffering(id, request, source),
            Err(CompressedSourceError::Cancelled) => {
                respond(request.responder, Err(PlaybackServiceError::Superseded));
            }
            Err(error) => {
                let phase = match error {
                    CompressedSourceError::OpenFailed => StartFailurePhase::SourceOpen,
                    CompressedSourceError::MetadataFailed => StartFailurePhase::SourceMetadata,
                    CompressedSourceError::ReadFailed => StartFailurePhase::SourceRead,
                    CompressedSourceError::SourceChanged => StartFailurePhase::SourceChanged,
                    CompressedSourceError::Cancelled => unreachable!(),
                };
                self.fail_start(request, Some(id), StartFailure::item(phase));
            }
        }
    }

    /// Opens the decoder, prepares the output and starts the decode thread that fills it.
    fn begin_prebuffering(
        &mut self,
        id: PlaybackId,
        request: StartRequest,
        source: CompressedAudioSource,
    ) {
        let selection = request
            .selection
            .clone()
            .unwrap_or_else(|| self.output_selection.clone());
        match self.open_start_pipeline(&request.item, &source, selection) {
            Ok((pipeline, duration_ms)) => {
                self.transport = Transport::Loading(Loading {
                    id,
                    request,
                    stage: LoadStage::Prebuffering(Prebuffering {
                        source,
                        pipeline,
                        duration_ms,
                    }),
                });
            }
            Err(failure) => self.fail_start(request, Some(id), failure),
        }
    }

    fn open_start_pipeline(
        &mut self,
        item: &PlaybackItem,
        source: &CompressedAudioSource,
        selection: AudioOutputSelection,
    ) -> Result<(Pipeline, Option<u64>), StartFailure> {
        let mut decoder = source
            .open_decoder(&item.file.extension)
            .map_err(|_| StartFailure::item(StartFailurePhase::DecoderOpen))?;
        let spec = decoder.spec();
        let duration_ms = decoder.duration_ms();
        let mut first_packet = Vec::new();
        match decoder.decode_next(&mut first_packet) {
            Err(_) | Ok(DecodeStep::EndOfStream) => {
                return Err(StartFailure::item(StartFailurePhase::FirstPacketDecode));
            }
            Ok(DecodeStep::Samples) => {}
        }
        let stream_id = self.next_stream_id();
        let prepared = self
            .backend
            .prepare(
                OutputTarget::Selection { selection, spec },
                self.output_links(stream_id),
            )
            .map_err(|error| {
                StartFailure::output(StartFailurePhase::OutputPrepare, output_failure_code(error))
            })?;
        let processor = OutputPcmProcessor::new(prepared.config.processing_plan).map_err(|_| {
            StartFailure::output(
                StartFailurePhase::ProcessorCreate,
                PlaybackFailureCode::SampleRateConversionFailed,
            )
        })?;
        let decode = DecodeWorker::spawn(
            DecodeTaskInput {
                decoder,
                first_packet,
                producer: prepared.producer,
                processor,
                output_sample_rate: prepared.config.processing_plan.output().sample_rate().get(),
                discard_output_samples: 0,
            },
            self.inbox.clone(),
            stream_id,
        );
        Ok((
            Pipeline {
                stream_id,
                stream: prepared.stream,
                config: prepared.config,
                decode,
            },
            duration_ms,
        ))
    }

    /// The prebuffer is ready: start the output (unless starting paused) and answer the caller.
    fn finish_start(&mut self) {
        let Transport::Loading(loading) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return;
        };
        let Loading { id, request, stage } = loading;
        let LoadStage::Prebuffering(prebuffering) = stage else {
            return;
        };
        let Prebuffering {
            source,
            pipeline,
            duration_ms,
        } = prebuffering;
        if !request.start_paused {
            if let Err(error) = pipeline.stream.start() {
                let code = output_failure_code(error);
                pipeline.cancel();
                self.fail_start(
                    request,
                    Some(id),
                    StartFailure::output(StartFailurePhase::StreamStart, code),
                );
                return;
            }
        }
        let StartRequest {
            item,
            responder,
            start_paused,
            resume_at_ms,
            selection,
        } = request;
        if let Some(selection) = selection {
            self.output_selection = selection;
            self.preferences_changed();
        }
        self.last_item = Some(item.clone());
        self.skipped_in_a_row = 0;
        self.transport = Transport::Loaded(Loaded {
            id,
            item,
            source,
            position: Position::from_start(pipeline.sample_rate(), duration_ms),
            pipeline,
            completion_time: None,
            paused: start_paused,
            seek: None,
        });
        let snapshot = self.publish_state();
        respond(responder, Ok(snapshot));
        if let Some(position_ms) = resume_at_ms {
            self.begin_seek(position_ms, None);
        }
    }

    /// Reports a failed start and, when only this file is at fault, moves on to the next one.
    /// Listeners see the failure first, so a skipped file is never silent.
    fn fail_start(&mut self, request: StartRequest, id: Option<PlaybackId>, failure: StartFailure) {
        error!(
            "playback.start_failed code={:?} phase={:?} playback_id={:?}",
            failure.code, failure.phase, id
        );
        self.transport = Transport::Failed {
            id,
            code: failure.code,
        };
        self.publish_state();
        let responder = request.responder;
        if failure.phase.scope() == FailureScope::Item && request.selection.is_none() {
            if let Some(item) = self.next_after_item_failure() {
                self.begin_start(StartRequest {
                    item,
                    responder,
                    start_paused: false,
                    resume_at_ms: None,
                    selection: None,
                });
                return;
            }
        }
        respond(responder, Err(failure.error));
    }

    /// The item to try after the current one could not be played, if there is one to try.
    fn next_after_item_failure(&mut self) -> Option<PlaybackItem> {
        self.skipped_in_a_row += 1;
        if self.skipped_in_a_row >= self.queue.len() {
            return None;
        }
        let item = self
            .queue
            .advance(AdvanceReason::UserNext, &mut self.rng)?
            .clone();
        self.publish_queue();
        Some(item)
    }

    fn navigate(&mut self, reason: AdvanceReason, reply: Reply<PlaybackSnapshot>) {
        if reason == AdvanceReason::UserPrevious {
            if let Transport::Loaded(loaded) = &self.transport {
                if previous_restarts_track(loaded.position_ms(), loaded.position.duration_ms) {
                    self.begin_seek(0, Some(reply));
                    return;
                }
            }
        }
        let paused = matches!(&self.transport, Transport::Loaded(loaded) if loaded.paused);
        self.skipped_in_a_row = 0;
        if self.queue.advance(reason, &mut self.rng).is_none() {
            let _ = reply.send(Ok(self.render()));
            return;
        }
        self.start_current(Some(reply), paused);
    }

    // ---- seeking ----

    fn begin_seek(
        &mut self,
        requested_position_ms: u64,
        responder: Option<Reply<PlaybackSnapshot>>,
    ) {
        self.cancel_seek(PlaybackServiceError::Superseded);
        let Transport::Loaded(loaded) = &self.transport else {
            respond(responder, Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        let Some(duration_ms) = loaded.position.duration_ms else {
            respond(responder, Err(PlaybackServiceError::DurationUnavailable));
            return;
        };
        let target_ms = requested_position_ms.min(duration_ms);
        if target_ms == duration_ms {
            let paused = loaded.paused;
            self.advance_after_track(responder, paused);
            return;
        }
        let source = loaded.source.clone();
        let extension = loaded.item.file.extension.clone();
        let config = loaded.pipeline.config.clone();
        match self.open_seek_pipeline(&source, &extension, &config, target_ms, duration_ms) {
            Ok(mut seek) => {
                seek.responder = responder;
                if let Transport::Loaded(loaded) = &mut self.transport {
                    loaded.seek = Some(seek);
                }
            }
            Err(error) => respond(responder, Err(error)),
        }
    }

    fn open_seek_pipeline(
        &mut self,
        source: &CompressedAudioSource,
        extension: &str,
        config: &crate::audio::output::PreparedOutputConfig,
        target_ms: u64,
        duration_ms: u64,
    ) -> Result<SeekInFlight, PlaybackServiceError> {
        let source_spec = config.processing_plan.source();
        let target_source_frame = millis_to_frame(target_ms, source_spec.sample_rate().get());
        let processor = OutputPcmProcessor::new(config.processing_plan).map_err(|_| {
            PlaybackServiceError::Output(PlaybackFailureCode::SampleRateConversionFailed)
        })?;
        let preroll_frames = processor.seek_preroll_frames(target_source_frame);
        let mut decoder = source
            .open_decoder(extension)
            .map_err(|_| PlaybackServiceError::Decode)?;
        if decoder.spec() != source_spec {
            return Err(PlaybackServiceError::Decode);
        }
        let seek = match decoder.seek_to_frame_with_preroll(target_source_frame, preroll_frames) {
            Ok(SeekStep::Samples(seek)) => seek,
            Ok(SeekStep::EndOfStream) => return Err(PlaybackServiceError::Decode),
            Err(PcmDecodeError::SeekFailed) => return Err(PlaybackServiceError::Seek),
            Err(_) => return Err(PlaybackServiceError::Decode),
        };
        if seek.first_packet.is_empty() {
            return Err(PlaybackServiceError::Decode);
        }

        let stream_id = self.next_stream_id();
        let prepared = self
            .backend
            .prepare(
                OutputTarget::Config(config.clone()),
                self.output_links(stream_id),
            )
            .map_err(|error| PlaybackServiceError::Output(output_failure_code(error)))?;
        let sample_rate = prepared.config.processing_plan.output().sample_rate().get();
        let discard_output_frames = source_to_output_frame(
            seek.confirmed_source_frame
                .saturating_sub(seek.preroll_source_frame),
            sample_rate,
            source_spec.sample_rate().get(),
        ) as usize;
        let discard_output_samples = discard_output_frames.saturating_mul(usize::from(
            config.processing_plan.output().channel_count().get(),
        ));
        let decode = DecodeWorker::spawn(
            DecodeTaskInput {
                decoder,
                first_packet: seek.first_packet,
                producer: prepared.producer,
                processor,
                output_sample_rate: sample_rate,
                discard_output_samples,
            },
            self.inbox.clone(),
            stream_id,
        );
        let output_base_frame = source_to_output_frame(
            seek.confirmed_source_frame,
            sample_rate,
            source_spec.sample_rate().get(),
        );
        let total_output_frames = duration_to_frames(duration_ms, sample_rate);
        Ok(SeekInFlight {
            pipeline: Pipeline {
                stream_id,
                stream: prepared.stream,
                config: prepared.config,
                decode,
            },
            output_base_frame: output_base_frame.min(total_output_frames),
            remaining_frames: total_output_frames.saturating_sub(output_base_frame),
            duration_ms,
            responder: None,
        })
    }

    /// The seek's prebuffer is ready: switch the output over to it.
    fn finish_seek(&mut self) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        let Some(seek) = loaded.seek.take() else {
            return;
        };
        let was_playing = !loaded.paused;
        if was_playing {
            if let Err(error) = loaded.pipeline.stream.pause() {
                seek.pipeline.cancel();
                let failure = self.control_failure(error);
                respond(seek.responder, Err(failure));
                return;
            }
            if let Err(error) = seek.pipeline.stream.start() {
                seek.pipeline.cancel();
                let rollback_failed = loaded.pipeline.stream.start().is_err();
                if !rollback_failed {
                    loaded.pipeline.stream.clear_timing_anchor();
                }
                let id = loaded.id;
                if rollback_failed {
                    self.drop_loaded(PlaybackServiceError::Superseded);
                    self.transport = Transport::Failed {
                        id: Some(id),
                        code: PlaybackFailureCode::OutputStreamResumeFailed,
                    };
                    self.publish_state();
                }
                respond(
                    seek.responder,
                    Err(PlaybackServiceError::Output(output_failure_code(error))),
                );
                return;
            }
        }
        let old = std::mem::replace(&mut loaded.pipeline, seek.pipeline);
        old.cancel();
        loaded.position.sample_rate = loaded.pipeline.sample_rate();
        loaded.position.duration_ms = Some(seek.duration_ms);
        loaded.position.frame = seek.output_base_frame;
        loaded.position.base_frame = seek.output_base_frame;
        loaded.position.remaining_frames = Some(seek.remaining_frames);
        loaded.position.last_publish = Instant::now();
        loaded.completion_time = None;
        self.seek_revision = self.seek_revision.saturating_add(1);
        let snapshot = self.publish_state();
        respond(seek.responder, Ok(snapshot));
    }

    fn cancel_seek(&mut self, error: PlaybackServiceError) {
        if let Transport::Loaded(loaded) = &mut self.transport {
            if let Some(seek) = loaded.seek.take() {
                seek.pipeline.cancel();
                respond(seek.responder, Err(error));
            }
        }
    }

    // ---- transport commands ----

    /// Lets go of whatever is loading or loaded, answering whoever waits for it.
    fn discard_transport(&mut self) {
        match std::mem::replace(&mut self.transport, Transport::Idle) {
            Transport::Idle | Transport::Failed { .. } => {}
            Transport::Loading(loading) => {
                match loading.stage {
                    LoadStage::Source(load) => load.cancel_and_join(),
                    LoadStage::Prebuffering(prebuffering) => prebuffering.pipeline.cancel(),
                }
                respond(
                    loading.request.responder,
                    Err(PlaybackServiceError::Superseded),
                );
            }
            Transport::Loaded(mut loaded) => {
                if let Some(seek) = loaded.seek.take() {
                    seek.pipeline.cancel();
                    respond(seek.responder, Err(PlaybackServiceError::Superseded));
                }
                loaded.pipeline.cancel();
            }
        }
    }

    /// Lets go of the loaded track and returns its identity. A seek in flight is answered with
    /// `seek_error`.
    fn drop_loaded(&mut self, seek_error: PlaybackServiceError) -> Option<PlaybackId> {
        let Transport::Loaded(mut loaded) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return None;
        };
        if let Some(seek) = loaded.seek.take() {
            seek.pipeline.cancel();
            respond(seek.responder, Err(seek_error));
        }
        let id = loaded.id;
        loaded.pipeline.cancel();
        Some(id)
    }

    fn stop(&mut self) -> PlaybackSnapshot {
        let was_visible = matches!(
            self.transport,
            Transport::Loaded(_) | Transport::Failed { .. }
        );
        self.discard_transport();
        self.queue.clear();
        self.publish_queue();
        if was_visible {
            return self.publish_state();
        }
        self.render()
    }

    fn pause(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if let Transport::Loading(loading) = &mut self.transport {
            loading.request.start_paused = true;
            return Ok(self.render());
        }
        let Transport::Loaded(loaded) = &mut self.transport else {
            return Err(PlaybackServiceError::InvalidPlaybackState);
        };
        if loaded.paused {
            return Ok(self.render());
        }
        if let Err(error) = loaded.pipeline.stream.pause() {
            return Err(self.control_failure(error));
        }
        let position = loaded.sample_position();
        loaded.pipeline.stream.clear_timing_anchor();
        loaded.position.frame = position;
        loaded.paused = true;
        Ok(self.publish_state())
    }

    fn resume(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if let Transport::Loading(loading) = &mut self.transport {
            loading.request.start_paused = false;
            return Ok(self.render());
        }
        let Transport::Loaded(loaded) = &mut self.transport else {
            return Err(PlaybackServiceError::InvalidPlaybackState);
        };
        if !loaded.paused {
            return Ok(self.render());
        }
        if let Err(error) = loaded.pipeline.stream.start() {
            let error = match error {
                AudioOutputError::StreamStartFailed => AudioOutputError::StreamResumeFailed,
                other => other,
            };
            return Err(self.control_failure(error));
        }
        loaded.paused = false;
        Ok(self.publish_state())
    }

    fn control_failure(&mut self, error: AudioOutputError) -> PlaybackServiceError {
        let id = self.drop_loaded(PlaybackServiceError::Superseded);
        let code = output_failure_code(error);
        self.transport = Transport::Failed {
            id,
            code: code.clone(),
        };
        self.publish_state();
        PlaybackServiceError::Output(code)
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device
    /// at the same position and keeps its paused state and queue.
    fn change_output_selection(
        &mut self,
        selection: AudioOutputSelection,
        reply: Reply<PlaybackSnapshot>,
    ) {
        let Transport::Loaded(loaded) = &self.transport else {
            let _ = reply.send(self.set_output_selection(selection));
            return;
        };
        if loaded.seek.is_some() {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        if selection == self.output_selection {
            let _ = reply.send(Ok(self.render()));
            return;
        }
        if let Err(error) = self.backend.resolve(&selection) {
            let _ = reply.send(Err(resolution_error(error)));
            return;
        }
        let request = StartRequest {
            item: loaded.item.clone(),
            responder: Some(reply),
            start_paused: loaded.paused,
            resume_at_ms: Some(loaded.position_ms()),
            selection: Some(selection),
        };
        self.begin_start(request);
    }

    fn set_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if matches!(self.transport, Transport::Loading(_)) {
            return Err(PlaybackServiceError::InvalidPlaybackState);
        }
        if let AudioOutputSelection::Device { .. } = &selection {
            self.backend.resolve(&selection).map_err(resolution_error)?;
        }
        let unchanged = self.output_selection == selection;
        self.output_selection = selection;
        if !unchanged {
            self.preferences_changed();
        }
        if matches!(self.transport, Transport::Failed { .. }) {
            self.transport = Transport::Idle;
            return Ok(self.publish_state());
        }
        if unchanged {
            return Ok(self.render());
        }
        Ok(self.publish_state())
    }

    fn set_volume(&mut self, volume: f32) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        let changed = self
            .volume_state
            .set_volume(volume)
            .ok_or(PlaybackServiceError::InvalidVolume)?;
        Ok(self.volume_changed(changed))
    }

    fn mute(&mut self) -> PlaybackSnapshot {
        let changed = self.volume_state.mute();
        self.volume_changed(changed)
    }

    fn unmute(&mut self) -> PlaybackSnapshot {
        let changed = self.volume_state.unmute();
        self.volume_changed(changed)
    }

    fn volume_changed(&mut self, changed: bool) -> PlaybackSnapshot {
        if !changed {
            return self.render();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        self.preferences_changed();
        self.publish_state()
    }

    fn preferences(&self) -> PlaybackPreferences {
        PlaybackPreferences {
            volume: self.volume_state.volume(),
            muted: self.volume_state.muted(),
            output_selection: self.output_selection.clone(),
            repeat_mode: self.queue.repeat(),
            shuffle_enabled: self.queue.shuffle(),
        }
    }

    fn preferences_changed(&self) {
        (self.observer)(self.preferences());
    }

    // ---- failures and the end of the track ----

    /// A decode thread stopped on its own: the file (or its conversion) cannot be played.
    fn decode_stopped(&mut self, stream: OutputStreamId, code: PlaybackFailureCode) {
        let failure_error = match code {
            PlaybackFailureCode::DecodeFailed => PlaybackServiceError::Decode,
            _ => PlaybackServiceError::Output(code.clone()),
        };
        match self.owner_of(stream) {
            StreamOwner::Start => {
                let Transport::Loading(loading) =
                    std::mem::replace(&mut self.transport, Transport::Idle)
                else {
                    return;
                };
                if let LoadStage::Prebuffering(prebuffering) = loading.stage {
                    prebuffering.pipeline.cancel();
                }
                let phase = if code == PlaybackFailureCode::DecodeFailed {
                    StartFailurePhase::PrebufferDecode
                } else {
                    StartFailurePhase::PrebufferConversion
                };
                self.fail_start(
                    loading.request,
                    Some(loading.id),
                    StartFailure {
                        code,
                        phase,
                        error: failure_error,
                    },
                );
            }
            StreamOwner::Active => self.fail_active(code, FailureScope::Item, failure_error),
            StreamOwner::Seek => {
                if let Transport::Loaded(loaded) = &mut self.transport {
                    if let Some(seek) = loaded.seek.take() {
                        seek.pipeline.cancel();
                        respond(seek.responder, Err(failure_error));
                    }
                }
            }
            StreamOwner::Gone => {}
        }
    }

    fn stream_failed(&mut self, stream: OutputStreamId, kind: StreamFailureKind) {
        if self.owner_of(stream) != StreamOwner::Active {
            return;
        }
        match stream_signal_action(&self.output_selection, kind) {
            StreamSignalAction::RefreshDefaultDevice => {
                info!("playback.stream_interrupted stream_id={}", stream.0);
                self.cancel_seek(PlaybackServiceError::Output(
                    PlaybackFailureCode::OutputDeviceUnavailable,
                ));
                if self.refresh_default_device() {
                    info!("playback.output_recovered stream_id={}", stream.0);
                } else {
                    self.fail_output(PlaybackFailureCode::OutputDeviceUnavailable);
                }
            }
            StreamSignalAction::PreservePlayback => {}
            StreamSignalAction::Fail(code) => {
                error!(
                    "playback.stream_failed stream_id={} code={:?}",
                    stream.0, code
                );
                self.fail_output(code);
            }
        }
    }

    fn fail_output(&mut self, code: PlaybackFailureCode) {
        self.fail_active(
            code.clone(),
            FailureScope::Output,
            PlaybackServiceError::Output(code),
        );
    }

    /// Fails the loaded track. An `Item` failure moves on to the next one; an `Output` failure
    /// stops with the queue intact so the listener can retry after fixing the device.
    fn fail_active(
        &mut self,
        code: PlaybackFailureCode,
        scope: FailureScope,
        seek_error: PlaybackServiceError,
    ) {
        let id = self.drop_loaded(seek_error);
        self.transport = Transport::Failed { id, code };
        self.publish_state();
        if scope == FailureScope::Item {
            if let Some(item) = self.next_after_item_failure() {
                self.begin_start(StartRequest {
                    item,
                    responder: None,
                    start_paused: false,
                    resume_at_ms: None,
                    selection: None,
                });
            }
        }
    }

    fn refresh_default_device(&mut self) -> bool {
        let Ok(identity) = self.backend.resolve(&AudioOutputSelection::SystemDefault) else {
            return false;
        };
        let Transport::Loaded(loaded) = &mut self.transport else {
            return false;
        };
        loaded.pipeline.config.device_id = identity.id;
        loaded.pipeline.config.device_name = identity.name;
        self.publish_state();
        true
    }

    pub(super) fn tick(&mut self) {
        self.last_tick = Instant::now();
        self.finish_if_due();
        self.update_position();
    }

    fn finish_if_due(&mut self) {
        let is_due = matches!(
            &self.transport,
            Transport::Loaded(loaded) if !loaded.paused
                && loaded
                    .completion_time
                    .is_some_and(|end| loaded.pipeline.stream.now() >= end)
        );
        if !is_due {
            return;
        }
        self.advance_after_track(None, false);
    }

    /// The track is over, because it played out or a seek went past its end: play the next one
    /// or stop.
    fn advance_after_track(
        &mut self,
        responder: Option<Reply<PlaybackSnapshot>>,
        start_paused: bool,
    ) {
        match self
            .queue
            .advance(AdvanceReason::Natural, &mut self.rng)
            .cloned()
        {
            Some(item) => {
                self.skipped_in_a_row = 0;
                self.publish_queue();
                self.begin_start(StartRequest {
                    item,
                    responder,
                    start_paused,
                    resume_at_ms: None,
                    selection: None,
                });
            }
            None => {
                self.discard_transport();
                self.queue.clear();
                self.publish_queue();
                let snapshot = self.publish_state();
                respond(responder, Ok(snapshot));
            }
        }
    }

    fn update_position(&mut self) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        if loaded.paused {
            return;
        }
        let frame = loaded.sample_position();
        if !should_publish_position(
            loaded.position.last_publish.elapsed(),
            frame != loaded.position.frame,
        ) {
            return;
        }
        loaded.position.frame = frame;
        loaded.position.last_publish = Instant::now();
        self.publish_state();
    }

    pub(super) fn shutdown(&mut self) {
        self.discard_transport();
        self.publish_state();
    }

    // ---- publishing ----

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

    /// What listeners see, drawn from the transport, the queue and the volume.
    fn render(&self) -> PlaybackSnapshot {
        let mut base = SnapshotBase::new(self.volume_state, self.output_selection.clone());
        base.revision = self.revision;
        match &self.transport {
            Transport::Idle | Transport::Loading(_) => PlaybackSnapshot::Stopped {
                base,
                item: self.last_item.clone(),
            },
            Transport::Loaded(loaded) => {
                base.can_go_previous = self.queue.can_go_previous()
                    || previous_restarts_track(loaded.position_ms(), loaded.position.duration_ms);
                base.can_go_next = self.queue.can_go_next();
                let session = self.render_session(loaded);
                if loaded.paused {
                    PlaybackSnapshot::Paused { base, session }
                } else {
                    PlaybackSnapshot::Playing { base, session }
                }
            }
            Transport::Failed { id, code } => {
                base.can_go_previous = self.queue.can_go_previous();
                base.can_go_next = self.queue.can_go_next();
                PlaybackSnapshot::Failed {
                    base,
                    item: self
                        .queue
                        .current()
                        .cloned()
                        .or_else(|| self.last_item.clone()),
                    playback_id: id.map(|id| id.to_string()),
                    error: code.clone(),
                }
            }
        }
    }

    fn render_session(&self, loaded: &Loaded) -> ActiveSession {
        let config = &loaded.pipeline.config;
        let processing = PlaybackProcessingInfo::from_plan(config.processing_plan);
        ActiveSession {
            item: loaded.item.clone(),
            playback_id: loaded.id.to_string(),
            position_ms: loaded.position_ms(),
            seek_revision: self.seek_revision,
            duration_ms: loaded.position.duration_ms,
            output_device: AudioOutputDeviceIdentity {
                id: config.device_id.clone(),
                name: config.device_name.clone(),
            },
            channel_conversion: processing.channel_conversion,
            source_sample_rate: processing.source_sample_rate,
            output_sample_rate: processing.output_sample_rate,
            resampling_active: processing.resampling_active(),
        }
    }

    /// Renders the transport as a new revision and tells listeners.
    fn publish_state(&mut self) -> PlaybackSnapshot {
        self.revision = self.revision.saturating_add(1);
        let snapshot = self.render();
        *self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        self.events.emit(BackendEvent::PlaybackChanged);
        snapshot
    }

    fn publish_queue(&mut self) -> PlaybackQueueSnapshot {
        self.next_queue_revision = self.next_queue_revision.saturating_add(1);
        let snapshot = PlaybackQueueSnapshot::of(self.next_queue_revision, &self.queue);
        *self
            .queue_snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        self.events.emit(BackendEvent::PlaybackQueueChanged);
        snapshot
    }

    fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
        self.queue_snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Publishes a queue change, and refreshes the transport so previous/next availability
    /// follows it even while paused.
    fn queue_changed(&mut self, changed: bool) -> PlaybackQueueSnapshot {
        if !changed {
            return self.queue_snapshot();
        }
        let snapshot = self.publish_queue();
        self.publish_state();
        snapshot
    }

    fn edit_queue(
        &mut self,
        edit: impl FnOnce(&mut PlaybackQueue) -> Result<bool, QueueError>,
    ) -> Result<bool, PlaybackServiceError> {
        if matches!(self.transport, Transport::Loading(_)) {
            return Err(PlaybackServiceError::QueueBusy);
        }
        edit(&mut self.queue).map_err(|_| PlaybackServiceError::QueueItemNotFound)
    }
}

/// Whether "previous" should restart the current track rather than leave it.
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
