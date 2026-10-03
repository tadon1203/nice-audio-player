//! Where queue entries get their metadata. The queue holds track ids only; the tracks are read
//! when something needs them (the item that plays, the rows on display), through a small cache
//! so scrolling and republishing the same window never reads the library twice.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::library::store::PlayableTrack;

/// The library, as far as playback is concerned.
pub trait TrackSource: Send + Sync {
    /// The tracks with these ids, in the order asked: `None` for one that is gone or cannot be
    /// played any more.
    fn tracks(&self, track_ids: &[&str]) -> Vec<Option<PlayableTrack>>;
}

/// A source that knows no tracks, for when the library is unavailable.
pub struct NoTracks;

impl TrackSource for NoTracks {
    fn tracks(&self, track_ids: &[&str]) -> Vec<Option<PlayableTrack>> {
        vec![None; track_ids.len()]
    }
}

/// More resolved tracks than this are dropped, so a long scroll cannot grow the cache with the
/// library.
const CACHE_LIMIT: usize = 2_048;

pub struct TrackResolver {
    source: Box<dyn TrackSource>,
    cache: Mutex<HashMap<String, PlayableTrack>>,
}

impl TrackResolver {
    pub fn new(source: Box<dyn TrackSource>) -> Self {
        Self {
            source,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// The tracks with these ids, in the order asked; `None` where the library has none.
    pub fn resolve(&self, track_ids: &[&str]) -> Vec<Option<PlayableTrack>> {
        let mut found: Vec<Option<PlayableTrack>> = {
            let cache = self.lock();
            track_ids.iter().map(|id| cache.get(*id).cloned()).collect()
        };
        let missing: Vec<usize> = (0..found.len()).filter(|i| found[*i].is_none()).collect();
        if missing.is_empty() {
            return found;
        }
        let ids: Vec<&str> = missing.iter().map(|i| track_ids[*i]).collect();
        let read = self.source.tracks(&ids);
        let mut cache = self.lock();
        if cache.len() + read.len() > CACHE_LIMIT {
            cache.clear();
        }
        for (index, track) in missing.into_iter().zip(read) {
            if let Some(track) = track {
                cache.insert(track.track_id.clone(), track.clone());
                found[index] = Some(track);
            }
        }
        found
    }

    pub fn resolve_one(&self, track_id: &str) -> Option<PlayableTrack> {
        self.resolve(&[track_id]).pop().flatten()
    }

    /// Forgets what was read, so the next read sees the library as it is then.
    pub fn forget(&self) {
        self.lock().clear();
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, PlayableTrack>> {
        self.cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
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
    use crate::media::validation::ValidatedAudioFile;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    /// A library of hand-made tracks that counts how often it is read.
    #[derive(Default)]
    pub struct FakeTracks {
        tracks: Mutex<HashMap<String, PlayableTrack>>,
        reads: AtomicUsize,
    }

    impl FakeTracks {
        pub fn add(&self, track: PlayableTrack) {
            self.tracks
                .lock()
                .unwrap()
                .insert(track.track_id.clone(), track);
        }

        pub fn remove(&self, track_id: &str) {
            self.tracks.lock().unwrap().remove(track_id);
        }

        /// How many ids the library was asked for.
        pub fn reads(&self) -> usize {
            self.reads.load(Ordering::SeqCst)
        }
    }

    impl TrackSource for Arc<FakeTracks> {
        fn tracks(&self, track_ids: &[&str]) -> Vec<Option<PlayableTrack>> {
            self.reads.fetch_add(track_ids.len(), Ordering::SeqCst);
            let tracks = self.tracks.lock().unwrap();
            track_ids
                .iter()
                .map(|id| tracks.get(*id).cloned())
                .collect()
        }
    }

    pub fn resolver_of(tracks: &Arc<FakeTracks>) -> Arc<TrackResolver> {
        Arc::new(TrackResolver::new(Box::new(Arc::clone(tracks))))
    }

    /// A track that is only a name and a path.
    pub fn track(id: &str, file: ValidatedAudioFile) -> PlayableTrack {
        PlayableTrack {
            track_id: id.to_owned(),
            title: file.file_name.clone(),
            file,
            artist: None,
            album: None,
            album_artist: None,
            artwork: None,
            duration_ms: None,
            track_number: None,
            disc_number: None,
            year: None,
            album_key: None,
            album_track_count: None,
            file_format: None,
            bit_depth: None,
            bitrate_kbps: None,
        }
    }
}
