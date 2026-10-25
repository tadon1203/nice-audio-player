//! Rendering the transport and queue into snapshots and telling listeners.

use super::{
    AudioOutputDeviceIdentity, CommandError, PlaybackQueue, PlaybackWorker, QueueError, Transport,
};
use super::{CurrentPlayback, PlayableItem, previous_restarts_track};
use super::{
    PlaybackControls, PlaybackPosition, PlaybackProcessingInfo, PlaybackState, QueueState,
};
use crate::audio::playback::session::Loaded;
use crate::messages::{Notification, Versioned};

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
            seek_count: self.seek_count,
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

    /// The transport as it is published, with the version of its topic. A command that changes
    /// nothing answers with it.
    pub(super) fn playback_versioned(&self) -> Versioned<PlaybackState> {
        self.state_store.playback()
    }

    /// Renders the transport and publishes it, which tells listeners when it changed. The
    /// position is stored too, so a listener that joins later starts from the right place.
    pub(super) fn publish_state(&mut self) -> Versioned<PlaybackState> {
        if let Transport::Loaded(loaded) = &mut self.transport
            && !loaded.paused
        {
            loaded.position.frame = loaded.sample_position();
        }
        let value = self.render();
        self.store_position(value.session().map(CurrentPlayback::position));
        let version = self.state_store.set_playback(value.clone());
        Versioned { version, value }
    }

    /// Tells listeners the loaded track moved on, without a new snapshot.
    pub(super) fn publish_position(&mut self) {
        let Transport::Loaded(loaded) = &self.transport else {
            return;
        };
        self.store_position(Some(PlaybackPosition {
            playback_id: loaded.id,
            position_ms: loaded.position_ms(),
            seek_count: self.seek_count,
        }));
        self.state_store.notify(Notification::PositionChanged);
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
        self.state_store.playback().value.base().can_go_previous
    }

    pub(super) fn publish_queue(&mut self) -> Versioned<QueueState> {
        self.prune_unavailable();
        let value = QueueState::of(&self.queue, &self.tracks, self.previous_queue.is_some());
        let version = self.state_store.set_queue(value.clone());
        Versioned { version, value }
    }

    pub(super) fn queue_snapshot(&self) -> Versioned<QueueState> {
        self.state_store.queue()
    }

    /// Publishes a queue change, and refreshes the transport so previous/next availability
    /// follows it even while paused.
    pub(super) fn queue_changed(&mut self, changed: bool) -> Versioned<QueueState> {
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
    ) -> Result<bool, CommandError> {
        if matches!(self.transport, Transport::Loading(_)) {
            return Err(CommandError::QueueBusy);
        }
        edit(&mut self.queue)
            .inspect_err(|cause| log::warn!("playback.queue.edit_failed cause={cause}"))
            .map_err(|_| CommandError::QueueItemNotFound)
    }
}
