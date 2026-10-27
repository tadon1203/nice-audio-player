//! The tracks: their DTOs, the Tracks list and its letter index, one track's properties, and where
//! its file is. Each track's state comes from `track_state`. Every DTO and the playback path use it.
//!
//! Track location is the one place that builds a track's file path. It checks that the file stays
//! inside its Library directory. Every consumer (playback, properties, Show in Explorer, lyrics)
//! uses it, so none can skip the check.

use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, track_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::artists::AlbumArtistReference;
use crate::library::read::artwork::{ArtworkRef, artwork_ref};
use crate::library::read::lists::{
    Filter, LetterIndexEntry, ListRequest, Listing, SortDirection, SortSpec, name_index, order_by,
};
use crate::library::storage::columns::{Availability, InspectionStatus};
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use std::path::{Component, PathBuf};

/// Where a track stands: its file can play, its file is gone, or its file is there but cannot be
/// decoded. Missing wins over unsupported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TrackState {
    Playable,
    Missing,
    Unsupported,
}

#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TrackSortKey {
    Title,
    Artist,
    Album,
    Duration,
}

/// The album a track is filed under, by ID (see `ids.rs`) and as titled, with its Album Artist. A
/// track with no album tag has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackAlbum {
    pub id: AlbumId,
    pub title: String,
    pub artist: AlbumArtistReference,
}

/// What the track DTOs share: the identity and the metadata a row shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackCommonFields {
    pub id: TrackId,
    pub title: String,
    pub artist: Option<String>,
    pub duration_ms: Option<u64>,
    pub artwork: Option<ArtworkRef>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackListItem {
    #[serde(flatten)]
    pub core: TrackCommonFields,
    pub state: TrackState,
    /// `None` for a track with no album tag.
    pub album: Option<TrackAlbum>,
}

/// The tags, audio format and location of one track, as the Properties view lists them.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackProperties {
    pub id: TrackId,
    pub path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub duration_ms: Option<u64>,
    pub file_format: Option<String>,
    pub codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub channel_count: Option<u32>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u32>,
}

/// The state of a track, from its file's availability and inspection. Every DTO's `state` comes
/// from here, and so does the playback path's check that a track can play.
pub(crate) fn track_state(availability: Availability, inspection: InspectionStatus) -> TrackState {
    match (availability, inspection) {
        (Availability::Missing, _) => TrackState::Missing,
        (Availability::Available, InspectionStatus::Indexed) => TrackState::Playable,
        (Availability::Available, InspectionStatus::Unsupported) => TrackState::Unsupported,
    }
}

/// The SQL condition, on the `file` alias of `library_files`, that holds for the files `track_state`
/// calls playable.
pub(crate) fn playable_file_condition() -> String {
    format!(
        "file.availability = '{}' AND file.inspection_status = '{}'",
        Availability::Available.as_str(),
        InspectionStatus::Indexed.as_str()
    )
}

pub(crate) fn non_blank(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

/// The album of a track: `None` for a track with no album tag, which has no album ID either. An
/// album row always comes with its Album Artist, so a missing one is treated as no album.
pub(crate) fn track_album(
    title: String,
    id: AlbumId,
    artist_id: Option<ArtistId>,
    artist_name: Option<String>,
) -> Option<TrackAlbum> {
    if title.is_empty() {
        return None;
    }
    Some(TrackAlbum {
        id,
        title,
        artist: AlbumArtistReference {
            id: artist_id?,
            name: artist_name?,
        },
    })
}

/// The sort of each key of the Tracks list.
const TRACK_SORT_TITLE: SortSpec = SortSpec {
    unknown: Some("source_metadata.title_sort = ''"),
    terms: &[
        "source_metadata.title_sort",
        "source_metadata.title",
        "source_metadata.track_id",
    ],
    index_column: Some("source_metadata.title_sort"),
};
const TRACK_SORT_ARTIST: SortSpec = SortSpec {
    unknown: Some("source_metadata.artist_sort = ''"),
    terms: &[
        "source_metadata.artist_sort",
        "source_metadata.artist",
        "source_metadata.track_id",
    ],
    index_column: Some("source_metadata.artist_sort"),
};
const TRACK_SORT_ALBUM: SortSpec = SortSpec {
    unknown: Some("source_metadata.album_sort = ''"),
    terms: &[
        "source_metadata.album_sort",
        "source_metadata.album",
        "source_metadata.track_id",
    ],
    index_column: Some("source_metadata.album_sort"),
};
const TRACK_SORT_DURATION: SortSpec = SortSpec {
    unknown: Some("source_metadata.duration_ms IS NULL"),
    terms: &["source_metadata.duration_ms", "source_metadata.track_id"],
    index_column: None,
};

fn track_sort(sort: TrackSortKey) -> &'static SortSpec {
    match sort {
        TrackSortKey::Title => &TRACK_SORT_TITLE,
        TrackSortKey::Artist => &TRACK_SORT_ARTIST,
        TrackSortKey::Album => &TRACK_SORT_ALBUM,
        TrackSortKey::Duration => &TRACK_SORT_DURATION,
    }
}

