//! "Play from here": the contexts a playback queue can be built from.
//!
//! Every way of starting library playback is a variant of `PlaybackContext`, so a new one
//! (artist, playlist, smart playlist) adds a variant, not a new command.

use serde::Deserialize;

use crate::ids::AlbumId;
use crate::library::read::lists::SortDirection;
use crate::library::read::tracks::TrackSortKey;

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
