//! Starting a playback: loading the source, prebuffering, and failing or skipping on.

use super::*;

impl PlaybackWorker {
    /// Replaces the queue and starts its `start_index` item.
    pub(super) fn start_queue(
        &mut self,
        track_ids: Vec<String>,
        start_index: usize,
        reply: Reply<PlaybackSnapshot>,
    ) {
        if self.replace_queue(track_ids, start_index).is_err() {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        self.skipped_in_a_row = 0;
        self.start_current(Some(reply), false);
    }

    /// Replaces the queue, keeping the old one for one-step undo. Nothing is kept when nothing
    /// was queued, so an Undo never resurrects something older than what was just replaced.
    fn replace_queue(
        &mut self,
        track_ids: Vec<String>,
        start_index: usize,
    ) -> Result<(), QueueError> {
        let before = self.queue.clone();
        self.queue.replace(track_ids, start_index, &mut self.rng)?;
        self.previous_queue = (!before.is_empty()).then_some(before);
        // What was read about the old queue's tracks may be out of date by now.
        self.tracks.forget();
        Ok(())
    }

    /// Puts back the queue the last replacement or Clear upcoming took away. When the same item
    /// is still current, it keeps playing; otherwise the restored current item starts.
    pub(super) fn restore_previous_queue(&mut self, reply: Reply<PlaybackSnapshot>) {
        let Some(previous) = self.previous_queue.take() else {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        };
        let same_current = matches!(
            (self.queue.current(), previous.current()),
            (Some(now), Some(then)) if now.id == then.id
        ) && matches!(self.transport, Transport::Loaded(_));
        self.queue.restore(previous, &mut self.rng);
        self.skipped_in_a_row = 0;
        if same_current {
            self.publish_queue();
            let snapshot = self.publish_state();
            let _ = reply.send(Ok(snapshot));
        } else {
            self.start_current(Some(reply), false);
        }
    }

    /// Items enqueued with nothing current: they start playing, and the caller gets the queue
    /// as it stands without waiting for the track to load.
    pub(super) fn start_enqueued(
        &mut self,
        track_ids: Vec<String>,
        reply: Reply<PlaybackQueueSnapshot>,
    ) {
        if self.replace_queue(track_ids, 0).is_err() {
            let _ = reply.send(Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        self.skipped_in_a_row = 0;
        self.start_current(None, false);
        let _ = reply.send(Ok(self.queue_snapshot()));
    }

    /// A start of `item` as a new playback.
    pub(super) fn new_start(
        &mut self,
        item: PlaybackItem,
        responder: Option<Reply<PlaybackSnapshot>>,
        start_paused: bool,
    ) -> StartRequest {
        StartRequest {
            id: self.ids.next(),
            item,
            responder,
            start_paused,
            resume_at_ms: None,
            selection: None,
        }
    }

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    pub(super) fn start_current(
        &mut self,
        responder: Option<Reply<PlaybackSnapshot>>,
        start_paused: bool,
    ) {
        if self.queue.current().is_none() {
            respond(responder, Err(PlaybackServiceError::InvalidPlaybackState));
            return;
        }
        let Some(item) = self.resolve_current() else {
            // Every track left in the queue has gone from the library.
            self.discard_transport();
            self.queue.clear();
            self.publish_queue();
            self.publish_state();
            respond(responder, Err(PlaybackServiceError::TrackUnavailable));
            return;
        };
        self.publish_queue();
        let request = self.new_start(item, responder, start_paused);
        self.begin_start(request);
    }

    pub(super) fn begin_start(&mut self, request: StartRequest) {
        let was_visible = matches!(
            self.transport,
            Transport::Loaded(_) | Transport::Failed { .. }
        );
        self.discard_transport();
        if was_visible {
            self.publish_state();
        }
        let load_id = self.source_load_ids.next();
        match SourceLoad::spawn(request.item.file.clone(), load_id, self.inbox.clone()) {
            Ok(load) => {
                self.transport = Transport::Loading(Loading {
                    request,
                    stage: LoadStage::Source(load),
                });
            }
            Err(()) => {
                self.fail_start(request, StartFailure::item(StartFailurePhase::SourceWorker))
            }
        }
    }

    pub(super) fn source_loaded(
        &mut self,
        id: SourceLoadId,
        result: Result<CompressedAudioSource, CompressedSourceError>,
    ) {
        let is_current_load = matches!(
            &self.transport,
            Transport::Loading(loading)
                if matches!(&loading.stage, LoadStage::Source(load) if load.id() == id)
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
            Ok(source) => self.begin_prebuffering(request, source),
            Err(error) => {
                let phase = match error {
                    CompressedSourceError::Cancelled => {
                        respond(request.responder, Err(PlaybackServiceError::Superseded));
                        return;
                    }
                    CompressedSourceError::OpenFailed => StartFailurePhase::SourceOpen,
                    CompressedSourceError::MetadataFailed => StartFailurePhase::SourceMetadata,
                    CompressedSourceError::ReadFailed => StartFailurePhase::SourceRead,
                    CompressedSourceError::SourceChanged => StartFailurePhase::SourceChanged,
                };
                self.fail_start(request, StartFailure::item(phase));
            }
        }
    }

    /// Opens the decoder, prepares the output and starts the decode thread that fills it.
    pub(super) fn begin_prebuffering(
        &mut self,
        request: StartRequest,
        source: CompressedAudioSource,
    ) {
        let selection = request
            .selection
            .clone()
            .unwrap_or_else(|| self.output_selection.clone());
        let kind = self.start_kind(selection);
        let opened = self.open_pipeline(&source, &request.item.file.extension, kind);
        match opened {
            Ok(OpenedPipeline {
                pipeline,
                output: OpenedOutput::Stream(output),
                duration_ms,
                ..
            }) => {
                self.transport = Transport::Loading(Loading {
                    request,
                    stage: LoadStage::Prebuffering(Prebuffering {
                        source,
                        output,
                        pipeline,
                        duration_ms,
                    }),
                });
            }
            Ok(OpenedPipeline { pipeline, .. }) => {
                unreachable!("a start opens a stream: {:?}", pipeline.id)
            }
            Err(error) => self.fail_start(request, start_failure(error)),
        }
    }

    /// The prebuffer is ready: start the output (unless starting paused) and answer the caller.
    pub(super) fn finish_start(&mut self) {
        let Transport::Loading(loading) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return;
        };
        let Loading { request, stage } = loading;
        let LoadStage::Prebuffering(prebuffering) = stage else {
            return;
        };
        let Prebuffering {
            source,
            output,
            pipeline,
            duration_ms,
        } = prebuffering;
        if !request.start_paused {
            if let Err(error) = output.stream.start() {
                let code = output_failure_code(error);
                pipeline.cancel();
                self.fail_start(
                    request,
                    StartFailure::new(StartFailurePhase::StreamStart, code),
                );
                return;
            }
        }
        let StartRequest {
            id,
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
            position: Position::from_start(output.sample_rate(), duration_ms),
            output,
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
    pub(super) fn fail_start(&mut self, request: StartRequest, failure: StartFailure) {
        let id = Some(request.id);
        error!(
            "playback.start_failed code={:?} phase={:?} playback_id={:?}",
            failure.code, failure.phase, id
        );
        let error = failure.service_error();
        let skips = failure.phase.scope() == FailureScope::Item && request.selection.is_none();
        self.transport = Transport::Failed {
            id,
            code: failure.code,
            skipping: skips && self.will_skip(),
        };
        self.publish_state();
        let responder = request.responder;
        if skips {
            if let Some(item) = self.next_after_item_failure() {
                let request = self.new_start(item, responder, false);
                self.begin_start(request);
                return;
            }
        }
        respond(responder, Err(error));
    }

    /// Whether a failure of the current item will be followed by trying the next one.
    pub(super) fn will_skip(&self) -> bool {
        self.skipped_in_a_row + 1 < self.queue.len() && self.queue.can_go_next()
    }

    /// The item to try after the current one could not be played, if there is one to try.
    pub(super) fn next_after_item_failure(&mut self) -> Option<PlaybackItem> {
        self.skipped_in_a_row += 1;
        if self.skipped_in_a_row >= self.queue.len() {
            return None;
        }
        self.queue.advance(AdvanceReason::UserNext, &mut self.rng)?;
        let item = self.resolve_current()?;
        self.publish_queue();
        Some(item)
    }

    /// The item the queue points at, read from the library. A track the library no longer has
    /// is dropped from the queue and the one after it is tried, so an entry that disappeared
    /// between starting and playing never stops the queue.
    pub(super) fn resolve_current(&mut self) -> Option<PlaybackItem> {
        loop {
            let entry = self.queue.current()?.clone();
            if let Some(item) = self.item_of(&entry) {
                return Some(item);
            }
            self.queue.remove_entries(&HashSet::from([entry.id]));
        }
    }

    /// The queue entry as a playable item, `None` when the library no longer has its track.
    pub(super) fn item_of(&self, entry: &QueueEntry) -> Option<PlaybackItem> {
        Some(PlaybackItem {
            queue_item_id: entry.queue_item_id(),
            track: self.tracks.resolve_one(&entry.track_id)?,
        })
    }

    /// Drops the queued items the library no longer has from the part of the queue that is about
    /// to be shown, so the counts and the rows agree. The current item is `resolve_current`'s.
    pub(super) fn prune_unavailable(&mut self) {
        loop {
            let history = self.queue.history();
            let upcoming = self.queue.upcoming();
            let mut shown: Vec<&QueueEntry> = history
                [history.len().saturating_sub(HISTORY_IN_SNAPSHOT)..]
                .iter()
                .collect();
            shown.extend(&upcoming[..upcoming.len().min(UPCOMING_IN_SNAPSHOT)]);
            let ids: Vec<&str> = shown.iter().map(|entry| &*entry.track_id).collect();
            let gone: HashSet<u64> = shown
                .iter()
                .zip(self.tracks.resolve(&ids))
                .filter(|(_, track)| track.is_none())
                .map(|(entry, _)| entry.id)
                .collect();
            if gone.is_empty() || !self.queue.remove_entries(&gone) {
                return;
            }
        }
    }

    pub(super) fn navigate(&mut self, reason: AdvanceReason, reply: Reply<PlaybackSnapshot>) {
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
}

fn start_failure(error: PipelineError) -> StartFailure {
    match error {
        PipelineError::DecoderOpen => StartFailure::item(StartFailurePhase::DecoderOpen),
        PipelineError::OutputPrepare(error) => {
            StartFailure::new(StartFailurePhase::OutputPrepare, output_failure_code(error))
        }
        PipelineError::ProcessorCreate => StartFailure::new(
            StartFailurePhase::ProcessorCreate,
            PlaybackFailureCode::SampleRateConversionFailed,
        ),
        // A start reads from the beginning of a file it opened itself, so only a seek meets a
        // changed format or a failed seek.
        PipelineError::FirstPacketDecode
        | PipelineError::SpecChanged
        | PipelineError::SeekFailed => StartFailure::item(StartFailurePhase::FirstPacketDecode),
    }
}
