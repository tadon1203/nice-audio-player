//! Starts, pauses, moves, fails and finishes playback.

use super::state::{Failed, Next, Seek, StartLoad, Starting, WorkerState};
use super::types::{FailureAction, StartRequest};
use super::{POSITION_UPDATE_INTERVAL, PlayerWorker, previous_restarts_track, queue_item};
use crate::ids::TrackId;
use crate::library::errors::LibraryError;
use crate::messages;
use crate::messages::BackendMessage;
use crate::player::errors::Result;
use crate::player::output::{
    AudioOutputSelection, OutputError, OutputStreamId, PipelineId, StreamFailureKind,
};
use crate::player::pipeline::{
    LoadPosition, PipelineError, PreparedSource, SourceLoad, SourceLoadId, start_decoding,
};
use crate::player::processing::PcmConverter;
use crate::player::queue::{AdvanceReason, QueueEntry};
use crate::player::state::{PlaybackFailureCode, StartedBy};
use crate::player::transport::{Output, Position, Track};
use cpal::StreamInstant;
use log::{error, info};
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq)]
enum StreamSignalAction {
    RefreshDefaultDevice,
    PreservePlayback,
    Fail(PlaybackFailureCode),
}

fn stream_signal_action(
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
        StreamFailureKind::RuntimeFailed | StreamFailureKind::CompletionTimingFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputFailed)
        }
    }
}

impl PlayerWorker {
    pub(super) fn tick(&mut self) {
        self.last_tick = Instant::now();
        self.finish_if_due();
        self.update_position();
        self.maybe_prefetch();
    }

    pub(super) fn play_queue(&mut self, track_ids: Vec<TrackId>, start_index: usize) -> Result<()> {
        self.replace_queue(track_ids, start_index);
        self.start_current(false, StartedBy::Jump)
    }

    /// Replaces the queue, keeping the old one for one-step undo. Nothing is kept when nothing
    /// was queued, so an Undo never resurrects something older than what was just replaced.
    pub(super) fn replace_queue(&mut self, track_ids: Vec<TrackId>, start_index: usize) {
        let before = self.queue.clone();
        self.queue.replace(track_ids, start_index, &mut self.rng);
        self.previous_queue = (!before.is_empty()).then_some(before);
    }

    /// Puts back the queue the last replacement or Clear upcoming took away. When the same item
    /// is still current, it keeps playing; otherwise the restored current item starts.
    pub(super) fn restore_previous_queue(&mut self) -> Result<()> {
        let Some(previous) = self.previous_queue.take() else {
            return Ok(());
        };
        let same_current = matches!(
            (self.queue.current(), previous.current()),
            (Some(now), Some(then)) if now.id == then.id
        ) && self.current().is_some();
        self.queue.restore(previous, &mut self.rng);
        if same_current {
            self.send_queue();
            self.send_state();
            return Ok(());
        }
        self.start_current(false, StartedBy::Jump)
    }

    /// Items enqueued with nothing current: they start playing.
    pub(super) fn start_enqueued(&mut self, track_ids: Vec<TrackId>) -> Result<()> {
        self.replace_queue(track_ids, 0);
        self.start_current(false, StartedBy::Jump)
    }

    pub(super) fn previous(&mut self) -> Result<()> {
        self.navigate(AdvanceReason::UserPrevious)
    }

    pub(super) fn next(&mut self) -> Result<()> {
        self.navigate(AdvanceReason::UserNext)
    }

    pub(super) fn navigate(&mut self, reason: AdvanceReason) -> Result<()> {
        if reason == AdvanceReason::UserPrevious
            && let Some(current) = self.current()
            && previous_restarts_track(current.position_ms(), current.position.duration_ms)
        {
            return self.seek(0);
        }
        let paused = self.current().is_some_and(|current| current.paused);
        if self.queue.advance(reason, &mut self.rng).is_none() {
            return Ok(());
        }
        let started_by = match reason {
            AdvanceReason::UserPrevious => StartedBy::Previous,
            _ => StartedBy::Next,
        };
        self.start_current(paused, started_by)
    }