/// The columns of a track list item, read by `track_row`.
const TRACK_COLUMNS: &str = "track.id AS track_id, source_metadata.title AS title,
     source_metadata.artist AS artist, source_metadata.album AS album_title,
     album.album_artist AS album_artist, source_metadata.duration_ms AS duration_ms,
     artwork.hash AS artwork_hash, artwork.mime AS artwork_mime_type,
     file.availability AS availability, file.inspection_status AS inspection_status,
     source_metadata.album_id AS album_id, album.artist_id AS album_artist_id,
     artwork.has_thumbnail AS artwork_has_thumbnail";
const TRACK_FROM: &str = "FROM track_source_metadata source_metadata
     JOIN tracks track ON track.id = source_metadata.track_id
     JOIN library_files file ON file.id = track.file_id
     LEFT JOIN artwork artwork ON artwork.hash = source_metadata.artwork_hash
     LEFT JOIN albums album ON album.id = source_metadata.album_id";

/// The Tracks list: every track, filtered by `search`, in `sort` order.
pub(crate) fn track_listing(
    search: Option<&str>,
    sort: TrackSortKey,
    direction: SortDirection,
) -> Listing {
    Listing {
        columns: TRACK_COLUMNS,
        from: TRACK_FROM,
        filter: Filter::default().search("source_metadata.search_text", search),
        order: order_by(track_sort(sort), direction),
    }
}

/// One track of the Tracks list.
pub(crate) fn track_row(row: &Row<'_>) -> rusqlite::Result<TrackListItem> {
    let artist: String = row.get("artist")?;
    let album = track_album(
        row.get("album_title")?,
        album_id_column(row, "album_id")?,
        row.get::<_, Option<String>>("album_artist_id")?
            .and_then(|hex| ArtistId::from_hex(&hex)),
        row.get("album_artist")?,
    );
    Ok(TrackListItem {
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
        album,
    })
}

/// The letter index of the Tracks list. A list by duration has none.
pub(crate) fn track_index(
    connection: &Connection,
    request: &ListRequest<TrackSortKey>,
) -> Result<Vec<LetterIndexEntry>> {
    let Some(column) = track_sort(request.sort).index_column else {
        return Ok(Vec::new());
    };
    let listing = track_listing(request.search.as_deref(), request.sort, request.direction);
    name_index(connection, &listing, column, request.direction)
}

