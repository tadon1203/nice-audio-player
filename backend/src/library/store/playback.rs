//! Resolves library selections (an album, the track list under a filter) into the track ids a
//! playback queue is built from, and reads those tracks back when they are needed.

use super::{
    LibraryStore,
    catalog::{ALBUM_ORDER, album_id_of, track_filter, track_ordering, validate_album_key},
    track::{artwork_ref, non_blank},
};
use crate::ids::{TrackId, track_id_column};
use crate::library::{
    artwork::ArtworkRef,
    error::StoreError,
    location::TrackLocation,
    models::{LibraryAlbumKey, LibrarySortDirection, LibraryTrackSortKey},
    status::{Availability, InspectionStatus},
};
use crate::media::validation::{ValidatedAudioFile, describe_audio_file, validate_audio_file};
use rusqlite::{Connection, Row, params};
use std::collections::HashMap;

/// A library track ready to be played, and the one track-metadata type of the whole playback
/// path: the library reads it, the queue item wraps it, and the renderer sees it.
///
/// The file facts (`file`, `file_format`, `bit_depth`, `bitrate_kbps`) feed the signal path and
/// stay in the backend. The file is a path on disk, and the renderer never receives one.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayableTrack {
    pub track_id: TrackId,
    #[serde(skip)]
    #[specta(skip)]
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    /// The catalog's key for the album, `None` for a track with no album tag.
    pub album_key: Option<LibraryAlbumKey>,
    /// How many tracks the library holds for that album.
    pub album_track_count: Option<u32>,
    #[serde(skip)]
    #[specta(skip)]
    pub file_format: Option<String>,
    #[serde(skip)]
    #[specta(skip)]
    pub bit_depth: Option<u32>,
    #[serde(skip)]
    #[specta(skip)]
    pub bitrate_kbps: Option<u32>,
    /// The library's identity hash of the file, when the scan stored one.
    #[serde(skip)]
    #[specta(skip)]
    pub content_hash: Option<String>,
}

/// The playable tracks of a selection by id, in playing order, and where to start. The tracks
/// themselves are read when they are needed (`playable_tracks`), so a selection costs one
/// narrow query however large the library is.
#[derive(Debug, Clone)]
pub struct PlaybackSelection {
    pub track_ids: Vec<TrackId>,
    pub start_index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackSourceError {
    InvalidAlbumKey,
    InvalidTrackId,
    AlbumNotFound,
    /// The requested start track is not part of the selection.
    TrackNotMember,
    TrackUnavailable,
    TrackNotPlayable,
    NoPlayableTracks,
    PersistenceFailed,
}

impl From<StoreError> for PlaybackSourceError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::TrackNotFound => Self::InvalidTrackId,
            StoreError::InvalidAlbumKey => Self::InvalidAlbumKey,
            StoreError::AlbumNotFound => Self::AlbumNotFound,
            StoreError::TrackUnavailable => Self::TrackUnavailable,
            // Playback never pages, and never asks for an Album Artist.
            StoreError::InvalidCursor
            | StoreError::InvalidAlbumArtistKey
            | StoreError::AlbumArtistNotFound
            | StoreError::Persistence => Self::PersistenceFailed,
        }
    }
}

struct PlaybackRow {
    track_id: TrackId,
    location: TrackLocation,
    indexed: bool,
    title: String,
    artist: String,
    album: String,
    album_artist: Option<String>,
    album_artist_name: String,
    album_directory: String,
    album_id: String,
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

impl PlaybackRow {
    fn available(&self) -> bool {
        self.location.available()
    }

    fn album_key(&self) -> Option<LibraryAlbumKey> {
        (!self.album.is_empty()).then(|| LibraryAlbumKey {
            title: self.album.clone(),
            album_artist: self.album_artist_name.clone(),
            album_edition: self.album_directory.clone(),
        })
    }
}

/// How many tracks each album has, by album ID.
type AlbumCounts = HashMap<String, u32>;

/// The columns every playback query returns, in the order `playback_row` reads them, and what they
/// are selected from.
const PLAYBACK_COLUMNS: &str = "t.id, r.path, f.relative_path, f.availability, f.inspection_status, m.title, m.artist, m.album, m.tag_album_artist, m.album_artist, m.duration_ms, a.content_hash, a.mime_type, m.track_number, m.disc_number, m.year, m.file_format, m.bit_depth, m.bitrate_kbps, m.album_directory, f.content_hash, m.album_id";
const PLAYBACK_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id JOIN library_roots r ON r.id = f.root_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let root: String = row.get(1)?;
    let relative: String = row.get(2)?;
    let availability: Availability = row.get(3)?;
    let inspection: InspectionStatus = row.get(4)?;
    Ok(PlaybackRow {
        track_id: track_id_column(row, 0)?,
        location: TrackLocation::new(&root, &relative, availability == Availability::Available),
        indexed: inspection == InspectionStatus::Indexed,
        title: row.get(5)?,
        artist: row.get(6)?,
        album: row.get(7)?,
        album_artist: row.get(8)?,
        album_artist_name: row.get(9)?,
        album_directory: row.get(19)?,
        album_id: row.get(21)?,
        duration_ms: row.get(10)?,
        artwork: artwork_ref(row.get(11)?, row.get(12)?),
        track_number: row.get(13)?,
        disc_number: row.get(14)?,
        year: row.get(15)?,
        file_format: non_blank(row.get(16)?),
        bit_depth: row
            .get::<_, Option<i64>>(17)?
            .and_then(|value| u32::try_from(value).ok()),
        bitrate_kbps: row
            .get::<_, Option<i64>>(18)?
            .and_then(|value| u32::try_from(value).ok()),
        content_hash: row.get(20)?,
    })
}

