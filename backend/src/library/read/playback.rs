//! Playback: the resolution of Playback selections (an album, the track list under a filter) into
//! the track ids a playback queue is built from, and the reading of those tracks back when they are
//! needed. The track DTO that the Renderer sees while it plays is here too.

use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, track_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::albums::ALBUM_ORDER;
use crate::library::read::artwork::{ArtworkRef, artwork_ref};
use crate::library::read::lists::SortDirection;
use crate::library::read::tracks::{
    TrackAlbum, TrackCommonFields, TrackLocation, TrackSortKey, TrackState, non_blank, track_album,
    track_listing, track_state,
};
use crate::library::storage::columns::{Availability, InspectionStatus};
use crate::library::sync::media::{ValidatedAudioFile, describe_audio_file, validate_audio_file};
use rusqlite::{Connection, Row, params};
use serde::Serialize;
use std::collections::HashMap;

/// The album of the loaded track: the album it is filed under and how many tracks the library
/// holds for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackAlbumWithTrackCount {
    #[serde(flatten)]
    pub album: TrackAlbum,
    pub track_count: u32,
}

/// A track as the Renderer sees it: the loaded track, and each queue row. No file path: the playback
/// worker holds the file. It has no state: only a playable track is ever loaded or queued.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    #[serde(flatten)]
    pub core: TrackCommonFields,
    pub album: Option<TrackAlbumWithTrackCount>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
}

/// A library track ready to be played: the track the renderer sees, and the file facts the
/// backend needs to play it. It is never serialized, so the file path cannot reach the renderer.
///
/// The file facts (`file`, `file_format`, `bit_depth`, `bitrate_kbps`) feed the signal path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayableTrack {
    pub track: TrackSummary,
    pub file: ValidatedAudioFile,
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    /// The library's identity hash of the file, when the scan stored one.
    pub content_hash: Option<String>,
}

impl PlayableTrack {
    pub fn id(&self) -> TrackId {
        self.track.core.id
    }
}

/// The playable tracks of a selection by id, in playing order, and where to start. The tracks
/// themselves are read when they are needed (`playable_tracks`), so a selection costs one
/// narrow query however large the library is.
#[derive(Debug, Clone)]
pub(crate) struct PlaybackSelection {
    pub track_ids: Vec<TrackId>,
    pub start_index: usize,
}

/// Why a track in this state cannot be played, or `Ok` when it can.
fn ensure_playable(state: TrackState) -> Result<()> {
    match state {
        TrackState::Playable => Ok(()),
        TrackState::Missing | TrackState::Unsupported => Err(LibraryError::TrackUnavailable),
    }
}

/// One playback query's row, with the file's location, before it is turned into a playable track.
struct PlaybackRow {
    track_id: TrackId,
    location: TrackLocation,
    state: TrackState,
    title: String,
    artist: String,
    album: String,
    album_artist: Option<String>,
    album_id: AlbumId,
    album_artist_id: Option<ArtistId>,
    album_track_count: u32,
    duration_ms: Option<i64>,
    artwork: Option<ArtworkRef>,
    track_number: Option<i64>,
    disc_number: Option<i64>,
    year: Option<i32>,
    file_format: Option<String>,
    bit_depth: Option<u32>,
    bitrate_kbps: Option<u32>,
    content_hash: Option<String>,
}

/// The columns every playback query returns, in the order `playback_row` reads them, and what they
/// are selected from.
const PLAYBACK_COLUMNS: &str = "track.id AS track_id, directory.path AS directory_path,
     file.relative_path AS relative_path, file.availability AS availability,
     file.inspection_status AS inspection_status, source_metadata.title AS title,
     source_metadata.artist AS artist, source_metadata.album AS album_title,
     album.album_artist AS album_artist, source_metadata.duration_ms AS duration_ms,
     artwork.hash AS artwork_hash, artwork.mime AS artwork_mime_type,
     source_metadata.track_number AS track_number, source_metadata.disc_number AS disc_number,
     source_metadata.year AS year, source_metadata.file_format AS file_format,
     source_metadata.bit_depth AS bit_depth, source_metadata.bitrate_kbps AS bitrate_kbps,
     file.content_hash AS content_hash, source_metadata.album_id AS album_id,
     album.artist_id AS album_artist_id, artwork.has_thumbnail AS artwork_has_thumbnail,
     album.track_count AS album_track_count";