    /// Pauses the playing track. Nothing happens when no track is loaded.
    pub(super) fn pause(&mut self) {
        if self.set_pending_pause(true) {
            return;
        }
        let WorkerState::Loaded {
            output, current, ..
        } = &mut self.state
        else {
            return;
        };
        if current.paused {
            return;
        }
        if let Err(error) = output.stream.pause() {
            // The stream is stopped with the queue intact.
            self.fail_output(error.code());
            return;
        }
        current.position.sample(output.stream.as_mut());
        output.stream.clear_timing_anchor();
        current.paused = true;
        self.meter.set_running(false);
        self.send_state();
    }

    /// Resume, or after a failure Retry: starts the current queue item again, queue intact.
    pub(super) fn resume(&mut self) -> Result<()> {
        if matches!(self.state, WorkerState::Idle { failed: Some(_) }) {
            return self.start_current(false, StartedBy::Jump);
        }
        self.unpause();
        Ok(())
    }

    pub(super) fn unpause(&mut self) {
        if self.set_pending_pause(false) {
            return;
        }
        let WorkerState::Loaded {
            output, current, ..
        } = &mut self.state
        else {
            return;
        };
        if !current.paused {
            return;
        }
        if let Err(error) = output.stream.start() {
            let error = match error {
                OutputError::StreamStartFailed => OutputError::StreamResumeFailed,
                other => other,
            };
            self.fail_output(error.code());
            return;
        }
        current.paused = false;
        self.meter.set_running(true);
        self.send_state();
    }

    /// Pause and resume while a start is still loading only change what the start does once it
    /// plays. Returns whether a start was loading.
    pub(super) fn set_pending_pause(&mut self, paused: bool) -> bool {
        match &mut self.state {
            WorkerState::Loading(load) => {
                load.request.start_paused = paused;
                true
            }
            WorkerState::Starting { starting, .. } => {
                starting.request.start_paused = paused;
                starting.track.paused = paused;
                true
            }
            _ => false,
        }
    }

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    pub(super) fn start_current(
        &mut self,
        start_paused: bool,
        started_by: StartedBy,
    ) -> Result<()> {
        let Some(entry) = self.queue.current().cloned() else {
            return Ok(());
        };
        self.send_queue();
        self.start_entry(entry, started_by, start_paused)
    }

    /// Reads the track of `entry` and starts it. A track the library no longer has is a failed
    /// item, like a file that cannot be decoded.
    pub(super) fn start_entry(
        &mut self,
        entry: QueueEntry,
        started_by: StartedBy,
        start_paused: bool,
    ) -> Result<()> {
        match self.library_track(entry.track_id) {
            Ok(Some(playable)) => {
                let request = StartRequest {
                    id: self.next_playback_id(),
                    entry,
                    playable,
                    started_by,
                    start_paused,
                    resume_at_ms: None,
                    selection: None,
                };
                self.begin_start(request);
                Ok(())
            }
            // A track the library no longer has. When nothing follows it, the command says so.
            Ok(None) => {
                let skipping = self.will_skip();
                self.fail(
                    FailureAction::SkipItem,
                    PlaybackFailureCode::DecodeFailed,
                    started_by,
                );
                if skipping {
                    Ok(())
                } else {
                    Err(LibraryError::TrackUnavailable.into())
                }
            }
            Err(error) => {
                self.discard_state();
                self.send_queue();
                self.send_state();
                Err(error)
            }
        }
    }

    /// Begins a start: its file is read from now on, and the worker state shows the track as loading.
    pub(super) fn begin_start(&mut self, request: StartRequest) {
        self.discard_state();
        let file = request.playable.file.clone();
        let id = self.next_source_load_id();
        let load = SourceLoad::spawn(file, id, LoadPosition::Start, self.inbox.clone());
        self.state = WorkerState::Loading(StartLoad { load, request });
        self.send_state();
    }