/// Turns a row into a playable track. A track that is missing, not indexed or whose file path
/// cannot be described yields `None`, except for the `requested` one, which is reported instead
/// of quietly playing something else.
fn playable_track(
    row: PlaybackRow,
    counts: &AlbumCounts,
    requested: bool,
) -> Result<Option<PlayableTrack>, PlaybackSourceError> {
    if !row.available() || !row.indexed {
        if requested {
            return Err(if row.available() {
                PlaybackSourceError::TrackNotPlayable
            } else {
                PlaybackSourceError::TrackUnavailable
            });
        }
        return Ok(None);
    }
    // A file that vanished since the scan fails when it is loaded, and the queue moves on.
    // The track the listener picked is checked now so they get a clear answer.
    let file = if requested {
        let existing = row
            .location
            .existing()
            .map_err(|_| PlaybackSourceError::TrackUnavailable)?;
        validate_audio_file(&existing.path).map_err(|_| PlaybackSourceError::TrackUnavailable)?
    } else {
        let Ok(path) = row.location.path() else {
            return Ok(None);
        };
        let Ok(file) = describe_audio_file(&path) else {
            return Ok(None);
        };
        file
    };
    let album_key = row.album_key();
    let album_track_count = album_key
        .as_ref()
        .and_then(|_| counts.get(&row.album_id).copied());
    Ok(Some(PlayableTrack {
        track_id: row.track_id,
        file,
        title: row.title,
        artist: non_blank(Some(row.artist)),
        album: non_blank(Some(row.album)),
        album_artist: non_blank(row.album_artist),
        artwork: row.artwork,
        duration_ms: row.duration_ms.map(|value| value as u64),
        track_number: row.track_number.and_then(|value| u32::try_from(value).ok()),
        disc_number: row.disc_number.and_then(|value| u32::try_from(value).ok()),
        year: row.year,
        album_key,
        album_track_count,
        file_format: row.file_format,
        bit_depth: row.bit_depth,
        bitrate_kbps: row.bitrate_kbps,
        content_hash: row.content_hash,
    }))
}

/// One member of a selection: just enough to decide whether it plays.
struct SelectionRow {
    track_id: TrackId,
    available: bool,
    indexed: bool,
}

/// Keeps the ids that can be played and locates the requested one among them.
fn select_playable(
    rows: &[SelectionRow],
    start_track_id: Option<TrackId>,
) -> Result<PlaybackSelection, PlaybackSourceError> {
    if let Some(requested) = start_track_id {
        let Some(row) = rows.iter().find(|row| row.track_id == requested) else {
            return Err(PlaybackSourceError::TrackNotMember);
        };
        if !row.available {
            return Err(PlaybackSourceError::TrackUnavailable);
        }
        if !row.indexed {
            return Err(PlaybackSourceError::TrackNotPlayable);
        }
    }
    let mut track_ids = Vec::with_capacity(rows.len());
    let mut start_index = 0;
    for row in rows.iter().filter(|row| row.available && row.indexed) {
        if start_track_id == Some(row.track_id) {
            start_index = track_ids.len();
        }
        track_ids.push(row.track_id);
    }
    if track_ids.is_empty() {
        return Err(PlaybackSourceError::NoPlayableTracks);
    }
    Ok(PlaybackSelection {
        track_ids,
        start_index,
    })
}

/// The columns of a selection query, in the order `selection_row` reads them, and what they
/// are selected from.
const SELECTION_COLUMNS: &str = "t.id, f.availability, f.inspection_status";
const SELECTION_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id";

fn selection_row(row: &Row<'_>) -> rusqlite::Result<SelectionRow> {
    let availability: Availability = row.get(1)?;
    let inspection: InspectionStatus = row.get(2)?;
    Ok(SelectionRow {
        track_id: track_id_column(row, 0)?,
        available: availability == Availability::Available,
        indexed: inspection == InspectionStatus::Indexed,
    })
}

