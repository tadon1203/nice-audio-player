//! Opens the next track before the current one ends, so that it plays with no gap.

use super::state::{Next, NextLoad, Seek, WorkerState};
use super::{PlayerWorker, queue_item};
use crate::ids::QueueItemId;
use crate::library::read::playback::PlayableTrack;
use crate::player::audio::output::make_queue;
use crate::player::audio::pipeline::{
    LoadPosition, PipelineError, PreparedSource, SourceLoad, start_decoding,
};
use crate::player::audio::processing::PcmConverter;
use crate::player::playback::queue::{AdvanceReason, QueueEntry};
use crate::player::playback::transport::{Position, Track};
use crate::player::worker::published::StartedBy;

/// How long before the end of a track the next one is opened. A shorter track opens it right after
/// it has loaded.
const PREFETCH_LEAD_MS: u64 = 10_000;

impl PlayerWorker {
    /// Opens the track that follows the playing one once its end is near.
    pub(super) fn maybe_prefetch(&mut self) {
        let WorkerState::Loaded {
            output,
            current,
            next,
            seek,
        } = &self.state
        else {
            return;
        };
        if current.paused
            || !matches!(next, Next::None | Next::Failed(_))
            || !matches!(seek, Seek::None)
        {
            return;
        }
        let Some(duration_ms) = current.position.duration_ms else {
            return;
        };
        if duration_ms.saturating_sub(current.position_ms()) > PREFETCH_LEAD_MS {
            return;
        }
        let Some(entry) = self.queue.peek_natural().cloned() else {
            return;
        };
        if matches!(next, Next::Failed(failed) if *failed == entry.id) {
            return;
        }
        let plan = output.config.processing_plan;
        let Ok(Some(playable)) = self.library_track(entry.track_id) else {
            self.set_next(Next::Failed(entry.id));
            return;
        };
        // Its waveform is analyzed now, in the background, so skipping ahead finds it.
        self.ctx.waveforms.upcoming(&playable);
        let id = self.next_source_load_id();
        let file = playable.file.clone();
        let load = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Prefetch { plan },
            self.load_events(),
        );
        self.set_next(Next::Loading(NextLoad {
            load,
            entry,
            playable,
        }));
    }

    /// The file of the next track is read: it is decoded into a queue that the stream plays right
    /// after the playing track.
    pub(super) fn next_ready(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
    ) {
        let WorkerState::Loaded { next, .. } = &mut self.state else {
            return;
        };
        let Next::Loading(NextLoad {
            entry, playable, ..
        }) = std::mem::replace(next, Next::None)
        else {
            return;
        };
        let chained = self.chain_next(result, entry, playable);
        self.set_next(match chained {
            Ok(track) => Next::Ready(track),
            Err(failed) => Next::Failed(failed),
        });
    }

    /// Decodes a prefetched file into a queue that the stream plays right after the playing track.
    /// A failure gives the entry's id, so that the entry is not prefetched again.
    pub(super) fn chain_next(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
        entry: QueueEntry,
        playable: PlayableTrack,
    ) -> std::result::Result<Track, QueueItemId> {
        let failed = entry.id;
        let pipeline_id = self.next_pipeline_id();
        let id = self.next_playback_id();
        let events = self.load_events();
        let Ok(prepared) = result else {
            return Err(failed);
        };
        let WorkerState::Loaded {
            output, current, ..
        } = &mut self.state
        else {
            return Err(failed);
        };
        let after = current.pipeline.id;
        let plan = output.config.processing_plan;
        let Ok((producer, consumer)) = make_queue(plan.output()) else {
            return Err(failed);
        };
        let Ok(converter) = PcmConverter::new(plan) else {
            return Err(failed);
        };
        let duration_ms = prepared.duration_ms;
        let pipeline = start_decoding(events, pipeline_id, prepared, producer, converter, plan);
        output.stream.queue_next(after, consumer, pipeline_id);
        let position = Position::from_start(output.sample_rate(), duration_ms);
        Ok(Track {
            id,
            entry,
            playable,
            started_by: StartedBy::Auto,
            pipeline,
            position,
            completion_time: None,
            paused: false,
        })
    }

    /// The playing track has ended and the chained one is already playing: it becomes the current
    /// track. Returns false when there is no such track.
    pub(super) fn adopt_next(&mut self) -> bool {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        let WorkerState::Loaded {
            next: Next::Ready(next),
            ..
        } = &self.state
        else {
            return false;
        };
        if Some(next.entry.id) != natural {
            self.set_next(Next::None);
            return false;
        }
        let _ = self.queue.advance(AdvanceReason::Natural, &mut self.rng);
        let WorkerState::Loaded {
            output,
            current,
            next,
            ..
        } = &mut self.state
        else {
            return false;
        };
        let Next::Ready(track) = std::mem::replace(next, Next::None) else {
            return false;
        };
        output.stream.adopt_next(track.pipeline.id);
        self.ctx.waveforms.loaded(track.id, &track.playable);
        self.last_item = Some(queue_item(track.entry.id, &track.playable));
        // The finished track is dropped here, which stops its decode thread.
        *current = track;
        self.send_queue();
        self.send_state();
        self.send_position();
        true
    }

    /// Drops the prefetched track when something other than it plays next now.
    pub(super) fn revalidate_prefetch(&mut self) {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        let stale = match &self.state {
            WorkerState::Loaded {
                next: Next::Ready(track),
                ..
            } => Some(track.entry.id) != natural,
            WorkerState::Loaded {
                next: Next::Loading(load),
                ..
            } => Some(load.entry.id) != natural,
            _ => false,
        };
        if stale {
            self.set_next(Next::None);
        }
    }
}
