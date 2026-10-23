//! Rendering the transport and queue into snapshots and telling listeners.

use super::{
    AudioOutputDeviceIdentity, PlaybackQueue, PlaybackServiceError, PlaybackWorker, QueueError,
    Transport,
};
use super::{CurrentPlayback, PlayableItem, previous_restarts_track};
use super::{
    PlaybackControls, PlaybackPosition, PlaybackProcessingInfo, PlaybackState, QueueState,
};
use crate::audio::playback::session::Loaded;
use crate::messages::{Revisioned, StateTopic};

impl PlaybackWorker {
    /// What listeners see, drawn from the transport, the queue and the volume.
    pub(super) fn render(&self) -> PlaybackState {
        let mut base = PlaybackControls::new(self.volume_state, self.output_selection.clone());
        match &self.transport {
            Transport::Idle | Transport::Loading(_) => PlaybackState::Stopped {
                base,
                item: self.last_item.as_ref().map(PlayableItem::to_playback_item),
            },
            Transport::Loaded(loaded) => {
                base.can_go_previous = self.loaded_can_go_previous(loaded);
                base.can_go_next = self.queue.can_go_next();
                let session = self.render_session(loaded);
                if loaded.paused {
                    PlaybackState::Paused { base, session }
                } else {
                    PlaybackState::Playing { base, session }
                }
            }
            Transport::Failed { id, code, skipping } => {
                base.can_go_previous = self.queue.can_go_previous();
                base.can_go_next = self.queue.can_go_next();
                PlaybackState::Failed {
                    base,
                    item: self
                        .queue
                        .current()
                        .and_then(|entry| self.item_of(entry))
                        .or_else(|| self.last_item.clone())
                        .map(|item| item.to_playback_item()),
                    playback_id: *id,
                    error: *code,
                    skipping: *skipping,
                }
            }
        }
    }

    pub(super) fn render_session(&self, loaded: &Loaded) -> CurrentPlayback {
        let config = &loaded.output.config;
        let processing = PlaybackProcessingInfo::from_plan(config.processing_plan);
        CurrentPlayback {
            item: loaded.item.to_playback_item(),
            started_by: loaded.started_by,
            playback_id: loaded.id,
            position_ms: loaded.position_ms(),
            seek_revision: self.seek_revision,
            duration_ms: loaded.position.duration_ms,
            output_device: AudioOutputDeviceIdentity {
                id: config.device_id.clone(),
                name: config.device_name.clone(),
            },
            channel_conversion: processing.channel_conversion,
            source_format: loaded
                .item
                .file_format
                .clone()
                .unwrap_or_else(|| loaded.item.file.extension.clone()),
            source_bit_depth: loaded.item.bit_depth,
            source_bitrate_kbps: loaded.item.bitrate_kbps,
            source_sample_rate: processing.source_sample_rate,
            output_sample_rate: processing.output_sample_rate,
            resampling_active: processing.resampling_active(),
        }
    }

    /// The transport as it stands, with the revision of its topic. A command that changes
    /// nothing answers with it.
    pub(super) fn playback_versioned(&self) -> Revisioned<PlaybackState> {
        Revisioned {
            revision: self.revision,
            value: self.render(),
        }
    }

    /// Renders the transport as a new revision and tells listeners. The snapshot carries the
    /// newest position too, so a listener that joins here starts from the right place.
    pub(super) fn publish_state(&mut self) -> Revisioned<PlaybackState> {
        if let Transport::Loaded(loaded) = &mut self.transport
            && !loaded.paused
        {
            loaded.position.frame = loaded.sample_position();
        }
        self.revision = self.revision.saturating_add(1);
        let published = self.playback_versioned();
        self.store_position(published.value.session().map(CurrentPlayback::position));
        *self.snapshot.write() = published.clone();
        self.messages.state_changed(StateTopic::Playback);
        published
    }

    /// Tells listeners the loaded track moved on, without a new snapshot.
    pub(super) fn publish_position(&mut self) {
        let Transport::Loaded(loaded) = &self.transport else {
            return;
        };
        self.store_position(Some(PlaybackPosition {
            playback_id: loaded.id,
            position_ms: loaded.position_ms(),
            seek_revision: self.seek_revision,
        }));
        self.messages.position_changed();
    }

    /// Previous is offered when the queue has an earlier item, or the track has played long
    /// enough that Previous restarts it.
    pub(super) fn loaded_can_go_previous(&self, loaded: &Loaded) -> bool {
        self.queue.can_go_previous()
            || previous_restarts_track(loaded.position_ms(), loaded.position.duration_ms)
    }

    fn store_position(&self, position: Option<PlaybackPosition>) {
        *self.position.write() = position;
    }

    /// Whether Previous is offered, as listeners last saw it.
    pub(super) fn published_can_go_previous(&self) -> bool {
        self.snapshot.read().value.base().can_go_previous
    }

    pub(super) fn publish_queue(&mut self) -> Revisioned<QueueState> {
        self.prune_unavailable();
        self.next_queue_revision = self.next_queue_revision.saturating_add(1);
        let published = Revisioned {
            revision: self.next_queue_revision,
            value: QueueState::of(&self.queue, &self.tracks, self.previous_queue.is_some()),
        };
        *self.queue_snapshot.write() = published.clone();
        self.messages.state_changed(StateTopic::Queue);
        published
    }

    pub(super) fn queue_snapshot(&self) -> Revisioned<QueueState> {
        self.queue_snapshot.read().clone()
    }

    /// Publishes a queue change, and refreshes the transport so previous/next availability
    /// follows it even while paused.
    pub(super) fn queue_changed(&mut self, changed: bool) -> Revisioned<QueueState> {
        if !changed {
            return self.queue_snapshot();
        }
        let snapshot = self.publish_queue();
        self.publish_state();
        snapshot
    }

    pub(super) fn edit_queue(
        &mut self,
        edit: impl FnOnce(&mut PlaybackQueue) -> Result<bool, QueueError>,
    ) -> Result<bool, PlaybackServiceError> {
        if matches!(self.transport, Transport::Loading(_)) {
            return Err(PlaybackServiceError::QueueBusy);
        }
        edit(&mut self.queue)
            .inspect_err(|cause| log::warn!("playback.queue.edit_failed cause={cause}"))
            .map_err(|_| PlaybackServiceError::QueueItemNotFound)
    }
}
