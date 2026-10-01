//! Failed streams and decodes, and what the worker does about them.

use super::*;

impl PlaybackWorker {
    /// A decode thread stopped on its own: the file (or its conversion) cannot be played.
    pub(super) fn decode_stopped(&mut self, stream: OutputStreamId, code: PlaybackFailureCode) {
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

    pub(super) fn stream_failed(&mut self, stream: OutputStreamId, kind: StreamFailureKind) {
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

    pub(super) fn fail_output(&mut self, code: PlaybackFailureCode) {
        self.fail_active(
            code.clone(),
            FailureScope::Output,
            PlaybackServiceError::Output(code),
        );
    }

    /// Fails the loaded track. An `Item` failure moves on to the next one; an `Output` failure
    /// stops with the queue intact so the listener can retry after fixing the device.
    pub(super) fn fail_active(
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
                let request = self.new_start(item, None, false);
                self.begin_start(request);
            }
        }
    }

    pub(super) fn refresh_default_device(&mut self) -> bool {
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
}
