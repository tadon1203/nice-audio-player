//! The tick: position updates and the end of a track, run at the worker's next deadline.

use super::prefetch::PREFETCH_LEAD_MS;
use super::*;

impl PlaybackWorker {
    pub(in super::super) fn tick(&mut self) {
        self.finish_if_due();
        self.update_position();
        self.maybe_prefetch();
    }

    /// When the worker next has something to do on its own, if a track is playing: the end of the
    /// track, the next position publish, the start of the prefetch or the "previous restarts"
    /// boundary, whichever comes first. `None` means sleep until an input arrives.
    pub(in super::super) fn next_deadline(&self) -> Option<Instant> {
        let Transport::Loaded(loaded) = &self.transport else {
            return None;
        };
        if loaded.paused {
            return None;
        }
        let now = Instant::now();
        // An overdue publish that found no new position (a stalled stream) waits a full interval.
        let publish_at = loaded.position.last_publish + POSITION_UPDATE_INTERVAL;
        let mut deadline = if publish_at > now {
            publish_at
        } else {
            now + POSITION_UPDATE_INTERVAL
        };
        let mut consider = |at: Instant| deadline = deadline.min(at);

        if let Some(end) = loaded.completion_time {
            let stream_now = loaded.output.stream.now();
            consider(now + end.duration_since(stream_now));
        }
        let position_ms = loaded.position_ms();
        if let Some(duration_ms) = loaded.position.duration_ms {
            if loaded.prefetch.is_none()
                && loaded.seek.is_none()
                && self.queue.peek_natural().is_some()
            {
                let until = duration_ms
                    .saturating_sub(position_ms)
                    .saturating_sub(PREFETCH_LEAD_MS);
                if until > 0 {
                    consider(now + Duration::from_millis(until));
                }
            }
            if position_ms < PREVIOUS_RESTART_THRESHOLD_MS {
                consider(now + Duration::from_millis(PREVIOUS_RESTART_THRESHOLD_MS - position_ms));
            }
        }
        Some(deadline)
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
        if self.adopt_prefetched() {
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
        let advanced = self
            .queue
            .advance(AdvanceReason::Natural, &mut self.rng)
            .is_some();
        match advanced.then(|| self.resolve_current()).flatten() {
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
        let changed = frame != loaded.position.frame;
        loaded.position.frame = frame;
        if should_publish_position(loaded.position.last_publish.elapsed(), changed) {
            loaded.position.last_publish = Instant::now();
            self.publish_position();
        }
        // Previous restarts the track once it has played a while; that is state, not position.
        let Transport::Loaded(loaded) = &self.transport else {
            return;
        };
        if self.loaded_can_go_previous(loaded) != self.published_can_go_previous() {
            self.publish_state();
        }
    }
}