/// How many ids one query binds; SQLite's default limit on variables is far above it.
const IDS_PER_QUERY: usize = 400;

impl LibraryStore {
    /// The album in disc and track order.
    pub fn playback_for_album(
        &self,
        key: &LibraryAlbumKey,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        validate_album_key(key)?;
        let connection = self.read()?;
        let album_id = album_id_of(&connection, key)?;
        let rows = collect_selection(
            &connection,
            &format!(
                "SELECT {SELECTION_COLUMNS} {SELECTION_FROM}
                 WHERE m.album_id = ?1
                 ORDER BY {ALBUM_ORDER}"
            ),
            params![album_id],
        )?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::AlbumNotFound);
        }
        select_playable(&rows, start_track_id)
    }

    /// One track, for starting from it or adding it to a queue that is already playing. The
    /// track must be playable: anything else is reported.
    pub fn playback_for_track(
        &self,
        track_id: TrackId,
    ) -> Result<PlayableTrack, PlaybackSourceError> {
        let connection = self.read()?;
        let rows = collect_rows(
            &connection,
            &format!("SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE t.id = ?1"),
            params![track_id.rowid()],
        )?;
        let Some(row) = rows.into_iter().next() else {
            return Err(PlaybackSourceError::InvalidTrackId);
        };
        let counts = album_counts(&connection, [row.album_id.clone()])?;
        playable_track(row, &counts, true)?.ok_or(PlaybackSourceError::NoPlayableTracks)
    }

    /// The tracks with these ids, in the order given: `None` for an id that is unknown, not
    /// indexed or no longer available. Album counts come from one query for the whole batch.
    pub fn playable_tracks(
        &self,
        track_ids: &[TrackId],
    ) -> Result<Vec<Option<PlayableTrack>>, PlaybackSourceError> {
        let connection = self.read()?;
        let mut found: HashMap<TrackId, PlayableTrack> = HashMap::with_capacity(track_ids.len());
        for chunk in track_ids.chunks(IDS_PER_QUERY) {
            let ids: Vec<i64> = chunk.iter().map(|id| id.rowid()).collect();
            if ids.is_empty() {
                continue;
            }
            let marks = vec!["?"; ids.len()].join(",");
            let rows = collect_rows(
                &connection,
                &format!("SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE t.id IN ({marks})"),
                rusqlite::params_from_iter(ids),
            )?;
            let counts = album_counts(&connection, rows.iter().map(|row| row.album_id.clone()))?;
            for row in rows {
                let id = row.track_id;
                if let Some(track) = playable_track(row, &counts, false)? {
                    found.insert(id, track);
                }
            }
        }
        Ok(track_ids.iter().map(|id| found.get(id).cloned()).collect())
    }

    /// Every track the tracks page shows under `search`, in the page's sort order.
    pub fn playback_for_tracks(
        &self,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        let filter = track_filter(search);
        let connection = self.read()?;
        let rows = collect_selection(
            &connection,
            &format!(
                "SELECT {SELECTION_COLUMNS} {SELECTION_FROM} WHERE {} ORDER BY {}",
                filter.sql,
                track_ordering(sort_key, sort_direction).order_by()
            ),
            rusqlite::params_from_iter(filter.params),
        )?;
        select_playable(&rows, start_track_id)
    }
}

/// How many tracks the library holds for each of `album_ids` (and for no other album), in one
/// query per chunk.
fn album_counts(
    connection: &Connection,
    album_ids: impl IntoIterator<Item = String>,
) -> Result<AlbumCounts, PlaybackSourceError> {
    let mut wanted: Vec<String> = album_ids.into_iter().collect();
    wanted.sort();
    wanted.dedup();
    let mut counts = AlbumCounts::new();
    for chunk in wanted.chunks(IDS_PER_QUERY) {
        let marks = vec!["?"; chunk.len()].join(",");
        let mut statement = connection
            .prepare(&format!(
                "SELECT album_id, COUNT(*) FROM track_source_metadata
                 WHERE album_id IN ({marks})
                 GROUP BY album_id"
            ))
            .map_err(StoreError::from)?;
        let rows = statement
            .query_map(rusqlite::params_from_iter(chunk), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
            })
            .map_err(StoreError::from)?;
        for row in rows {
            let (album_id, count) = row.map_err(StoreError::from)?;
            counts.insert(album_id, count);
        }
    }
    Ok(counts)
}

fn collect_rows(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<PlaybackRow>, StoreError> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, playback_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn collect_selection(
    connection: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<SelectionRow>, StoreError> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map(params, selection_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}
