//! Seeks the loaded track. The file is read again at the new position, and the new pipeline
//! replaces the old one once it is ready.

use super::PlayerWorker;
use super::state::{Next, PendingSeek, Seek, SeekLoad, WorkerState};
use crate::player::audio::output::make_queue;
use crate::player::audio::pcm::millis_to_frame;
use crate::player::audio::pipeline::{
    LoadPosition, PipelineError, PreparedSource, SourceLoad, start_decoding,
};
use crate::player::audio::processing::PcmConverter;
use crate::player::errors::Result;
use log::error;
use std::time::Instant;

impl PlayerWorker {
    /// Seeks the playing track. The new position is prebuffered while the old one keeps playing.
    /// A seek that fails while it loads leaves the playing track as it is.
    pub(super) fn seek(&mut self, requested_position_ms: u64) -> Result<()> {
        self.set_seek(Seek::None);
        self.set_next(Next::None);
        let WorkerState::Loaded {
            output, current, ..
        } = &self.state
        else {
            return Ok(());
        };
        let Some(duration_ms) = current.position.duration_ms else {
            return Ok(());
        };
        let target_ms = requested_position_ms.min(duration_ms);
        if target_ms == duration_ms {
            let paused = current.paused;
            return self.advance_after_track(paused);
        }
        let file = current.playable.file.clone();
        let plan = output.config.processing_plan;
        let id = self.next_source_load_id();
        let load = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Seek { target_ms, plan },
            self.load_events(),
        );
        self.set_seek(Seek::Loading(SeekLoad { load, duration_ms }));
        Ok(())
    }

    /// The seek's file is read: start decoding the new position. A seek that cannot start is logged,
    /// and the playing track keeps playing.
    pub(super) fn seek_ready(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
    ) {
        let WorkerState::Loaded { seek, .. } = &mut self.state else {
            return;
        };
        let Seek::Loading(SeekLoad { duration_ms, .. }) = std::mem::replace(seek, Seek::None)
        else {
            return;
        };
        match self.pending_seek(result, duration_ms) {
            Ok(pending) => self.set_seek(Seek::Decoding(pending)),
            Err(error) => error!("playback.seek_failed error={error:?}"),
        }
    }

    /// The new pipeline of a seek: the stream output of it, and the position it starts from.
    pub(super) fn pending_seek(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
        duration_ms: u64,
    ) -> std::result::Result<PendingSeek, PipelineError> {
        let prepared = result?;
        let pipeline_id = self.next_pipeline_id();
        let plan = self
            .output()
            .map(|output| output.config.processing_plan)
            .expect("a seek is prepared only while a track is loaded");
        let (producer, queue) = make_queue(plan.output()).map_err(PipelineError::Output)?;
        let converter = PcmConverter::new(plan)
            .ok()
            .ok_or(PipelineError::ProcessorCreate)?;
        let rate = plan.output().sample_rate().get();
        let total_frames = millis_to_frame(duration_ms, rate);
        let base_frame = prepared.start_output_frame.min(total_frames);
        let remaining_frames = total_frames.saturating_sub(prepared.start_output_frame);
        let pipeline = start_decoding(
            self.load_events(),
            pipeline_id,
            prepared,
            producer,
            converter,
            plan,
        );
        Ok(PendingSeek {
            pipeline,
            queue,
            base_frame,
            remaining_frames,
            duration_ms,
        })
    }

    /// The seek's prebuffer is ready: the stream switches to its queue.
    pub(super) fn finish_seek(&mut self) {
        {
            let WorkerState::Loaded {
                output,
                current,
                seek,
                ..
            } = &mut self.state
            else {
                return;
            };
            let Seek::Decoding(pending) = std::mem::replace(seek, Seek::None) else {
                return;
            };
            output
                .stream
                .switch_queue(pending.queue, pending.pipeline.id);
            // Assigning the pipeline drops the old one, which stops its decode thread.
            current.pipeline = pending.pipeline;
            current.position.sample_rate = output.sample_rate();
            current.position.duration_ms = Some(pending.duration_ms);
            current.position.frame = pending.base_frame;
            current.position.base_frame = pending.base_frame;
            current.position.remaining_frames = Some(pending.remaining_frames);
            current.position.last_send = Instant::now();
            current.completion_time = None;
        }
        self.seek_count = self.seek_count.saturating_add(1);
        self.send_state();
        self.send_position();
    }
}