    /// The file of a start is read: open the stream and start decoding into it.
    pub(super) fn open_start(&mut self, request: StartRequest, prepared: PreparedSource) {
        let device_switch = request.selection.is_some();
        let selection = request
            .selection
            .clone()
            .unwrap_or_else(|| self.output_selection.clone());
        let stream_id = self.next_stream_id();
        let pipeline_id = self.next_pipeline_id();
        let callbacks = self.stream_callbacks(stream_id);
        let spec = prepared.decoder.spec();
        let prepared_output =
            match self
                .ctx
                .output_stream_factory
                .open(&selection, spec, pipeline_id, callbacks)
            {
                Ok(prepared_output) => prepared_output,
                Err(error) => {
                    self.fail(FailureAction::StopOutput, error.code(), request.started_by);
                    return;
                }
            };
        let plan = prepared_output.config.processing_plan;
        let Ok(converter) = PcmConverter::new(plan) else {
            self.fail_pipeline(
                PipelineError::ProcessorCreate,
                device_switch,
                request.started_by,
            );
            return;
        };
        let duration_ms = prepared.duration_ms;
        let pipeline = start_decoding(
            &self.inbox,
            pipeline_id,
            prepared,
            prepared_output.producer,
            converter,
            plan,
        );
        let output = Output {
            id: stream_id,
            stream: prepared_output.stream,
            config: prepared_output.config,
        };
        let position = Position::from_start(output.sample_rate(), duration_ms);
        let track = Track {
            id: request.id,
            entry: request.entry.clone(),
            playable: request.playable.clone(),
            started_by: request.started_by,
            pipeline,
            position,
            completion_time: None,
            paused: request.start_paused,
        };
        self.state = WorkerState::Starting {
            output,
            starting: Starting { request, track },
        };
    }

    /// The prebuffer is ready: start the stream (unless starting paused) and send the track.
    pub(super) fn finish_start(&mut self) {
        let WorkerState::Starting {
            output,
            starting: Starting { request, track },
        } = self.take_state()
        else {
            return;
        };
        if !request.start_paused
            && let Err(error) = output.stream.start()
        {
            self.fail(FailureAction::StopOutput, error.code(), request.started_by);
            return;
        }
        let StartRequest {
            selection,
            resume_at_ms,
            ..
        } = request;
        if let Some(selection) = selection {
            self.output_selection = selection;
            self.preferences_changed();
        }
        self.ctx.waveforms.loaded(track.id, &track.playable);
        self.last_item = Some(queue_item(track.entry.id, &track.playable));
        let running = !track.paused;
        self.state = WorkerState::Loaded {
            output,
            current: track,
            next: Next::None,
            seek: Seek::None,
        };
        self.meter.set_running(running);
        self.send_state();
        self.send_position();
        if let Some(position_ms) = resume_at_ms
            && let Err(cause) = self.seek(position_ms)
        {
            error!("playback.resume_seek_failed cause={cause}");
        }
    }

    /// A load reports its file. Only the load the worker state is waiting for is used: a load that was
    /// replaced or cancelled reports nothing the worker needs.
    pub(super) fn source_ready(
        &mut self,
        id: SourceLoadId,
        result: std::result::Result<PreparedSource, PipelineError>,
    ) {
        match &self.state {
            WorkerState::Loading(start) if start.load.id == id => self.start_ready(result),
            WorkerState::Loaded {
                next: Next::Loading(load),
                ..
            } if load.load.id == id => self.next_ready(result),
            WorkerState::Loaded {
                seek: Seek::Loading(load),
                ..
            } if load.load.id == id => self.seek_ready(result),
            _ => {}
        }
    }

    /// The file of a start is read: it opens its stream, or fails the start.
    pub(super) fn start_ready(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
    ) {
        let WorkerState::Loading(StartLoad { request, .. }) = self.take_state() else {
            return;
        };
        match result {
            Ok(prepared) => self.open_start(request, prepared),
            Err(error) => {
                let device_switch = request.selection.is_some();
                self.fail_pipeline(error, device_switch, request.started_by);
            }
        }
    }

