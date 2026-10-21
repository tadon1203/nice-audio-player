//! Where queue entries get their metadata. The queue holds track ids only; the tracks are read
//! when something needs them (the item that plays, the rows on display), through a small cache
//! so scrolling and republishing the same window never reads the library twice.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::audio::playback::PlaybackServiceError;
use crate::ids::TrackId;
use crate::library::store::PlayableTrack;
use crate::sync;

/// The library, as far as playback is concerned.
pub trait TrackSource: Send + Sync {
    /// The tracks with these ids, in the order asked: `None` for one that is gone or cannot be
    /// played any more. A failure to read the library is an error, not a missing track.
    fn tracks(
        &self,
        track_ids: &[TrackId],
    ) -> Result<Vec<Option<PlayableTrack>>, PlaybackServiceError>;
}

/// A source that knows no tracks, for when the library is unavailable.
pub struct NoTracks;

impl TrackSource for NoTracks {
    fn tracks(
        &self,
        track_ids: &[TrackId],
    ) -> Result<Vec<Option<PlayableTrack>>, PlaybackServiceError> {
        Ok(vec![None; track_ids.len()])
    }
}

/// More resolved tracks than this are dropped, so a long scroll cannot grow the cache with the
/// library.
const CACHE_LIMIT: usize = 2_048;

pub struct TrackResolver {
    source: Box<dyn TrackSource>,
    cache: Mutex<HashMap<TrackId, PlayableTrack>>,
}

impl TrackResolver {
    pub fn new(source: Box<dyn TrackSource>) -> Self {
        Self {
            source,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// The tracks with these ids, in the order asked; `None` where the library has none. A failed
    /// read is logged and returned, so the caller can tell it from a track that is gone.
    pub fn resolve(
        &self,
        track_ids: &[TrackId],
    ) -> Result<Vec<Option<PlayableTrack>>, PlaybackServiceError> {
        let mut found: Vec<Option<PlayableTrack>> = {
            let cache = sync::lock(&self.cache);
            track_ids.iter().map(|id| cache.get(id).cloned()).collect()
        };
        let missing: Vec<usize> = (0..found.len()).filter(|i| found[*i].is_none()).collect();
        if missing.is_empty() {
            return Ok(found);
        }
        let ids: Vec<TrackId> = missing.iter().map(|i| track_ids[*i]).collect();
        let read = self.source.tracks(&ids).inspect_err(|error| {
            log::error!("playback.tracks_unavailable error={error:?}");
        })?;
        let mut cache = sync::lock(&self.cache);
        if cache.len() + read.len() > CACHE_LIMIT {
            cache.clear();
        }
        for (index, track) in missing.into_iter().zip(read) {
            if let Some(track) = track {
                cache.insert(track.id(), track.clone());
                found[index] = Some(track);
            }
        }
        Ok(found)
    }

    pub fn resolve_one(
        &self,
        track_id: TrackId,
    ) -> Result<Option<PlayableTrack>, PlaybackServiceError> {
        Ok(self.resolve(&[track_id])?.pop().flatten())
    }

    /// Forgets what was read, so the next read sees the library as it is then.
    pub fn forget(&self) {
        sync::lock(&self.cache).clear();
    }
}

impl std::fmt::Debug for TrackResolver {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TrackResolver")
    }
}

#[cfg(test)]
pub(super) mod testing {
    use super::*;
    use crate::errors::CommonError;
    use crate::media::validation::ValidatedAudioFile;
    use crate::sync;
    use std::sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };

    /// A library of hand-made tracks that counts how often it is read.
    #[derive(Default)]
    pub struct FakeTracks {
        tracks: Mutex<HashMap<TrackId, PlayableTrack>>,
        reads: AtomicUsize,
        failing: AtomicBool,
    }

    impl FakeTracks {
        pub fn add(&self, track: PlayableTrack) {
            sync::lock(&self.tracks).insert(track.id(), track);
        }

        pub fn remove(&self, track_id: TrackId) {
            sync::lock(&self.tracks).remove(&track_id);
        }

        /// Makes every read fail, as a database error would, until it is switched back.
        pub fn fail_reads(&self, failing: bool) {
            self.failing.store(failing, Ordering::SeqCst);
        }

        /// How many ids the library was asked for.
        pub fn reads(&self) -> usize {
            self.reads.load(Ordering::SeqCst)
        }
    }

    impl TrackSource for Arc<FakeTracks> {
        fn tracks(
            &self,
            track_ids: &[TrackId],
        ) -> Result<Vec<Option<PlayableTrack>>, PlaybackServiceError> {
            self.reads.fetch_add(track_ids.len(), Ordering::SeqCst);
            if self.failing.load(Ordering::SeqCst) {
                return Err(PlaybackServiceError::Common {
                    error: CommonError::PersistenceFailed,
                });
            }
            let tracks = sync::lock(&self.tracks);
            Ok(track_ids.iter().map(|id| tracks.get(id).cloned()).collect())
        }
    }

    pub fn resolver_of(tracks: &Arc<FakeTracks>) -> Arc<TrackResolver> {
        Arc::new(TrackResolver::new(Box::new(Arc::clone(tracks))))
    }

    /// A track that is only a name and a path.
    pub fn track(id: TrackId, file: ValidatedAudioFile) -> PlayableTrack {
        PlayableTrack::bare(id, file)
    }
}
