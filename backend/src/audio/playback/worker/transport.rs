//! Stopping, pausing, resuming and switching the output device.

use super::*;

impl PlaybackWorker {
    /// Lets go of whatever is loading or loaded, answering whoever waits for it.
    pub(super) fn discard_transport(&mut self) {
        match std::mem::replace(&mut self.transport, Transport::Idle) {
            Transport::Idle | Transport::Failed { .. } => {}
            Transport::Loading(loading) => {
                match loading.stage {
                    LoadStage::Source(load) => load.cancel(),
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
    pub(super) fn drop_loaded(&mut self, seek_error: PlaybackServiceError) -> Option<PlaybackId> {
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

    pub(super) fn pause(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
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
        if let Err(error) = loaded.output.stream.pause() {
            return Err(self.control_failure(error));
        }
        let position = loaded.sample_position();
        loaded.output.stream.clear_timing_anchor();
        loaded.position.frame = position;
        loaded.paused = true;
        Ok(self.publish_state())
    }

    /// Resume, or after a failure Retry: starts the current queue item again, queue intact.
    pub(super) fn resume_command(&mut self, reply: Reply<PlaybackSnapshot>) {
        if matches!(self.transport, Transport::Failed { .. }) {
            self.skipped_in_a_row = 0;
            self.start_current(Some(reply), false);
            return;
        }
        let _ = reply.send(self.resume());
    }

    pub(super) fn resume(&mut self) -> Result<PlaybackSnapshot, PlaybackServiceError> {
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
        if let Err(error) = loaded.output.stream.start() {
            let error = match error {
                AudioOutputError::StreamStartFailed => AudioOutputError::StreamResumeFailed,
                other => other,
            };
            return Err(self.control_failure(error));
        }
        loaded.paused = false;
        Ok(self.publish_state())
    }

    pub(super) fn control_failure(&mut self, error: AudioOutputError) -> PlaybackServiceError {
        let id = self.drop_loaded(PlaybackServiceError::Superseded);
        let code = output_failure_code(error);
        self.transport = Transport::Failed {
            id,
            code: code.clone(),
            skipping: false,
        };
        self.publish_state();
        PlaybackServiceError::from(code)
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device
    /// at the same position and keeps its paused state and queue.
    pub(super) fn change_output_selection(
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
            id: loaded.id,
            item: loaded.item.clone(),
            responder: Some(reply),
            start_paused: loaded.paused,
            resume_at_ms: Some(loaded.position_ms()),
            selection: Some(selection),
        };
        self.begin_start(request);
    }

    pub(super) fn set_output_selection(
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
}
