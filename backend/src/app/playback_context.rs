//! "Play from here": the contexts a playback queue can be built from.
//!
//! Every way of starting library playback is a variant of `PlaybackContext`, so a new one
//! (artist, playlist, smart playlist) adds a variant, not a new command.

use serde::Deserialize;

use crate::audio::playback::TrackSource;
use crate::errors::CommandError;
use crate::ids::{AlbumId, TrackId};
use crate::library::{
    Library,
    models::{SortDirection, TrackSortKey},
    tracks::PlayableTrack,
};

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackContext {
    /// An album in disc and track order, by its ID.
    Album { album_id: AlbumId },
    /// The tracks list as currently filtered and sorted.
    Tracks {
        search: Option<String>,
        sort: TrackSortKey,
        direction: SortDirection,
    },
}

/// The library as the playback queue reads its tracks.
pub(crate) struct LibraryTracks(pub Library);

impl TrackSource for LibraryTracks {
    fn tracks(&self, track_ids: &[TrackId]) -> Result<Vec<Option<PlayableTrack>>, CommandError> {
        self.0.playable_tracks(track_ids)
    }
}