    /// The prebuffer of a decode is ready. The one that is waited for is the start, or a seek.
    pub(super) fn prebuffer_ready(&mut self, pipeline: PipelineId) {
        match &self.state {
            WorkerState::Starting { starting, .. } if starting.track.pipeline.id == pipeline => {
                self.finish_start();
            }
            WorkerState::Loaded {
                seek: Seek::Decoding(seek),
                ..
            } if seek.pipeline.id == pipeline => self.finish_seek(),
            _ => {}
        }
    }

    pub(super) fn fail_pipeline(
        &mut self,
        error: PipelineError,
        device_switch: bool,
        started_by: StartedBy,
    ) {
        // A device switch that cannot play is a failed output, not a file to skip.
        let failure = if device_switch {
            FailureAction::StopOutput
        } else {
            FailureAction::SkipItem
        };
        self.fail(failure, error.code(), started_by);
    }

    /// Stops the worker state on a failure and keeps the reason for the listener. A skip moves on to
    /// the next item, which is logged if it cannot start.
    pub(super) fn fail(
        &mut self,
        failure: FailureAction,
        code: PlaybackFailureCode,
        started_by: StartedBy,
    ) {
        error!("playback.failed code={code:?} failure={failure:?} started_by={started_by:?}");
        self.discard_state();
        let skipping = failure == FailureAction::SkipItem && self.will_skip();
        self.state = WorkerState::Idle {
            failed: Some(Failed { code, skipping }),
        };
        self.send_state();
        if skipping {
            self.send_track_skipped();
        }
        if failure == FailureAction::SkipItem
            && let Some(entry) = self.next_after_item_failure()
            && let Err(cause) = self.start_entry(entry, StartedBy::Auto, false)
        {
            error!("playback.skip_start_failed cause={cause}");
        }
    }

    pub(super) fn fail_output(&mut self, code: PlaybackFailureCode) {
        self.fail(FailureAction::StopOutput, code, StartedBy::Jump);
    }

    /// Whether a failure of the current item is followed by trying the next one.
    pub(super) fn will_skip(&self) -> bool {
        self.skipped_in_a_row + 1 < self.queue.len() && self.queue.can_go_next()
    }

    /// Moves the queue past a failed item. Returns the entry to try, if there is one.
    pub(super) fn next_after_item_failure(&mut self) -> Option<QueueEntry> {
        self.skipped_in_a_row += 1;
        if self.skipped_in_a_row >= self.queue.len() {
            return None;
        }
        self.queue.advance(AdvanceReason::UserNext, &mut self.rng)?;
        self.send_queue();
        self.queue.current().cloned()
    }

    /// Tells listeners that the current item could not be played and the worker moves on. Call it
    /// before the queue advances, so the current item is still the one that failed.
    pub(super) fn send_track_skipped(&self) {
        let title = self
            .queue
            .current()
            .and_then(|entry| self.library_track(entry.track_id).ok().flatten())
            .map(|track| track.track.core.title);
        messages::send(&self.ctx.messages, BackendMessage::TrackSkipped { title });
    }

    /// A decode thread failed. The pipeline it belongs to is the one the worker state holds; a failure
    /// of a pipeline that is no longer held is ignored.
    pub(super) fn decode_failed(&mut self, pipeline: PipelineId, error: PipelineError) {
        match &self.state {
            WorkerState::Starting { starting, .. } if starting.track.pipeline.id == pipeline => {
                let WorkerState::Starting {
                    starting: Starting { request, .. },
                    ..
                } = self.take_state()
                else {
                    return;
                };
                let device_switch = request.selection.is_some();
                self.fail_pipeline(error, device_switch, request.started_by);
            }
            WorkerState::Loaded { current, .. } if current.pipeline.id == pipeline => {
                self.fail_pipeline(error, false, StartedBy::Auto);
            }
            WorkerState::Loaded {
                seek: Seek::Decoding(seek),
                ..
            } if seek.pipeline.id == pipeline => {
                // The playing track keeps playing; the failed seek is only dropped.
                self.set_seek(Seek::None);
            }
            WorkerState::Loaded {
                next: Next::Ready(next),
                ..
            } if next.pipeline.id == pipeline => {
                let failed = next.entry.id;
                self.set_next(Next::Failed(failed));
            }
            _ => {}
        }
    }