/// Tags, audio format and the file's path, or `TrackNotFound` for an unknown track.
pub(crate) fn track_properties(connection: &Connection, id: TrackId) -> Result<TrackProperties> {
    let location = track_location(connection, id)?;
    let path = location.path()?.to_string_lossy().into_owned();
    let properties = connection
        .query_row(
            "SELECT file.file_name, source_metadata.tag_title, source_metadata.tag_artist,
                    source_metadata.tag_album, source_metadata.tag_album_artist,
                    source_metadata.track_number, source_metadata.track_total,
                    source_metadata.disc_number, source_metadata.disc_total,
                    source_metadata.genre, source_metadata.date,
                    source_metadata.duration_ms, source_metadata.file_format,
                    source_metadata.codec, source_metadata.sample_rate,
                    source_metadata.channel_count, source_metadata.bit_depth,
                    source_metadata.bitrate_kbps
             FROM tracks track
             JOIN library_files file ON file.id = track.file_id
             JOIN track_source_metadata source_metadata ON source_metadata.track_id = track.id
             WHERE track.id = ?1",
            params![id.rowid()],
            |row| {
                let number = |column: &str| -> rusqlite::Result<Option<u32>> {
                    Ok(row
                        .get::<_, Option<i64>>(column)?
                        .and_then(|value| u32::try_from(value).ok()))
                };
                Ok(TrackProperties {
                    id,
                    path: path.clone(),
                    file_name: row.get(0)?,
                    title: non_blank(row.get(1)?),
                    artist: non_blank(row.get(2)?),
                    album: non_blank(row.get(3)?),
                    album_artist: non_blank(row.get(4)?),
                    track_number: number("track_number")?,
                    track_total: number("track_total")?,
                    disc_number: number("disc_number")?,
                    disc_total: number("disc_total")?,
                    genre: non_blank(row.get(9)?),
                    date: non_blank(row.get(10)?),
                    duration_ms: row
                        .get::<_, Option<i64>>(11)?
                        .and_then(|value| u64::try_from(value).ok()),
                    file_format: non_blank(row.get(12)?),
                    codec: non_blank(row.get(13)?),
                    sample_rate: number("sample_rate")?,
                    channel_count: number("channel_count")?,
                    bit_depth: number("bit_depth")?,
                    bitrate_kbps: number("bitrate_kbps")?,
                })
            },
        )
        .optional()?
        .ok_or(LibraryError::TrackNotFound)?;
    Ok(properties)
}

/// A track's file: a Library directory, and a path below it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrackLocation {
    directory: PathBuf,
    relative: PathBuf,
    available: bool,
}

/// A track's file as it is on disk right now. Both paths are canonical.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExistingFile {
    pub directory: PathBuf,
    pub path: PathBuf,
}

impl TrackLocation {
    pub(crate) fn new(directory: &str, relative: &str, available: bool) -> Self {
        Self {
            directory: PathBuf::from(directory),
            relative: PathBuf::from(relative),
            available,
        }
    }

    /// The file's path, without touching the filesystem: the directory joined with a relative path that
    /// only descends. Cheap enough to take for every track of a playback context.
    pub(crate) fn path(&self) -> Result<PathBuf> {
        let descends = self
            .relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
        if !descends || self.relative.as_os_str().is_empty() {
            return Err(LibraryError::TrackUnavailable);
        }
        Ok(self.directory.join(&self.relative))
    }

    /// The file itself: still marked available, still there, and (symbolic links resolved) still
    /// inside its directory. A path that cannot be resolved is a file that is not there.
    pub(crate) fn existing(&self) -> Result<ExistingFile> {
        if !self.available {
            return Err(LibraryError::TrackUnavailable);
        }
        let path = self.path()?;
        let Ok(directory) = dunce::canonicalize(&self.directory) else {
            return Err(LibraryError::TrackUnavailable);
        };
        let Ok(path) = dunce::canonicalize(path) else {
            return Err(LibraryError::TrackUnavailable);
        };
        if !path.starts_with(&directory) || !path.is_file() {
            return Err(LibraryError::TrackUnavailable);
        }
        Ok(ExistingFile { directory, path })
    }
}

/// Where the track's file is, read from one query.
pub(crate) fn track_location(connection: &Connection, id: TrackId) -> Result<TrackLocation> {
    let (directory, relative, availability): (String, String, Availability) = connection
        .query_row(
            "SELECT directory.path, file.relative_path, file.availability
                 FROM tracks track
                 JOIN library_files file ON file.id = track.file_id
                 JOIN directories directory ON directory.id = file.directory_id
                 WHERE track.id = ?1",
            params![id.rowid()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or(LibraryError::TrackNotFound)?;
    Ok(TrackLocation::new(
        &directory,
        &relative,
        availability == Availability::Available,
    ))
}
