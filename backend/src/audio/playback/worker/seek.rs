//! Seeking inside a loaded playback.

use super::*;

impl PlaybackWorker {
    pub(super) fn begin_seek(
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
        let config = loaded.output.config.clone();
        let opened = self.open_pipeline(
            &source,
            &extension,
            PipelineKind::Seek { config, target_ms },
        );
        match opened {
            Ok(OpenedPipeline {
                pipeline,
                output: OpenedOutput::Queue(queue),
                start_output_frame,
                ..
            }) => {
                let Transport::Loaded(loaded) = &mut self.transport else {
                    pipeline.cancel();
                    return;
                };
                let rate = loaded.output.sample_rate();
                let output_base_frame = start_output_frame;
                let total_output_frames = millis_to_frame(duration_ms, rate);
                loaded.seek = Some(SeekInFlight {
                    pipeline,
                    queue,
                    output_base_frame: output_base_frame.min(total_output_frames),
                    remaining_frames: total_output_frames.saturating_sub(output_base_frame),
                    duration_ms,
                    responder,
                });
            }
            Ok(OpenedPipeline { pipeline, .. }) => {
                unreachable!("a seek reuses the stream: {:?}", pipeline.id)
            }
            Err(error) => respond(responder, Err(seek_error(error))),
        }
    }

    /// The seek's prebuffer is ready: the stream switches over to its queue.
    pub(super) fn finish_seek(&mut self) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        let Some(seek) = loaded.seek.take() else {
            return;
        };
        loaded
            .output
            .stream
            .switch_queue(seek.queue, seek.pipeline.id);
        std::mem::replace(&mut loaded.pipeline, seek.pipeline).cancel();
        loaded.position.sample_rate = loaded.output.sample_rate();
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

    pub(super) fn cancel_seek(&mut self, error: PlaybackServiceError) {
        if let Transport::Loaded(loaded) = &mut self.transport {
            if let Some(seek) = loaded.seek.take() {
                seek.pipeline.cancel();
                respond(seek.responder, Err(error));
            }
        }
    }
}

fn seek_error(error: PipelineError) -> PlaybackServiceError {
    match error {
        PipelineError::SeekFailed => PlaybackServiceError::Seek,
        PipelineError::OutputPrepare(error) => {
            PlaybackServiceError::Output(output_failure_code(error))
        }
        PipelineError::ProcessorCreate => {
            PlaybackServiceError::Output(PlaybackFailureCode::SampleRateConversionFailed)
        }
        PipelineError::DecoderOpen
        | PipelineError::SpecChanged
        | PipelineError::FirstPacketDecode => PlaybackServiceError::Decode,
    }
}
