//! Gapless playback: opening the next track while the loaded one plays, and moving on to it the
//! moment the loaded one has been heard to its end.

use super::*;

/// How long before the end of a track the next one is opened. A shorter track opens it right
/// after it has loaded.
pub(super) const PREFETCH_LEAD_MS: u64 = 10_000;

impl PlaybackWorker {
    /// Starts opening the track that follows the loaded one once its end is near.
    pub(super) fn maybe_prefetch(&mut self) {
        let Transport::Loaded(loaded) = &self.transport else {
            return;
        };
        if loaded.prefetch.is_some() || loaded.seek.is_some() || loaded.paused {
            return;
        }
        let Some(duration_ms) = loaded.position.duration_ms else {
            return;
        };
        if duration_ms.saturating_sub(loaded.position_ms()) > PREFETCH_LEAD_MS {
            return;
        }
        let Some(entry) = self.queue.peek_natural().cloned() else {
            return;
        };
        let state = match self.item_of(&entry) {
            Some(item) => {
                match SourceLoad::spawn(
                    item.file.clone(),
                    self.source_load_ids.next(),
                    self.inbox.clone(),
                ) {
                    Ok(load) => PrefetchState::Source { load, item },
                    Err(()) => PrefetchState::Unusable,
                }
            }
            None => PrefetchState::Unusable,
        };
        if let Transport::Loaded(loaded) = &mut self.transport {
            loaded.prefetch = Some(Prefetch {
                entry_id: entry.id,
                state,
            });
        }
    }

    pub(super) fn is_prefetch_load(&self, id: SourceLoadId) -> bool {
        matches!(
            &self.transport,
            Transport::Loaded(Loaded {
                prefetch: Some(Prefetch {
                    state: PrefetchState::Source { load, .. },
                    ..
                }),
                ..
            }) if load.id() == id
        )
    }

    /// The next track's file is open: decode it into a queue the stream plays after the loaded
    /// track, when it has the format the stream was opened for.
    pub(super) fn prefetch_source_loaded(
        &mut self,
        result: Result<CompressedAudioSource, CompressedSourceError>,
    ) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        let Some(Prefetch {
            entry_id,
            state: PrefetchState::Source { load, item },
        }) = loaded.prefetch.take()
        else {
            return;
        };
        load.join();
        let config = loaded.output.config.clone();
        let after = loaded.pipeline.id;
        let unusable = Prefetch {
            entry_id,
            state: PrefetchState::Unusable,
        };
        let Ok(source) = result else {
            loaded.prefetch = Some(unusable);
            return;
        };
        let opened =
            self.open_pipeline(&source, &item.file.extension, PipelineKind::Next { config });
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        loaded.prefetch = Some(match opened {
            Ok(OpenedPipeline {
                pipeline,
                output: OpenedOutput::Queue(queue),
                duration_ms,
                ..
            }) => {
                loaded.output.stream.queue_next(after, queue, pipeline.id);
                Prefetch {
                    entry_id,
                    state: PrefetchState::Ready(PrefetchedTrack {
                        item,
                        source,
                        pipeline,
                        duration_ms,
                        completion_time: None,
                    }),
                }
            }
            Ok(OpenedPipeline { pipeline, .. }) => {
                pipeline.cancel();
                unusable
            }
            // Another format is the expected reason: the stream is reopened for it later.
            Err(_) => unusable,
        });
    }

    /// The decode of the prefetched track failed. It starts the ordinary way, which reports the
    /// failure and moves on.
    pub(super) fn prefetch_unusable(&mut self) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        let Some(prefetch) = loaded.prefetch.take() else {
            return;
        };
        loaded.output.stream.clear_next();
        let entry_id = prefetch.entry_id;
        prefetch.cancel();
        loaded.prefetch = Some(Prefetch {
            entry_id,
            state: PrefetchState::Unusable,
        });
    }

    /// Throws the prefetch away when something other than its track plays next now.
    pub(super) fn revalidate_prefetch(&mut self) {
        let Transport::Loaded(loaded) = &mut self.transport else {
            return;
        };
        let Some(prefetch) = &loaded.prefetch else {
            return;
        };
        if self.queue.peek_natural().map(|entry| entry.id) != Some(prefetch.entry_id) {
            loaded.cancel_prefetch();
        }
    }

    /// The loaded track has been heard to its end: the prefetched one is playing already, so it
    /// becomes the loaded track. Returns false when there is none to move on to.
    pub(super) fn adopt_prefetched(&mut self) -> bool {
        let Transport::Loaded(loaded) = &self.transport else {
            return false;
        };
        let Some(Prefetch {
            entry_id,
            state: PrefetchState::Ready(_),
        }) = &loaded.prefetch
        else {
            return false;
        };
        if self.queue.peek_natural().map(|entry| entry.id) != Some(*entry_id) {
            return false;
        }
        let Transport::Loaded(mut loaded) = std::mem::replace(&mut self.transport, Transport::Idle)
        else {
            return false;
        };
        let Some(Prefetch {
            state: PrefetchState::Ready(next),
            ..
        }) = loaded.prefetch.take()
        else {
            return false;
        };
        let _ = self.queue.advance(AdvanceReason::Natural, &mut self.rng);
        loaded.pipeline.cancel();
        loaded.output.stream.adopt_next(next.pipeline.id);
        self.last_item = Some(next.item.clone());
        self.skipped_in_a_row = 0;
        self.transport = Transport::Loaded(Loaded {
            id: self.ids.next(),
            position: Position::from_start(loaded.output.sample_rate(), next.duration_ms),
            item: next.item,
            source: next.source,
            output: loaded.output,
            pipeline: next.pipeline,
            completion_time: next.completion_time,
            paused: false,
            seek: None,
            prefetch: None,
        });
        self.publish_queue();
        self.publish_state();
        true
    }
}
