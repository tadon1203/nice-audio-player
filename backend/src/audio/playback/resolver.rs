//! Where queue entries get their metadata. The queue holds track ids only; the tracks are read
//! when something needs them (the item that plays, the rows on display), through a small cache
//! so scrolling and republishing the same window never reads the library twice.

use parking_lot::Mutex;
use std::collections::HashMap;

use crate::errors::CommandError;
use crate::ids::TrackId;
use crate::library::tracks::PlayableTrack;

/// The library, as far as playback is concerned.
pub trait TrackSource: Send + Sync {
    /// The tracks with these ids, in the order asked: `None` for one that is gone or cannot be
    /// played any more. A failure to read the library is an error, not a missing track.
    fn tracks(&self, track_ids: &[TrackId]) -> Result<Vec<Option<PlayableTrack>>, CommandError>;
}

/// A source that knows no tracks, for when the library is unavailable.
pub(crate) struct NoTracks;

impl TrackSource for NoTracks {
    fn tracks(&self, track_ids: &[TrackId]) -> Result<Vec<Option<PlayableTrack>>, CommandError> {
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
    ) -> Result<Vec<Option<PlayableTrack>>, CommandError> {
        let mut found: Vec<Option<PlayableTrack>> = {
            let cache = self.cache.lock();
            track_ids.iter().map(|id| cache.get(id).cloned()).collect()
        };
        let (missing, ids): (Vec<usize>, Vec<TrackId>) = track_ids
            .iter()
            .copied()
            .enumerate()
            .zip(&found)
            .filter(|(_, cached)| cached.is_none())
            .map(|((index, id), _)| (index, id))
            .unzip();
        if missing.is_empty() {
            return Ok(found);
        }
        let read = self.source.tracks(&ids).inspect_err(|error| {
            log::error!("playback.tracks_unavailable error={error:?}");
        })?;
        let mut cache = self.cache.lock();
        if cache.len() + read.len() > CACHE_LIMIT {
            cache.clear();
        }
        for (index, track) in missing.into_iter().zip(read) {
            if let Some(track) = track {
                cache.insert(track.id(), track.clone());
                if let Some(slot) = found.get_mut(index) {
                    *slot = Some(track);
                }
            }
        }
        Ok(found)
    }

    pub fn resolve_one(&self, track_id: TrackId) -> Result<Option<PlayableTrack>, CommandError> {
        Ok(self.resolve(&[track_id])?.pop().flatten())
    }

    /// Forgets what was read, so the next read sees the library as it is then.
    pub fn forget(&self) {
        self.cache.lock().clear();
    }
}