const PLAYBACK_FROM: &str = "FROM track_source_metadata source_metadata
     JOIN tracks track ON track.id = source_metadata.track_id
     JOIN library_files file ON file.id = track.file_id
     JOIN directories directory ON directory.id = file.directory_id
     LEFT JOIN artwork artwork ON artwork.hash = source_metadata.artwork_hash
     LEFT JOIN albums album ON album.id = source_metadata.album_id";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let directory: String = row.get("directory_path")?;
    let relative: String = row.get("relative_path")?;
    let availability: Availability = row.get("availability")?;
    let inspection: InspectionStatus = row.get("inspection_status")?;
    Ok(PlaybackRow {
        track_id: track_id_column(row, "track_id")?,
        location: TrackLocation::new(
            &directory,
            &relative,
            availability == Availability::Available,
        ),
        state: track_state(availability, inspection),
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album_title")?,
        album_artist: row.get("album_artist")?,
        album_id: album_id_column(row, "album_id")?,
        album_artist_id: row
            .get::<_, Option<String>>("album_artist_id")?
            .and_then(|hex| ArtistId::from_hex(&hex)),
        album_track_count: row
            .get::<_, Option<u32>>("album_track_count")?
            .unwrap_or_default(),
        duration_ms: row.get("duration_ms")?,
        artwork: artwork_ref(
            row.get("artwork_hash")?,
            row.get("artwork_mime_type")?,
            row.get("artwork_has_thumbnail")?,
        ),
        track_number: row.get("track_number")?,
        disc_number: row.get("disc_number")?,
        year: row.get("year")?,
        file_format: non_blank(row.get("file_format")?),
        bit_depth: row
            .get::<_, Option<i64>>("bit_depth")?
            .and_then(|value| u32::try_from(value).ok()),
        bitrate_kbps: row
            .get::<_, Option<i64>>("bitrate_kbps")?
            .and_then(|value| u32::try_from(value).ok()),
        content_hash: row.get("content_hash")?,
    })
}

/// Turns a row into a playable track. A track that is missing, not indexed or whose file path
/// cannot be described yields `None`, except for the `requested` one, which is reported instead
/// of quietly playing something else.
fn playable_track(row: PlaybackRow, requested: bool) -> Result<Option<PlayableTrack>> {
    if let Err(error) = ensure_playable(row.state) {
        return if requested { Err(error) } else { Ok(None) };
    }
    // A file that vanished since the scan fails when it is loaded, and the queue moves on.
    // The track the listener picked is checked now so they get a clear answer.
    let file = if requested {
        let existing = row.location.existing()?;
        validate_audio_file(&existing.path)?
    } else {
        let Ok(path) = row.location.path() else {
            return Ok(None);
        };
        let Ok(file) = describe_audio_file(&path) else {
            return Ok(None);
        };
        file
    };
    // A track with no album tag has no album, so no album ID and no album track count.
    let album = track_album(
        row.album,
        row.album_id,
        row.album_artist_id,
        row.album_artist,
    )
    .map(|album| TrackAlbumWithTrackCount {
        album,
        track_count: row.album_track_count,
    });
    Ok(Some(PlayableTrack {
        track: TrackSummary {
            core: TrackCommonFields {
                id: row.track_id,
                title: row.title,
                artist: non_blank(Some(row.artist)),
                duration_ms: row.duration_ms.map(|value| value as u64),
                artwork: row.artwork,
            },
            album,
            track_number: row.track_number.and_then(|value| u32::try_from(value).ok()),
            disc_number: row.disc_number.and_then(|value| u32::try_from(value).ok()),
            year: row.year,
        },
        file,
        file_format: row.file_format,
        bit_depth: row.bit_depth,
        bitrate_kbps: row.bitrate_kbps,
        content_hash: row.content_hash,
    }))
}

/// One member of a selection: just enough to decide whether it plays.
struct SelectionRow {
    track_id: TrackId,
    state: TrackState,
}

/// Keeps the ids that can be played and locates the requested one among them.
fn select_playable(
    rows: &[SelectionRow],
    start_track_id: Option<TrackId>,
) -> Result<PlaybackSelection> {
    if let Some(requested) = start_track_id {
        let Some(row) = rows.iter().find(|row| row.track_id == requested) else {
            return Err(LibraryError::TrackNotFound);
        };
        ensure_playable(row.state)?;
    }
    let mut track_ids = Vec::with_capacity(rows.len());
    let mut start_index = 0;
    for row in rows.iter().filter(|row| row.state == TrackState::Playable) {
        if start_track_id == Some(row.track_id) {
            start_index = track_ids.len();
        }
        track_ids.push(row.track_id);
    }
    if track_ids.is_empty() {
        return Err(LibraryError::TrackUnavailable);
    }
    Ok(PlaybackSelection {
        track_ids,
        start_index,
    })
}

