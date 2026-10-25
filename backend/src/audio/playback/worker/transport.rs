//! Stopping, pausing, resuming and switching the output device.

use super::{
    AudioOutputSelection, CommandError, LoadStage, OutputError, PlaybackState, PlaybackWorker,
    Reply, StartRequest, StartedBy, Transport, Versioned, output_failure_code, resolution_error,
    respond,
};

impl PlaybackWorker {
    /// Lets go of whatever is loading or loaded, answering whoever waits for it.
    pub(super) fn discard_transport(&mut self) {
        self.meter.set_running(false);
        match std::mem::replace(&mut self.transport, Transport::Idle) {
            Transport::Idle | Transport::Failed { .. } => {}
            Transport::Loading(loading) => {
                match loading.stage {
                    LoadStage::Source(load) => load.cancel(),
                    LoadStage::Prebuffering(prebuffering) => prebuffering.pipeline.cancel(),
                }
                respond(loading.request.responder, Err(CommandError::Superseded));
            }
            Transport::Loaded(mut loaded) => {
                if let Some(seek) = loaded.seek.take() {
                    seek.pipeline.cancel();
                    respond(seek.responder, Err(CommandError::Superseded));
                }
                if let Some(prefetch) = loaded.prefetch.take() {
                    prefetch.cancel();
                }
                loaded.pipeline.cancel();
            }
        }
    }

    /// Lets go of the loaded track. A seek in flight is answered with `seek_error`.
    pub(super) fn drop_loaded(&mut self, seek_error: CommandError) {
        self.meter.set_running(false);
        let Transport::Loaded(mut loaded) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return;
        };
        if let Some(seek) = loaded.seek.take() {
            seek.pipeline.cancel();
            respond(seek.responder, Err(seek_error));
        }
        if let Some(prefetch) = loaded.prefetch.take() {
            prefetch.cancel();
        }
        loaded.pipeline.cancel();
    }

    pub(in super::super) fn pause(&mut self) -> Result<Versioned<PlaybackState>, CommandError> {
        if let Transport::Loading(loading) = &mut self.transport {
            loading.request.start_paused = true;
            return Ok(self.playback_versioned());
        }
        let Transport::Loaded(loaded) = &mut self.transport else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if loaded.paused {
            return Ok(self.playback_versioned());
        }
        if let Err(error) = loaded.output.stream.pause() {
            return Err(self.control_failure(error));
        }
        let position = loaded.sample_position();
        loaded.output.stream.clear_timing_anchor();
        loaded.position.frame = position;
        loaded.paused = true;
        self.meter.set_running(false);
        Ok(self.publish_state())
    }

    /// Resume, or after a failure Retry: starts the current queue item again, queue intact.
    pub(in super::super) fn resume(&mut self, reply: Reply<Versioned<PlaybackState>>) {
        if matches!(self.transport, Transport::Failed { .. }) {
            self.skipped_in_a_row = 0;
            self.start_current(Some(reply), false, StartedBy::Jump);
            return;
        }
        respond(reply, self.unpause());
    }

    pub(super) fn unpause(&mut self) -> Result<Versioned<PlaybackState>, CommandError> {
        if let Transport::Loading(loading) = &mut self.transport {
            loading.request.start_paused = false;
            return Ok(self.playback_versioned());
        }
        let Transport::Loaded(loaded) = &mut self.transport else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if !loaded.paused {
            return Ok(self.playback_versioned());
        }
        if let Err(error) = loaded.output.stream.start() {
            let error = match error {
                OutputError::StreamStartFailed => OutputError::StreamResumeFailed,
                other => other,
            };
            return Err(self.control_failure(error));
        }
        loaded.paused = false;
        self.meter.set_running(true);
        Ok(self.publish_state())
    }

    pub(super) fn control_failure(&mut self, error: OutputError) -> CommandError {
        self.drop_loaded(CommandError::Superseded);
        let code = output_failure_code(error);
        self.transport = Transport::Failed {
            code,
            skipping: false,
        };
        self.publish_state();
        CommandError::from(code)
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device
    /// at the same position and keeps its paused state and queue.
    pub(in super::super) fn set_output_selection(
        &mut self,
        selection: AudioOutputSelection,
        reply: Reply<Versioned<PlaybackState>>,
    ) {
        let Transport::Loaded(loaded) = &self.transport else {
            respond(reply, self.set_idle_output_selection(selection));
            return;
        };
        if loaded.seek.is_some() {
            respond(reply, Err(CommandError::InvalidPlaybackState));
            return;
        }
        if selection == self.output_selection {
            respond(reply, Ok(self.playback_versioned()));
            return;
        }
        if let Err(error) = self.output_stream_factory.resolve(&selection) {
            respond(reply, Err(resolution_error(error)));
            return;
        }
        let request = StartRequest {
            id: loaded.id,
            item: loaded.item.clone(),
            started_by: loaded.started_by,
            responder: Some(reply),
            start_paused: loaded.paused,
            resume_at_ms: Some(loaded.position_ms()),
            selection: Some(selection),
        };
        self.begin_start(request);
    }

    pub(super) fn set_idle_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<Versioned<PlaybackState>, CommandError> {
        if matches!(self.transport, Transport::Loading(_)) {
            return Err(CommandError::InvalidPlaybackState);
        }
        if let AudioOutputSelection::Device { .. } = &selection {
            self.output_stream_factory
                .resolve(&selection)
                .map_err(resolution_error)?;
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
            return Ok(self.playback_versioned());
        }
        Ok(self.publish_state())
    }
}
