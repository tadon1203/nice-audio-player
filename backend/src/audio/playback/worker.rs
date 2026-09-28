//! The playback worker thread: owns the queue, the loaded track, and every in-flight operation.

use std::sync::{
    mpsc::{self, Receiver, SyncSender},
    Arc, RwLock,
};
use std::time::Instant;

use super::decode_worker::{DecodeTaskInput, DecodeWorkerSetup};
use super::item::{PlaybackItem, PlaybackItemSeed};
use super::preferences::{PlaybackPreferences, PreferencesObserver};
use super::queue::{AdvanceReason, PlaybackQueue, QueueError};
use super::service::{PlaybackCommand, PlaybackServiceError, Reply};
use super::session::{
    absolute_position, duration_to_frames, frame_to_millis, millis_to_frame,
    should_publish_position, source_to_output_frame, ActivePlayback, PendingPlayback, PendingSeek,
    PendingSourceLoad,
};
use super::snapshot::{
    ActiveSession, PlaybackFailureCode, PlaybackProcessingInfo, PlaybackQueueSnapshot,
    PlaybackSnapshot, SnapshotBase,
};
use super::source_loader::SourceLoadWorker;
use crate::audio::compressed_source::{CompressedAudioSource, CompressedSourceError};
use crate::audio::decoding::{DecodeStep, PcmDecodeError, SeekStep};
use crate::audio::devices::{
    resolve_output_device_id, resolve_output_selection, AudioOutputDeviceIdentity,
    AudioOutputSelection, DeviceResolutionError,
};
use crate::audio::output::{
    prepare_output_stream, prepare_output_stream_with_config, AudioOutputError, OutputSignal,
    OutputStreamId, ProducerState,
};
use crate::audio::output_processing::OutputPcmProcessor;
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::events::{BackendEvent, SharedEventSink};
use cpal::StreamInstant;
use log::{error, info};
use rand::{rngs::StdRng, SeedableRng};

const WORKER_TICK_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);

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
    OutputDeviceResolution,
    OutputPrepare,
    ProcessorCreate,
    DecodeWorkerSpawn,
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
            Self::SourceWorker
            | Self::OutputDeviceResolution
            | Self::OutputPrepare
            | Self::DecodeWorkerSpawn
            | Self::StreamStart => FailureScope::Output,
        }
    }
}

/// The channels and shared state the service hands to the worker thread.
pub(super) struct WorkerLinks {
    pub snapshot: Arc<RwLock<PlaybackSnapshot>>,
    pub queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
    pub effective_gain: AtomicEffectiveGain,
    pub command_receiver: Receiver<PlaybackCommand>,
    pub output_sender: SyncSender<OutputSignal>,
    pub events: SharedEventSink,
    pub observer: PreferencesObserver,
}

pub(super) struct PlaybackWorker {
    pub active: Option<ActivePlayback>,
    pub pending: Option<PendingPlayback>,
    pub pending_source: Option<PendingSourceLoad>,
    pub pending_seek: Option<PendingSeek>,
    next_playback_session_id: u64,
    next_output_stream_id: u64,
    next_snapshot_revision: u64,
    next_queue_revision: u64,
    /// The last track that reached the output, kept so a stopped player can still name it.
    pub loaded_item: Option<PlaybackItem>,
    pub queue: PlaybackQueue,
    rng: StdRng,
    /// Files skipped in a row after failing; bounds the skipping to one pass over the queue.
    skipped_in_a_row: usize,
    /// Position to seek to once a device-switch restart has started playing.
    restore_position_ms: Option<u64>,
    pub volume_state: VolumeState,
    pub effective_gain: AtomicEffectiveGain,
    pub output_selection: AudioOutputSelection,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
    command_receiver: Receiver<PlaybackCommand>,
    output_sender: SyncSender<OutputSignal>,
    events: SharedEventSink,
    observer: PreferencesObserver,
}

