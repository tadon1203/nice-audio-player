//! The Album Artists: their DTOs, the Album Artists list, its letter index, and one Album Artist's
//! row. `AlbumArtistReference` is here because a track and an album both name their Album Artist
//! with it.

use crate::ids::{ArtistId, artist_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::artwork::{ArtworkRef, artwork_ref};
use crate::library::read::lists::{
    Filter, LetterIndexEntry, ListRequest, Listing, SortDirection, SortSpec, name_index, order_by,
};
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtistSortKey {
    Artist,
    AlbumCount,
    TrackCount,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumArtistReference {
    pub id: ArtistId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistListItem {
    pub id: ArtistId,
    pub name: String,
    pub artwork: Option<ArtworkRef>,
    pub album_count: u64,
    pub track_count: u64,
}

/// The sort of each key of the Album Artists list. Only the name sort has a letter index.
const ARTIST_SORT_NAME: SortSpec = SortSpec {
    unknown: Some("artist.name_sort = ''"),
    terms: &["artist.name_sort", "artist.name", "artist.id"],
    index_column: Some("artist.name_sort"),
};
const ARTIST_SORT_ALBUM_COUNT: SortSpec = SortSpec {
    unknown: None,
    terms: &[
        "artist.album_count",
        "artist.name_sort",
        "artist.name",
        "artist.id",
    ],
    index_column: None,
};
const ARTIST_SORT_TRACK_COUNT: SortSpec = SortSpec {
    unknown: None,
    terms: &[
        "artist.track_count",
        "artist.name_sort",
        "artist.name",
        "artist.id",
    ],
    index_column: None,
};

/// The columns of an Album Artist list item, read by `artist_row`.
const ARTIST_COLUMNS: &str = "artist.id AS artist_id, artist.name AS name,
     artist.album_count AS album_count, artist.track_count AS track_count,
     artwork.hash AS artwork_hash, artwork.mime AS artwork_mime_type,
     artwork.has_thumbnail AS artwork_has_thumbnail";
const ARTIST_FROM: &str =
    "FROM artists artist LEFT JOIN artwork artwork ON artwork.hash = artist.cover_artwork_hash";

fn artist_sort(sort: ArtistSortKey) -> &'static SortSpec {
    match sort {
        ArtistSortKey::Artist => &ARTIST_SORT_NAME,
        ArtistSortKey::AlbumCount => &ARTIST_SORT_ALBUM_COUNT,
        ArtistSortKey::TrackCount => &ARTIST_SORT_TRACK_COUNT,
    }
}

/// The Album Artists list: one row per Album Artist, filtered by `search`.
pub(crate) fn artist_listing(
    search: Option<&str>,
    sort: ArtistSortKey,
    direction: SortDirection,
) -> Listing {
    Listing {
        columns: ARTIST_COLUMNS,
        from: ARTIST_FROM,
        filter: Filter::default().search("artist.search_text", search),
        order: order_by(artist_sort(sort), direction),
    }
}

/// One Album Artist of the Album Artists list.
pub(crate) fn artist_row(row: &Row<'_>) -> rusqlite::Result<ArtistListItem> {
    Ok(ArtistListItem {
        id: artist_id_column(row, "artist_id")?,
        name: row.get("name")?,
        album_count: row.get::<_, i64>("album_count")? as u64,
        track_count: row.get::<_, i64>("track_count")? as u64,
        artwork: artwork_ref(
            row.get("artwork_hash")?,
            row.get("artwork_mime_type")?,
            row.get("artwork_has_thumbnail")?,
        ),
    })
}

/// The letter index of the Album Artists list. Only a list by name has one.
pub(crate) fn artist_index(
    connection: &Connection,
    request: &ListRequest<ArtistSortKey>,
) -> Result<Vec<LetterIndexEntry>> {
    let Some(column) = artist_sort(request.sort).index_column else {
        return Ok(Vec::new());
    };
    let listing = artist_listing(request.search.as_deref(), request.sort, request.direction);
    name_index(connection, &listing, column, request.direction)
}

/// One Album Artist's row, by its ID.
pub(crate) fn artist_by_id(connection: &Connection, artist: ArtistId) -> Result<ArtistListItem> {
    connection
        .query_row(
            &format!("SELECT {ARTIST_COLUMNS} {ARTIST_FROM} WHERE artist.id = ?1"),
            params![artist.to_hex()],
            artist_row,
        )
        .optional()?
        .ok_or(LibraryError::ArtistNotFound)
}
