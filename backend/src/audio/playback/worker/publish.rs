//! Rendering the transport and queue into snapshots and telling listeners.

use super::*;

impl PlaybackWorker {
    /// What listeners see, drawn from the transport, the queue and the volume.
    pub(super) fn render(&self) -> PlaybackSnapshot {
        let mut base = SnapshotBase::new(self.volume_state, self.output_selection.clone());
        base.revision = self.revision;
        match &self.transport {
            Transport::Idle | Transport::Loading(_) => PlaybackSnapshot::Stopped {
                base,
                item: self.last_item.clone(),
            },
            Transport::Loaded(loaded) => {
                base.can_go_previous = self.loaded_can_go_previous(loaded);
                base.can_go_next = self.queue.can_go_next();
                let session = self.render_session(loaded);
                if loaded.paused {
                    PlaybackSnapshot::Paused { base, session }
                } else {
                    PlaybackSnapshot::Playing { base, session }
                }
            }
            Transport::Failed { id, code, skipping } => {
                base.can_go_previous = self.queue.can_go_previous();
                base.can_go_next = self.queue.can_go_next();
                PlaybackSnapshot::Failed {
                    base,
                    item: self
                        .queue
                        .current()
                        .and_then(|entry| self.item_of(entry))
                        .or_else(|| self.last_item.clone()),
                    playback_id: id.map(|id| id.to_string()),
                    error: code.clone(),
                    skipping: *skipping,
                }
            }
        }
    }

    pub(super) fn render_session(&self, loaded: &Loaded) -> ActiveSession {
        let config = &loaded.output.config;
        let processing = PlaybackProcessingInfo::from_plan(config.processing_plan);
        ActiveSession {
            item: loaded.item.clone(),
            playback_id: loaded.id.to_string(),
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

    /// Renders the transport as a new revision and tells listeners. The snapshot carries the
    /// newest position too, so a listener that joins here starts from the right place.
    pub(super) fn publish_state(&mut self) -> PlaybackSnapshot {
        if let Transport::Loaded(loaded) = &mut self.transport {
            if !loaded.paused {
                loaded.position.frame = loaded.sample_position();
            }
        }
        self.revision = self.revision.saturating_add(1);
        let snapshot = self.render();
        self.store_position(snapshot.session().map(ActiveSession::position));
        *self
            .snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        self.events.emit(BackendEvent::PlaybackChanged);
        snapshot
    }

    /// Tells listeners the loaded track moved on, without a new snapshot.
    pub(super) fn publish_position(&mut self) {
        let Transport::Loaded(loaded) = &self.transport else {
            return;
        };
        self.store_position(Some(PlaybackPosition {
            playback_id: loaded.id.to_string(),
            position_ms: loaded.position_ms(),
            seek_revision: self.seek_revision,
        }));
        self.events.emit(BackendEvent::PlaybackPositionChanged);
    }

    /// Previous is offered when the queue has an earlier item, or the track has played long
    /// enough that Previous restarts it.
    pub(super) fn loaded_can_go_previous(&self, loaded: &Loaded) -> bool {
        self.queue.can_go_previous()
            || previous_restarts_track(loaded.position_ms(), loaded.position.duration_ms)
    }

    fn store_position(&self, position: Option<PlaybackPosition>) {
        *self
            .position
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = position;
    }

    /// Whether Previous is offered, as listeners last saw it.
    pub(super) fn published_can_go_previous(&self) -> bool {
        self.snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .base()
            .can_go_previous
    }

    pub(super) fn publish_queue(&mut self) -> PlaybackQueueSnapshot {
        self.prune_unavailable();
        self.next_queue_revision = self.next_queue_revision.saturating_add(1);
        let snapshot = PlaybackQueueSnapshot::of(
            self.next_queue_revision,
            &self.queue,
            &self.tracks,
            self.previous_queue.is_some(),
        );
        *self
            .queue_snapshot
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        self.events.emit(BackendEvent::PlaybackQueueChanged);
        snapshot
    }

    pub(super) fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
        self.queue_snapshot
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Publishes a queue change, and refreshes the transport so previous/next availability
    /// follows it even while paused.
    pub(super) fn queue_changed(&mut self, changed: bool) -> PlaybackQueueSnapshot {
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
        edit(&mut self.queue).map_err(|_| PlaybackServiceError::QueueItemNotFound)
    }
}