impl PlaybackWorker {
    pub(super) fn new(
        links: WorkerLinks,
        queue: PlaybackQueue,
        volume_state: VolumeState,
        output_selection: AudioOutputSelection,
    ) -> Self {
        Self {
            active: None,
            pending: None,
            pending_source: None,
            pending_seek: None,
            next_playback_session_id: 0,
            next_output_stream_id: 0,
            next_snapshot_revision: 0,
            next_queue_revision: 0,
            loaded_item: None,
            queue,
            rng: StdRng::from_rng(&mut rand::rng()),
            skipped_in_a_row: 0,
            restore_position_ms: None,
            volume_state,
            effective_gain: links.effective_gain,
            output_selection,
            snapshot: links.snapshot,
            queue_snapshot: links.queue_snapshot,
            command_receiver: links.command_receiver,
            output_sender: links.output_sender,
            events: links.events,
            observer: links.observer,
        }
    }

    pub(super) fn run(mut self) {
        loop {
            match self.command_receiver.recv_timeout(WORKER_TICK_INTERVAL) {
                Ok(PlaybackCommand::Start {
                    items,
                    start_index,
                    reply,
                }) => self.start_queue(items, start_index, reply),
                Ok(PlaybackCommand::Previous { reply }) => {
                    self.navigate(AdvanceReason::UserPrevious, reply);
                }
                Ok(PlaybackCommand::Next { reply }) => {
                    self.navigate(AdvanceReason::UserNext, reply);
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
                    self.change_output_selection(selection, reply);
                }
                Ok(PlaybackCommand::SetRepeatMode { mode, reply }) => {
                    let changed = self.queue.set_repeat(mode);
                    if changed {
                        self.preferences_changed();
                    }
                    let _ = reply.send(Ok(self.queue_changed(changed)));
                }
                Ok(PlaybackCommand::SetShuffle { enabled, reply }) => {
                    let changed = self.queue.set_shuffle(enabled, &mut self.rng);
                    if changed {
                        self.preferences_changed();
                    }
                    let _ = reply.send(Ok(self.queue_changed(changed)));
                }
                Ok(PlaybackCommand::RemoveQueueItem { id, reply }) => {
                    let result = self.edit_queue(|queue| queue.remove_upcoming(&id).map(|()| true));
                    let _ = reply.send(result.map(|changed| self.queue_changed(changed)));
                }
                Ok(PlaybackCommand::MoveQueueItem {
                    id,
                    direction,
                    reply,
                }) => {
                    let result = self.edit_queue(|queue| queue.move_upcoming(&id, direction));
                    let _ = reply.send(result.map(|changed| self.queue_changed(changed)));
                }
                Ok(PlaybackCommand::ClearQueue { reply }) => {
                    let changed = self.queue.clear_upcoming();
                    let _ = reply.send(Ok(self.queue_changed(changed)));
                }
                Ok(PlaybackCommand::Output(signal)) => self.handle_signal(signal),
                Ok(PlaybackCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            self.advance_pending_source_load();
            self.advance_pending_playback();
            self.advance_pending_seek();
            self.finish_if_due();
            self.update_playback_position();
        }
        self.discard_pending();
        self.discard_pending_source();
        self.discard_pending_seek();
        self.discard_active();
        self.publish(self.stopped_snapshot());
    }

    /// Replaces the queue and starts its `start_index` item.
    pub(super) fn start_queue(
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
        self.start_current(reply, false);
    }

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    fn start_current(&mut self, reply: Reply<PlaybackSnapshot>, start_paused: bool) {
        let Some(item) = self.queue.current().cloned() else {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        self.publish_queue();
        self.begin_start(item, reply, start_paused);
    }

    fn begin_start(
        &mut self,
        item: PlaybackItem,
        reply: Reply<PlaybackSnapshot>,
        start_paused: bool,
    ) {
        self.restore_position_ms = None;
        self.discard_pending();
        self.discard_pending_source();
        self.discard_pending_seek();
        self.discard_active();
        if !matches!(self.current(), PlaybackSnapshot::Stopped { .. }) {
            self.publish(self.stopped_snapshot());
        }
        let worker = match SourceLoadWorker::spawn(item.file.clone()) {
            Ok(worker) => worker,
            Err(()) => {
                self.fail_start(
                    reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    StartFailurePhase::SourceWorker,
                    PlaybackServiceError::WorkerUnavailable,
                );
                return;
            }
        };
        self.pending_source = Some(PendingSourceLoad {
            item,
            worker,
            reply,
            start_paused,
        });
    }

    pub(super) fn advance_pending_source_load(&mut self) {
        let Some(pending) = self.pending_source.as_mut() else {
            return;
        };
        let completion = match pending.worker.try_complete() {
            Ok(completion) => completion,
            Err(()) => {
                let pending = self.pending_source.take().expect("pending source exists");
                self.fail_start(
                    pending.reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    StartFailurePhase::SourceWorker,
                    PlaybackServiceError::WorkerUnavailable,
                );
                return;
            }
        };
        let Some(result) = completion else {
            return;
        };
        let pending = self.pending_source.take().expect("pending source exists");
        let source = match result {
            Ok(source) => source,
            Err(CompressedSourceError::Cancelled) => {
                let _ = pending.reply.send(Err(PlaybackServiceError::Superseded));
                return;
            }
            Err(error) => {
                let phase = match error {
                    CompressedSourceError::OpenFailed => StartFailurePhase::SourceOpen,
                    CompressedSourceError::MetadataFailed => StartFailurePhase::SourceMetadata,
                    CompressedSourceError::ReadFailed => StartFailurePhase::SourceRead,
                    CompressedSourceError::SourceChanged => StartFailurePhase::SourceChanged,
                    CompressedSourceError::Cancelled => unreachable!(),
                };
                self.fail_start(
                    pending.reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    phase,
                    PlaybackServiceError::Decode,
                );
                return;
            }
        };
        self.begin_playback_from_source(pending.item, source, pending.reply, pending.start_paused);
    }

    fn begin_playback_from_source(
        &mut self,
        item: PlaybackItem,
        source: CompressedAudioSource,
        reply: Reply<PlaybackSnapshot>,
        start_paused: bool,
    ) {
        let mut decoder = match source.open_decoder(&item.file.extension) {
            Ok(decoder) => decoder,
            Err(_) => {
                self.fail_start(
                    reply,
                    None,
                    PlaybackFailureCode::DecodeFailed,
                    StartFailurePhase::DecoderOpen,
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
                    StartFailurePhase::FirstPacketDecode,
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
                    StartFailurePhase::OutputDeviceResolution,
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
                    StartFailurePhase::OutputPrepare,
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
                        StartFailurePhase::ProcessorCreate,
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
                    StartFailurePhase::DecodeWorkerSpawn,
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
            item,
            source,
            output_config: preparation.config.clone(),
            id,
            stream,
            decode_pipeline,
            sample_rate,
            duration_ms,
            reply,
            start_paused,
        });
    }

    /// Reports a failed start and, when only this file is at fault, moves on to the next one.
    /// Listeners see the failure first, so a skipped file is never silent.
    fn fail_start(
        &mut self,
        reply: Reply<PlaybackSnapshot>,
        playback_id: Option<String>,
        code: PlaybackFailureCode,
        phase: StartFailurePhase,
        error: PlaybackServiceError,
    ) {
        error!(
            "playback.start_failed code={:?} phase={:?} playback_id={:?}",
            code, phase, playback_id
        );
        self.publish(self.failed_snapshot(playback_id, code));
        if phase.scope() == FailureScope::Item {
            if let Some(item) = self.next_after_item_failure() {
                self.begin_start(item, reply, false);
                return;
            }
        }
        let _ = reply.send(Err(error));
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

    pub(super) fn navigate(&mut self, reason: AdvanceReason, reply: Reply<PlaybackSnapshot>) {
        let current = self.current();
        if reason == AdvanceReason::UserPrevious {
            if let Some(session) = current.session() {
                if previous_restarts_track(session.position_ms, session.duration_ms) {
                    self.begin_seek(0, reply);
                    return;
                }
            }
        }
        let paused = matches!(current, PlaybackSnapshot::Paused { .. });
        self.skipped_in_a_row = 0;
        if self.queue.advance(reason, &mut self.rng).is_none() {
            let _ = reply.send(Ok(current));
            return;
        }
        self.start_current(reply, paused);
    }

    fn begin_seek(&mut self, requested_position_ms: u64, reply: Reply<PlaybackSnapshot>) {
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
        let source_file = active.item.file.clone();
        let source = active.source.clone();
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
        let mut decoder = match source.open_decoder(&source_file.extension) {
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
            item: old.item,
            source: old.source,
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
        self.cancel_pending_seek_with(PlaybackServiceError::Superseded);
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
                StartFailurePhase::PrebufferDecode,
                PlaybackServiceError::Decode,
            );
            return;
        }
        if state == ProducerState::SampleRateConversionFailed {
            let code = PlaybackFailureCode::SampleRateConversionFailed;
            self.fail_pending_start(
                pending,
                code.clone(),
                StartFailurePhase::PrebufferConversion,
                PlaybackServiceError::Output(code),
            );
            return;
        }
        if !pending.start_paused {
            if let Err(error) = pending.stream.start() {
                let code = output_failure_code(error);
                self.fail_pending_start(
                    pending,
                    code.clone(),
                    StartFailurePhase::StreamStart,
                    PlaybackServiceError::Output(code),
                );
                return;
            }
        }
        let (active, reply, start_paused) = pending.into_active();
        let session_id = active.session_id;
        let duration_ms = active.duration_ms;
        self.loaded_item = Some(active.item.clone());
        self.active = Some(active);
        self.skipped_in_a_row = 0;
        let snapshot = if start_paused {
            self.publish(self.paused_snapshot(session_id.to_string(), 0, duration_ms))
        } else {
            self.publish(self.playing_snapshot(session_id.to_string(), 0, duration_ms))
        };
        let _ = reply.send(Ok(snapshot));
        if let Some(position_ms) = self.restore_position_ms.take() {
            let (restore_reply, _) = mpsc::sync_channel(1);
            self.begin_seek(position_ms, restore_reply);
        }
    }

    fn fail_pending_start(
        &mut self,
        pending: PendingPlayback,
        code: PlaybackFailureCode,
        phase: StartFailurePhase,
        error: PlaybackServiceError,
    ) {
        let playback_id = Some(pending.id.0.to_string());
        pending.decode_pipeline.cancel_and_join();
        self.fail_start(pending.reply, playback_id, code, phase, error);
    }

    pub(super) fn discard_pending(&mut self) {
        if let Some(pending) = self.pending.take() {
            pending.decode_pipeline.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Superseded));
        }
    }

    pub(super) fn discard_pending_source(&mut self) {
        if let Some(pending) = self.pending_source.take() {
            pending.worker.cancel_and_join();
            let _ = pending.reply.send(Err(PlaybackServiceError::Superseded));
        }
    }

    pub(super) fn stop(&mut self) -> PlaybackSnapshot {
        self.restore_position_ms = None;
        self.discard_pending();
        self.discard_pending_source();
        self.discard_pending_seek();
        self.discard_active();
        self.queue.clear();
        self.publish_queue();
        if matches!(self.current(), PlaybackSnapshot::Stopped { .. }) {
            return self.current();
        }
        self.publish(self.stopped_snapshot())
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device
    /// at the same position and keeps its paused state and queue.
    fn change_output_selection(
        &mut self,
        selection: AudioOutputSelection,
        reply: Reply<PlaybackSnapshot>,
    ) {
        let current = self.current();
        let (position_ms, paused) = match &current {
            PlaybackSnapshot::Playing { session, .. } => (session.position_ms, false),
            PlaybackSnapshot::Paused { session, .. } => (session.position_ms, true),
            _ => {
                let _ = reply.send(self.set_output_selection(selection));
                return;
            }
        };
        let (Some(item), None, None, None) = (
            self.active.as_ref().map(|active| active.item.clone()),
            &self.pending,
            &self.pending_source,
            &self.pending_seek,
        ) else {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        if selection == self.output_selection {
            let _ = reply.send(Ok(current));
            return;
        }
        if let Err(error) = resolve_output_selection(&selection) {
            let error = match error {
                DeviceResolutionError::InvalidDeviceId => PlaybackServiceError::InvalidDeviceId,
                DeviceResolutionError::DeviceUnavailable
                | DeviceResolutionError::NoDefaultOutputDevice => {
                    PlaybackServiceError::OutputDeviceUnavailable
                }
            };
            let _ = reply.send(Err(error));
            return;
        }
        self.output_selection = selection;
        self.preferences_changed();
        self.begin_start(item, reply, paused);
        self.restore_position_ms = Some(position_ms);
    }

    pub(super) fn set_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        if self.active.is_some()
            || self.pending.is_some()
            || self.pending_source.is_some()
            || self.pending_seek.is_some()
        {
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
        if !unchanged {
            self.preferences_changed();
        }
        if matches!(self.current(), PlaybackSnapshot::Failed { .. }) {
            let snapshot = self.stopped_snapshot();
            return Ok(self.publish(snapshot));
        }
        if unchanged {
            return Ok(self.current());
        }
        Ok(self.publish(self.stopped_snapshot()))
    }
    pub(super) fn set_volume(
        &mut self,
        volume: f32,
    ) -> Result<PlaybackSnapshot, PlaybackServiceError> {
        let changed = self
            .volume_state
            .set_volume(volume)
            .ok_or(PlaybackServiceError::InvalidVolume)?;
        if !changed {
            return Ok(self.current());
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        self.preferences_changed();
        let snapshot = self.current().with_volume(self.volume_state);
        Ok(self.publish(snapshot))
    }

    pub(super) fn mute(&mut self) -> PlaybackSnapshot {
        if !self.volume_state.mute() {
            return self.current();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        self.preferences_changed();
        let snapshot = self.current().with_volume(self.volume_state);
        self.publish(snapshot)
    }

    pub(super) fn unmute(&mut self) -> PlaybackSnapshot {
        if !self.volume_state.unmute() {
            return self.current();
        }
        self.effective_gain
            .store(self.volume_state.effective_gain());
        self.preferences_changed();
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

    pub(super) fn current(&self) -> PlaybackSnapshot {
        read_snapshot(&self.snapshot)
    }

    fn base(&self) -> SnapshotBase {
        SnapshotBase::new(self.volume_state, self.output_selection.clone())
    }

    fn stopped_snapshot(&self) -> PlaybackSnapshot {
        PlaybackSnapshot::Stopped {
            base: self.base(),
            item: self.loaded_item.clone(),
        }
    }

    fn active_session(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> ActiveSession {
        let active = self
            .active
            .as_ref()
            .expect("snapshot requires active playback");
        let processing = PlaybackProcessingInfo::from_plan(active.output_config.processing_plan);
        ActiveSession {
            item: active.item.clone(),
            playback_id,
            position_ms,
            duration_ms,
            output_device: AudioOutputDeviceIdentity {
                id: active.output_config.device_id.clone(),
                name: active.output_config.device_name.clone(),
            },
            channel_conversion: processing.channel_conversion,
            source_sample_rate: processing.source_sample_rate,
            output_sample_rate: processing.output_sample_rate,
            resampling_active: processing.resampling_active(),
        }
    }

    fn playing_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::Playing {
            base: self.base(),
            session: self.active_session(playback_id, position_ms, duration_ms),
        }
    }

    fn paused_snapshot(
        &self,
        playback_id: String,
        position_ms: u64,
        duration_ms: Option<u64>,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::Paused {
            base: self.base(),
            session: self.active_session(playback_id, position_ms, duration_ms),
        }
    }

    /// The failed item is the one the queue points at, else the last one that played.
    fn failed_snapshot(
        &self,
        playback_id: Option<String>,
        error: PlaybackFailureCode,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot::Failed {
            base: self.base(),
            item: self
                .queue
                .current()
                .cloned()
                .or_else(|| self.loaded_item.clone()),
            playback_id,
            error,
        }
    }

    fn discard_active(&mut self) {
        if let Some(active) = self.active.take() {
            active.decoder_worker.cancel_and_join();
        }
    }

    /// Navigation availability depends on the queue, so it is stamped on at publish time.
    fn navigation_for(&self, snapshot: &PlaybackSnapshot) -> (bool, bool) {
        match snapshot {
            PlaybackSnapshot::Playing { session, .. }
            | PlaybackSnapshot::Paused { session, .. } => (
                self.queue.can_go_previous()
                    || previous_restarts_track(session.position_ms, session.duration_ms),
                self.queue.can_go_next(),
            ),
            PlaybackSnapshot::Failed { .. } => {
                (self.queue.can_go_previous(), self.queue.can_go_next())
            }
            PlaybackSnapshot::Stopped { .. } => (false, false),
        }
    }

    pub(super) fn publish(&mut self, mut snapshot: PlaybackSnapshot) -> PlaybackSnapshot {
        let (previous, next) = self.navigation_for(&snapshot);
        self.next_snapshot_revision = self.next_snapshot_revision.saturating_add(1);
        let base = snapshot.base_mut();
        base.can_go_previous = previous;
        base.can_go_next = next;
        base.revision = self.next_snapshot_revision;
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

    pub(super) fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
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
        self.publish(self.current());
        snapshot
    }

    fn edit_queue(
        &mut self,
        edit: impl FnOnce(&mut PlaybackQueue) -> Result<bool, QueueError>,
    ) -> Result<bool, PlaybackServiceError> {
        if self.pending.is_some() || self.pending_source.is_some() {
            return Err(PlaybackServiceError::QueueBusy);
        }
        edit(&mut self.queue).map_err(|_| PlaybackServiceError::QueueItemNotFound)
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

    /// Fails the loaded track. An `Item` failure moves on to the next one; an `Output` failure
    /// stops with the queue intact so the listener can retry after fixing the device.
    fn fail_active(
        &mut self,
        code: PlaybackFailureCode,
        scope: FailureScope,
        pending_seek_error: PlaybackServiceError,
    ) {
        let playback_id = self
            .active
            .as_ref()
            .map(|active| active.session_id.to_string());
        self.cancel_pending_seek_with(pending_seek_error);
        self.discard_active();
        self.publish(self.failed_snapshot(playback_id, code));
        if scope == FailureScope::Item {
            if let Some(item) = self.next_after_item_failure() {
                let (reply, _receiver) = mpsc::sync_channel(1);
                self.begin_start(item, reply, false);
            }
        }
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
                        info!("playback.stream_interrupted stream_id={}", id.0);
                        self.cancel_pending_seek_with(PlaybackServiceError::Output(
                            PlaybackFailureCode::OutputDeviceUnavailable,
                        ));
                        if self.refresh_default_device() {
                            info!("playback.output_recovered stream_id={}", id.0);
                        } else {
                            self.fail_output(PlaybackFailureCode::OutputDeviceUnavailable);
                        }
                    }
                    StreamSignalAction::PreservePlayback => {}
                    StreamSignalAction::Fail(error) => {
                        error!("playback.stream_failed stream_id={} code={:?}", id.0, error);
                        self.fail_output(error);
                    }
                }
            }
            OutputSignal::CompletionTimingFailed { .. } => {
                error!("playback.completion_timing_failed stream_id={}", id.0);
                self.fail_output(PlaybackFailureCode::CompletionTimingFailed);
            }
            OutputSignal::DecodeFailed { .. } => {
                error!("playback.decode_failed stream_id={}", id.0);
                self.fail_active(
                    PlaybackFailureCode::DecodeFailed,
                    FailureScope::Item,
                    PlaybackServiceError::Decode,
                );
            }
            OutputSignal::SampleRateConversionFailed { .. } => {
                error!("playback.sample_rate_conversion_failed stream_id={}", id.0);
                self.fail_active(
                    PlaybackFailureCode::SampleRateConversionFailed,
                    FailureScope::Item,
                    PlaybackServiceError::Output(PlaybackFailureCode::SampleRateConversionFailed),
                );
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

    fn finish_if_due(&mut self) {
        let is_due = self.active.as_ref().is_some_and(|active| {
            should_finish(&self.current(), active.completion_time, active.stream.now())
        });
        if !is_due {
            return;
        }
        self.discard_pending_seek();
        self.discard_active();
        match self
            .queue
            .advance(AdvanceReason::Natural, &mut self.rng)
            .cloned()
        {
            Some(item) => {
                self.skipped_in_a_row = 0;
                self.publish_queue();
                let (reply, _receiver) = mpsc::sync_channel(1);
                self.begin_start(item, reply, false);
            }
            None => {
                self.queue.clear();
                self.publish_queue();
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

/// Whether "previous" should restart the current track rather than leave it.
pub(super) fn previous_restarts_track(position_ms: u64, duration_ms: Option<u64>) -> bool {
    duration_ms.is_some() && position_ms >= PREVIOUS_RESTART_THRESHOLD_MS
}

pub(super) fn signal_stream_id(signal: &OutputSignal) -> OutputStreamId {
    match signal {
        OutputSignal::FinalFramesSubmitted { stream_id, .. }
        | OutputSignal::StreamFailed { stream_id, .. }
        | OutputSignal::CompletionTimingFailed { stream_id }
        | OutputSignal::DecodeFailed { stream_id }
        | OutputSignal::SampleRateConversionFailed { stream_id } => *stream_id,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum StreamSignalAction {
    RefreshDefaultDevice,
    PreservePlayback,
    Fail(PlaybackFailureCode),
}

pub(super) fn stream_signal_action(
    selection: &AudioOutputSelection,
    kind: crate::audio::output::StreamFailureKind,
) -> StreamSignalAction {
    match kind {
        crate::audio::output::StreamFailureKind::DeviceChanged => match selection {
            AudioOutputSelection::SystemDefault => StreamSignalAction::RefreshDefaultDevice,
            AudioOutputSelection::Device { .. } => StreamSignalAction::PreservePlayback,
        },
        crate::audio::output::StreamFailureKind::DeviceUnavailable => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
        }
        crate::audio::output::StreamFailureKind::RuntimeFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
        }
    }
}

pub(super) fn completion_time_reached(end: StreamInstant, now: StreamInstant) -> bool {
    now >= end
}

pub(super) fn should_finish(
    snapshot: &PlaybackSnapshot,
    completion_time: Option<StreamInstant>,
    now: StreamInstant,
) -> bool {
    matches!(snapshot, PlaybackSnapshot::Playing { .. })
        && completion_time.is_some_and(|end| completion_time_reached(end, now))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PlaybackControlAction {
    Change,
    Idempotent,
    Invalid,
}

pub(super) fn pause_action(snapshot: &PlaybackSnapshot) -> PlaybackControlAction {
    match snapshot {
        PlaybackSnapshot::Playing { .. } => PlaybackControlAction::Change,
        PlaybackSnapshot::Paused { .. } => PlaybackControlAction::Idempotent,
        PlaybackSnapshot::Stopped { .. } | PlaybackSnapshot::Failed { .. } => {
            PlaybackControlAction::Invalid
        }
    }
}

pub(super) fn resume_action(snapshot: &PlaybackSnapshot) -> PlaybackControlAction {
    match snapshot {
        PlaybackSnapshot::Paused { .. } => PlaybackControlAction::Change,
        PlaybackSnapshot::Playing { .. } => PlaybackControlAction::Idempotent,
        PlaybackSnapshot::Stopped { .. } | PlaybackSnapshot::Failed { .. } => {
            PlaybackControlAction::Invalid
        }
    }
}

pub(super) fn read_snapshot(snapshot: &RwLock<PlaybackSnapshot>) -> PlaybackSnapshot {
    snapshot
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone()
}

pub(super) fn output_failure_code(error: AudioOutputError) -> PlaybackFailureCode {
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

pub(super) fn device_resolution_failure_code(error: DeviceResolutionError) -> PlaybackFailureCode {
    match error {
        DeviceResolutionError::NoDefaultOutputDevice => PlaybackFailureCode::NoOutputDevice,
        DeviceResolutionError::InvalidDeviceId | DeviceResolutionError::DeviceUnavailable => {
            PlaybackFailureCode::OutputDeviceUnavailable
        }
    }
}
