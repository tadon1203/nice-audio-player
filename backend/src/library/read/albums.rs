//! The albums: their DTOs, the Albums list and the list of one Album Artist's albums, their letter
//! indexes (by name, or by year), the details of one album, and the tracks of one album.

use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, artist_id_column, track_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::artists::AlbumArtistReference;
use crate::library::read::artwork::{ArtworkRef, artwork_ref};
use crate::library::read::lists::{
    Filter, LetterIndexEntry, ListRequest, Listing, SortDirection, SortSpec, letter_entries,
    name_index, order_by,
};
use crate::library::read::tracks::{
    TrackCommonFields, TrackState, non_blank, playable_file_condition, track_state,
};
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AlbumSortKey {
    Title,
    Artist,
    Year,
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtistAlbumSortKey {
    Year,
    Title,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumListItem {
    pub id: AlbumId,
    pub title: String,
    pub album_artist: AlbumArtistReference,
    pub artwork: Option<ArtworkRef>,
    pub year: Option<i32>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDetails {
    pub summary: AlbumListItem,
    pub date: Option<String>,
    pub track_count: u64,
    pub duration_ms: Option<u64>,
    pub first_playable_track_id: Option<TrackId>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTrackListItem {
    #[serde(flatten)]
    pub core: TrackCommonFields,
    pub state: TrackState,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub sample_rate: Option<u32>,
}

/// An album's tracks in playing order: by disc, then track, unnumbered ones last.
pub(crate) const ALBUM_ORDER: &str = "COALESCE(source_metadata.disc_number, 2147483647),
     COALESCE(source_metadata.track_number, 2147483647), source_metadata.track_id";

/// The sort of each key of the Albums list. The year sort has no letter index: it has its own, by
/// year (see `year_index`).
const ALBUM_SORT_TITLE: SortSpec = SortSpec {
    unknown: Some("album.title_sort = ''"),
    terms: &[
        "album.title_sort",
        "album.title",
        "album.album_artist_sort",
        "album.album_artist",
        "album.id",
    ],
    index_column: Some("album.title_sort"),
};
const ALBUM_SORT_ARTIST: SortSpec = SortSpec {
    unknown: Some("album.album_artist_sort = ''"),
    terms: &[
        "album.album_artist_sort",
        "album.album_artist",
        "album.title_sort",
        "album.title",
        "album.id",
    ],
    index_column: Some("album.album_artist_sort"),
};
const ALBUM_SORT_YEAR: SortSpec = SortSpec {
    unknown: Some("album.year IS NULL"),
    terms: &[
        "album.year",
        "album.title_sort",
        "album.title",
        "album.album_artist_sort",
        "album.album_artist",
        "album.id",
    ],
    index_column: None,
};

/// The sort of each key of one Album Artist's albums.
const ARTIST_ALBUM_SORT_TITLE: SortSpec = SortSpec {
    unknown: Some("album.title_sort = ''"),
    terms: &["album.title_sort", "album.title", "album.id"],
    index_column: None,
};
const ARTIST_ALBUM_SORT_YEAR: SortSpec = SortSpec {
    unknown: Some("album.year IS NULL"),
    terms: &["album.year", "album.title_sort", "album.title", "album.id"],
    index_column: None,
};

/// The columns of an album list item, read by `album_row`.
const ALBUM_COLUMNS: &str = "album.title AS title, album.album_artist AS album_artist,
     album.year AS year, artwork.hash AS artwork_hash, artwork.mime AS artwork_mime_type,
     album.artist_id AS album_artist_id, album.id AS album_id,
     artwork.has_thumbnail AS artwork_has_thumbnail";
const ALBUM_FROM: &str =
    "FROM albums album LEFT JOIN artwork artwork ON artwork.hash = album.cover_artwork_hash";

/// The columns of an album track list item, read by `album_track_row`.
const ALBUM_TRACK_COLUMNS: &str = "track.id AS track_id, source_metadata.title AS title,
     source_metadata.artist AS artist, source_metadata.track_number AS track_number,
     source_metadata.disc_number AS disc_number, source_metadata.file_format AS file_format,
     source_metadata.bit_depth AS bit_depth, source_metadata.sample_rate AS sample_rate,
     source_metadata.duration_ms AS duration_ms, file.availability AS availability,
     file.inspection_status AS inspection_status, artwork.hash AS artwork_hash,
     artwork.mime AS artwork_mime_type, artwork.has_thumbnail AS artwork_has_thumbnail";
const ALBUM_TRACK_FROM: &str = "FROM track_source_metadata source_metadata
     JOIN tracks track ON track.id = source_metadata.track_id
     JOIN library_files file ON file.id = track.file_id
     LEFT JOIN artwork artwork ON artwork.hash = source_metadata.artwork_hash";

fn album_sort(sort: AlbumSortKey) -> &'static SortSpec {
    match sort {
        AlbumSortKey::Title => &ALBUM_SORT_TITLE,
        AlbumSortKey::Artist => &ALBUM_SORT_ARTIST,
        AlbumSortKey::Year => &ALBUM_SORT_YEAR,
    }
}

fn artist_album_sort(sort: ArtistAlbumSortKey) -> &'static SortSpec {
    match sort {
        ArtistAlbumSortKey::Title => &ARTIST_ALBUM_SORT_TITLE,
        ArtistAlbumSortKey::Year => &ARTIST_ALBUM_SORT_YEAR,
    }
}

/// The Albums list: one row per album, filtered by `search`.
pub(crate) fn album_listing(
    search: Option<&str>,
    sort: AlbumSortKey,
    direction: SortDirection,
) -> Listing {
    Listing {
        columns: ALBUM_COLUMNS,
        from: ALBUM_FROM,
        filter: Filter::default().search("album.search_text", search),
        order: order_by(album_sort(sort), direction),
    }
}

/// The albums of one Album Artist, filtered by `search`.
pub(crate) fn artist_album_listing(
    artist: ArtistId,
    search: Option<&str>,
    sort: ArtistAlbumSortKey,
    direction: SortDirection,
) -> Listing {
    Listing {
        columns: ALBUM_COLUMNS,
        from: ALBUM_FROM,
        filter: Filter::default()
            .equals("album.artist_id", artist.to_hex())
            .search("album.search_text", search),
        order: order_by(artist_album_sort(sort), direction),
    }
}

/// The tracks of one album, in playing order.
pub(crate) fn album_track_listing(album: AlbumId) -> Listing {
    Listing {
        columns: ALBUM_TRACK_COLUMNS,
        from: ALBUM_TRACK_FROM,
        filter: Filter::default().equals("source_metadata.album_id", album.to_hex()),
        order: ALBUM_ORDER.to_owned(),
    }
}

/// One album of the Albums list, or of one Album Artist.
pub(crate) fn album_row(row: &Row<'_>) -> rusqlite::Result<AlbumListItem> {
    Ok(AlbumListItem {
        id: album_id_column(row, "album_id")?,
        title: row.get("title")?,
        album_artist: AlbumArtistReference {
            id: artist_id_column(row, "album_artist_id")?,
            name: row.get("album_artist")?,
        },
        year: row.get("year")?,
        artwork: artwork_ref(
            row.get("artwork_hash")?,
            row.get("artwork_mime_type")?,
            row.get("artwork_has_thumbnail")?,
        ),
    })
}

/// One track of one album's track list.
pub(crate) fn album_track_row(row: &Row<'_>) -> rusqlite::Result<AlbumTrackListItem> {
    let artist: String = row.get("artist")?;
    let number = |column: &str| -> rusqlite::Result<Option<u32>> {
        Ok(row.get::<_, Option<i64>>(column)?.map(|value| value as u32))
    };
    Ok(AlbumTrackListItem {
        core: TrackCommonFields {
            id: track_id_column(row, "track_id")?,
            title: row.get("title")?,
            artist: (!artist.is_empty()).then_some(artist),
            duration_ms: row
                .get::<_, Option<i64>>("duration_ms")?
                .map(|value| value as u64),
            artwork: artwork_ref(
                row.get("artwork_hash")?,
                row.get("artwork_mime_type")?,
                row.get("artwork_has_thumbnail")?,
            ),
        },
        state: track_state(row.get("availability")?, row.get("inspection_status")?),
        track_number: number("track_number")?,
        disc_number: number("disc_number")?,
        file_format: non_blank(row.get("file_format")?),
        bit_depth: number("bit_depth")?,
        sample_rate: number("sample_rate")?,
    })
}

/// The letter index of the Albums list: by name, or by year.
pub(crate) fn album_index(
    connection: &Connection,
    request: &ListRequest<AlbumSortKey>,
) -> Result<Vec<LetterIndexEntry>> {
    let listing = album_listing(request.search.as_deref(), request.sort, request.direction);
    Ok(match album_sort(request.sort).index_column {
        Some(column) => name_index(connection, &listing, column, request.direction)?,
        None => year_index(connection, &listing, request.direction)?,
    })
}

/// The letter index of albums by year, newest or oldest first as the list is, with the undated last.
fn year_index(
    connection: &Connection,
    listing: &Listing,
    direction: SortDirection,
) -> Result<Vec<LetterIndexEntry>> {
    letter_entries(
        connection,
        listing,
        "album.year",
        ("album.year IS NOT NULL", "album.year IS NULL"),
        direction,
        str::to_owned,
    )
}

/// The details of an album: its summary row, and its tracks for the counts.
pub(crate) fn album_details(connection: &Connection, album_id: AlbumId) -> Result<AlbumDetails> {
    let album_hex = album_id.to_hex();
    let summary: AlbumListItem = connection
        .query_row(
            &format!("SELECT {ALBUM_COLUMNS} {ALBUM_FROM} WHERE album.id = ?1"),
            params![album_hex],
            album_row,
        )
        .optional()?
        .ok_or(LibraryError::AlbumNotFound)?;
    let in_album = "source_metadata.album_id = ?1";
    let playable_file = playable_file_condition();
    let (count, duration, year, date, playable): (
        i64,
        Option<i64>,
        Option<i32>,
        Option<String>,
        Option<i64>,
    ) = connection.query_row(
        &format!(
            "SELECT COUNT(*),
                CASE WHEN COUNT(source_metadata.duration_ms) = COUNT(*)
                     THEN SUM(source_metadata.duration_ms) END,
                MIN(source_metadata.year),
                (SELECT source_metadata.date FROM track_source_metadata source_metadata
                  WHERE {in_album} AND trim(COALESCE(source_metadata.date, '')) <> ''
                  ORDER BY {ALBUM_ORDER} LIMIT 1),
                (SELECT source_metadata.track_id FROM track_source_metadata source_metadata
                  JOIN tracks track ON track.id = source_metadata.track_id
                  JOIN library_files file ON file.id = track.file_id
                  WHERE {in_album} AND {playable_file}
                  ORDER BY {ALBUM_ORDER} LIMIT 1)
             FROM track_source_metadata source_metadata WHERE {in_album}"
        ),
        params![album_hex],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )?;
    if count == 0 {
        return Err(LibraryError::AlbumNotFound);
    }
    Ok(AlbumDetails {
        summary: AlbumListItem { year, ..summary },
        date,
        track_count: count as u64,
        duration_ms: duration.map(|value| value as u64),
        first_playable_track_id: playable.and_then(TrackId::try_from_rowid),
    })
}
