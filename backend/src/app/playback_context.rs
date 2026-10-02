//! "Play from here": turns a library context and a start track into a playback queue.
//!
//! Every way of starting library playback is a variant of `PlaybackContext`, so a new one
//! (artist, playlist, smart playlist) adds a variant and a resolver, not a new command.

use serde::Deserialize;

use crate::audio::playback::{PlaybackItemSeed, PlaybackServiceError, SourceFacts};
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
    /// Exactly these library tracks in this order: how a replaced queue is put back.
    TrackIds { track_ids: Vec<String> },
    /// The tracks list as currently filtered and sorted.
    Tracks {
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    },
}

/// Reads the context's tracks from the library. Blocking: call it off the async runtime.
pub fn resolve(
    library: &LibraryStore,
    context: &PlaybackContext,
    start_track_id: Option<&str>,
) -> Result<(Vec<PlaybackItemSeed>, usize), PlaybackServiceError> {
    let PlaybackSelection {
        tracks,
        start_index,
    } = match context {
        PlaybackContext::Album { key } => library.playback_for_album(key, start_track_id),
        PlaybackContext::TrackIds { track_ids } => {
            library.playback_for_track_ids(track_ids, start_track_id)
        }
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
    }?;
    Ok((tracks.into_iter().map(seed).collect(), start_index))
}

/// Reads one library track as a queue item. Blocking: call it off the async runtime.
pub fn resolve_track(
    library: &LibraryStore,
    track_id: &str,
) -> Result<PlaybackItemSeed, PlaybackServiceError> {
    Ok(seed(library.playback_for_track(track_id)?))
}

fn seed(track: PlayableTrack) -> PlaybackItemSeed {
    PlaybackItemSeed {
        track_id: Some(track.track_id),
        file: track.file,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_artist: track.album_artist,
        artwork: track.artwork,
        duration_ms: track.duration_ms,
        track_number: track.track_number,
        disc_number: track.disc_number,
        year: track.year,
        album_key: track.album_key,
        album_track_count: track.album_track_count,
        source: SourceFacts {
            format: track.file_format,
            bit_depth: track.bit_depth,
            bitrate_kbps: track.bitrate_kbps,
        },
    }
}