/// The columns of a selection query, in the order `selection_row` reads them, and what they
/// are selected from.
const SELECTION_COLUMNS: &str = "track.id AS track_id, file.availability AS availability,
     file.inspection_status AS inspection_status";
const SELECTION_FROM: &str = "FROM track_source_metadata source_metadata
     JOIN tracks track ON track.id = source_metadata.track_id
     JOIN library_files file ON file.id = track.file_id";

fn selection_row(row: &Row<'_>) -> rusqlite::Result<SelectionRow> {
    let availability: Availability = row.get("availability")?;
    let inspection: InspectionStatus = row.get("inspection_status")?;
    Ok(SelectionRow {
        track_id: track_id_column(row, "track_id")?,
        state: track_state(availability, inspection),
    })
}

/// How many ids one query binds; SQLite's default limit on variables is far above it.
const IDS_PER_QUERY: usize = 400;

/// The album in disc and track order, by its ID.
pub(crate) fn playback_for_album(
    connection: &Connection,
    album_id: AlbumId,
    start_track_id: Option<TrackId>,
) -> Result<PlaybackSelection> {
    let rows = collect_selection(
        connection,
        &format!(
            "SELECT {SELECTION_COLUMNS} {SELECTION_FROM}
             WHERE source_metadata.album_id = ?1
             ORDER BY {ALBUM_ORDER}"
        ),
        params![album_id.to_hex()],
    )?;
    if rows.is_empty() {
        return Err(LibraryError::AlbumNotFound);
    }
    select_playable(&rows, start_track_id)
}

/// One track, for starting from it or adding it to a queue that is already playing. The
/// track must be playable: anything else is reported.
pub(crate) fn playback_for_track(
    connection: &Connection,
    track_id: TrackId,
) -> Result<PlayableTrack> {
    let rows = collect_rows(
        connection,
        &format!("SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE track.id = ?1"),
        params![track_id.rowid()],
    )?;
    let Some(row) = rows.into_iter().next() else {
        return Err(LibraryError::TrackNotFound);
    };
    playable_track(row, true)?.ok_or(LibraryError::TrackUnavailable)
}

/// The tracks with these ids, in the order given: `None` for an id that is unknown, not
/// indexed or no longer available.
pub(crate) fn playable_tracks(
    connection: &Connection,
    track_ids: &[TrackId],
) -> Result<Vec<Option<PlayableTrack>>> {
    let mut found: HashMap<TrackId, PlayableTrack> = HashMap::with_capacity(track_ids.len());
    for chunk in track_ids.chunks(IDS_PER_QUERY) {
        let ids: Vec<i64> = chunk.iter().map(|id| id.rowid()).collect();
        if ids.is_empty() {
            continue;
        }
        let marks = vec!["?"; ids.len()].join(",");
        let rows = collect_rows(
            connection,
            &format!("SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE track.id IN ({marks})"),
            rusqlite::params_from_iter(ids),
        )?;
        for row in rows {
            let id = row.track_id;
            if let Some(track) = playable_track(row, false)? {
                found.insert(id, track);
            }
        }
    }
    Ok(track_ids.iter().map(|id| found.get(id).cloned()).collect())
}

/// Every track the tracks list shows under `search`, in the list's sort order.
pub(crate) fn playback_for_tracks(
    connection: &Connection,
    search: Option<&str>,
    sort: TrackSortKey,
    direction: SortDirection,
    start_track_id: Option<TrackId>,
) -> Result<PlaybackSelection> {
    let listing = track_listing(search, sort, direction);
    let rows = collect_selection(
        connection,
        &format!(
            "SELECT {SELECTION_COLUMNS} {SELECTION_FROM} WHERE {} ORDER BY {}",
            listing.filter.sql(),
            listing.order
        ),
        rusqlite::params_from_iter(&listing.filter.params),
    )?;
    select_playable(&rows, start_track_id)
}

fn collect_rows(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<PlaybackRow>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, playback_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn collect_selection(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<SelectionRow>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, selection_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
