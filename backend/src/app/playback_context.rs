//! "Play from here": turns a library context and a start track into the ids a playback queue
//! is built from.
//!
//! Every way of starting library playback is a variant of `PlaybackContext`, so a new one
//! (artist, playlist, smart playlist) adds a variant and a resolver, not a new command.

use serde::Deserialize;

use crate::audio::playback::{PlaybackServiceError, TrackSource};
use crate::library::{
    models::{LibraryAlbumKey, LibrarySortDirection, LibraryTrackSortKey},
    store::{LibraryStore, PlayableTrack, PlaybackSelection},
};

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackContext {
    /// An album in disc and track order.
    Album { key: LibraryAlbumKey },
    /// The tracks list as currently filtered and sorted.
    Tracks {
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    },
}

/// Reads the ids of the context's playable tracks from the library, in playing order, and where
/// to start. The tracks themselves are read when the queue needs them. Blocking: call it off
/// the async runtime.
pub fn resolve(
    library: &LibraryStore,
    context: &PlaybackContext,
    start_track_id: Option<&str>,
) -> Result<PlaybackSelection, PlaybackServiceError> {
    Ok(match context {
        PlaybackContext::Album { key } => library.playback_for_album(key, start_track_id),
        PlaybackContext::Tracks {
            search,
            sort_key,
            sort_direction,
        } => library.playback_for_tracks(
            search.as_deref(),
            *sort_key,
            *sort_direction,
            start_track_id,
        ),
    }?)
}

/// Reads one library track, which must be playable. Blocking: call it off the async runtime.
pub fn resolve_track(
    library: &LibraryStore,
    track_id: &str,
) -> Result<PlayableTrack, PlaybackServiceError> {
    Ok(library.playback_for_track(track_id)?)
}

/// The library as the playback queue reads its tracks.
pub struct LibraryTracks(pub LibraryStore);

impl TrackSource for LibraryTracks {
    fn tracks(&self, track_ids: &[&str]) -> Vec<Option<PlayableTrack>> {
        self.0.playable_tracks(track_ids).unwrap_or_else(|error| {
            log::error!("playback.tracks_unavailable error={error:?}");
            vec![None; track_ids.len()]
        })
    }
}