    pub(super) fn stream_failed(&mut self, stream: OutputStreamId, kind: StreamFailureKind) {
        if !self.output().is_some_and(|output| output.id == stream) {
            return;
        }
        match stream_signal_action(&self.output_selection, kind) {
            StreamSignalAction::RefreshDefaultDevice => {
                info!("playback.stream_interrupted stream_id={}", stream.0);
                self.set_seek(Seek::None);
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

    pub(super) fn refresh_default_device(&mut self) -> bool {
        let Ok(identity) = self
            .ctx
            .output_stream_factory
            .resolve(&AudioOutputSelection::SystemDefault)
        else {
            return false;
        };
        let Some(output) = self.output_mut() else {
            return false;
        };
        output.config.device_id = identity.id;
        output.config.device_name = identity.name;
        self.send_state();
        true
    }

    /// The stream has handed the last frames of `pipeline` to the device. The end of the track is
    /// known once they are heard, so the end time is kept for the stream clock to reach.
    pub(super) fn final_frames(&mut self, pipeline: PipelineId, end_time: StreamInstant) {
        if let WorkerState::Loaded { current, next, .. } = &mut self.state {
            if current.pipeline.id == pipeline {
                current.completion_time = Some(end_time);
            } else if let Next::Ready(next) = next
                && next.pipeline.id == pipeline
            {
                next.completion_time = Some(end_time);
            }
        }
    }

    /// Takes the loaded track's end: the prefetched track if it is chained, otherwise the next
    /// item through the ordinary start. The stream position is what says the track is over.
    pub(super) fn finish_if_due(&mut self) {
        let now = self.output().map(|output| output.stream.now());
        let due = match (self.current(), now) {
            (Some(current), Some(now)) => {
                !current.paused && current.completion_time.is_some_and(|end| now >= end)
            }
            _ => false,
        };
        if !due {
            return;
        }
        if self.adopt_next() {
            return;
        }
        if let Err(cause) = self.advance_after_track(false) {
            error!("playback.advance_failed cause={cause}");
        }
    }

    /// The track is over, because it played out or a seek went past its end: play the next one or
    /// stop.
    pub(super) fn advance_after_track(&mut self, start_paused: bool) -> Result<()> {
        if self
            .queue
            .advance(AdvanceReason::Natural, &mut self.rng)
            .is_some()
            && let Some(entry) = self.queue.current().cloned()
        {
            self.send_queue();
            return self.start_entry(entry, StartedBy::Auto, start_paused);
        }
        self.discard_state();
        self.queue.clear();
        self.send_queue();
        self.send_state();
        Ok(())
    }

    /// The position and the end of the track, sent every tick.
    pub(super) fn update_position(&mut self) {
        let send = match &mut self.state {
            WorkerState::Loaded {
                output, current, ..
            } if !current.paused => {
                current.position.sample(output.stream.as_mut());
                let position = &mut current.position;
                let due = position.frame != position.sent_frame
                    && position.last_send.elapsed() >= POSITION_UPDATE_INTERVAL;
                if due {
                    position.sent_frame = position.frame;
                    position.last_send = Instant::now();
                }
                due
            }
            _ => return,
        };
        if send {
            self.send_position();
        }
        if let Some(current) = self.current()
            && self.loaded_can_go_previous(current) != self.sent_can_go_previous()
        {
            self.send_state();
        }
    }
}
