//! The tick: position updates and the end of a track.

use super::*;

impl PlaybackWorker {
    pub(in super::super) fn tick(&mut self) {
        self.last_tick = Instant::now();
        self.finish_if_due();
        self.update_position();
    }

    pub(super) fn finish_if_due(&mut self) {
        let is_due = matches!(
            &self.transport,
            Transport::Loaded(loaded) if !loaded.paused
                && loaded
                    .completion_time
                    .is_some_and(|end| loaded.output.stream.now() >= end)
        );
        if !is_due {
            return;
        }
        self.advance_after_track(None, false);
    }

    /// The track is over, because it played out or a seek went past its end: play the next one
    /// or stop.
    pub(super) fn advance_after_track(
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
                let request = self.new_start(item, responder, start_paused);
                self.begin_start(request);
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

    pub(super) fn update_position(&mut self) {
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
}
