//! Resolves library selections (an album, the track list under a filter) into the track ids a
//! playback queue is built from, and reads those tracks back when they are needed.

use super::{
    LibraryStore,
    catalog::{ALBUM_ORDER, track_filter, track_ordering},
    track::{artwork_ref, non_blank, track_album, track_state},
};
use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, track_id_column};
use crate::library::{
    artwork::ArtworkRef,
    error::StoreError,
    location::TrackLocation,
    models::{
        LibrarySortDirection, LibraryTrackSortKey, NowPlayingAlbum, NowPlayingTrack, TrackCore,
        TrackState,
    },
    status::{Availability, InspectionStatus},
};
use crate::media::validation::{ValidatedAudioFile, describe_audio_file, validate_audio_file};
use rusqlite::{Connection, Row, params};
use std::collections::HashMap;

/// A library track ready to be played: the track the renderer sees, and the file facts the
/// backend needs to play it. It is never serialized, so the file path cannot reach the renderer.
///
/// The file facts (`file`, `file_format`, `bit_depth`, `bitrate_kbps`) feed the signal path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlayableTrack {
    pub track: NowPlayingTrack,
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

    /// A track that is only an id, the file's name as its title, and the file.
    #[cfg(test)]
    pub(crate) fn bare(id: TrackId, file: ValidatedAudioFile) -> Self {
        Self {
            track: NowPlayingTrack {
                core: TrackCore {
                    id,
                    title: file.file_name.clone(),
                    artist: None,
                    duration_ms: None,
                    artwork: None,
                },
                album: None,
                track_number: None,
                disc_number: None,
                year: None,
            },
            file,
            file_format: None,
            bit_depth: None,
            bitrate_kbps: None,
            content_hash: None,
        }
    }
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
            StoreError::AlbumNotFound => Self::AlbumNotFound,
            StoreError::TrackUnavailable => Self::TrackUnavailable,
            // Playback never pages, and never asks for an Album Artist.
            StoreError::InvalidCursor
            | StoreError::AlbumArtistNotFound
            | StoreError::Persistence => Self::PersistenceFailed,
        }
    }
}

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

/// How many tracks each album has, by album ID.
type AlbumCounts = HashMap<String, u32>;

/// The columns every playback query returns, in the order `playback_row` reads them, and what they
/// are selected from.
const PLAYBACK_COLUMNS: &str = "t.id, r.path, f.relative_path, f.availability, f.inspection_status, m.title, m.artist, m.album, al.album_artist, m.duration_ms, a.content_hash, a.mime_type, m.track_number, m.disc_number, m.year, m.file_format, m.bit_depth, m.bitrate_kbps, f.content_hash, m.album_id, al.artist_id";
const PLAYBACK_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id JOIN library_roots r ON r.id = f.root_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id LEFT JOIN albums al ON al.id = m.album_id";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let root: String = row.get(1)?;
    let relative: String = row.get(2)?;
    let availability: Availability = row.get(3)?;
    let inspection: InspectionStatus = row.get(4)?;
    Ok(PlaybackRow {
        track_id: track_id_column(row, 0)?,
        location: TrackLocation::new(&root, &relative, availability == Availability::Available),
        state: track_state(availability, inspection),
        title: row.get(5)?,
        artist: row.get(6)?,
        album: row.get(7)?,
        album_artist: row.get(8)?,
        album_id: album_id_column(row, 19)?,
        album_artist_id: row
            .get::<_, Option<String>>(20)?
            .and_then(|hex| ArtistId::from_hex(&hex)),
        duration_ms: row.get(9)?,
        artwork: artwork_ref(row.get(10)?, row.get(11)?),
        track_number: row.get(12)?,
        disc_number: row.get(13)?,
        year: row.get(14)?,
        file_format: non_blank(row.get(15)?),
        bit_depth: row
            .get::<_, Option<i64>>(16)?
            .and_then(|value| u32::try_from(value).ok()),
        bitrate_kbps: row
            .get::<_, Option<i64>>(17)?
            .and_then(|value| u32::try_from(value).ok()),
        content_hash: row.get(18)?,
    })
}

/// Why a track in this state cannot be played, or `Ok` when it can.
fn ensure_playable(state: TrackState) -> Result<(), PlaybackSourceError> {
    match state {
        TrackState::Playable => Ok(()),
        TrackState::Missing => Err(PlaybackSourceError::TrackUnavailable),
        TrackState::Unsupported => Err(PlaybackSourceError::TrackNotPlayable),
    }
}

/// Turns a row into a playable track. A track that is missing, not indexed or whose file path
/// cannot be described yields `None`, except for the `requested` one, which is reported instead
/// of quietly playing something else.
fn playable_track(
    row: PlaybackRow,
    counts: &AlbumCounts,
    requested: bool,
) -> Result<Option<PlayableTrack>, PlaybackSourceError> {
    if let Err(error) = ensure_playable(row.state) {
        return if requested { Err(error) } else { Ok(None) };
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
    // A track with no album tag has no album, so no album ID and no album count.
    let album_track_count = counts
        .get(&row.album_id.to_hex())
        .copied()
        .unwrap_or_default();
    let album = track_album(
        row.album,
        row.album_id,
        row.album_artist_id,
        row.album_artist,
    )
    .map(|album| NowPlayingAlbum {
        album,
        track_count: album_track_count,
    });
    Ok(Some(PlayableTrack {
        track: NowPlayingTrack {
            core: TrackCore {
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
) -> Result<PlaybackSelection, PlaybackSourceError> {
    if let Some(requested) = start_track_id {
        let Some(row) = rows.iter().find(|row| row.track_id == requested) else {
            return Err(PlaybackSourceError::TrackNotMember);
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
        state: track_state(availability, inspection),
    })
}

/// How many ids one query binds; SQLite's default limit on variables is far above it.
const IDS_PER_QUERY: usize = 400;

impl LibraryStore {
    /// The album in disc and track order, by its ID.
    pub fn playback_for_album_id(
        &self,
        album_id: AlbumId,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        let connection = self.read()?;
        Self::album_selection(&connection, album_id, start_track_id)
    }

    fn album_selection(
        connection: &Connection,
        album_id: AlbumId,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        let rows = collect_selection(
            connection,
            &format!(
                "SELECT {SELECTION_COLUMNS} {SELECTION_FROM}
                 WHERE m.album_id = ?1
                 ORDER BY {ALBUM_ORDER}"
            ),
            params![album_id.to_hex()],
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
        let counts = album_counts(&connection, [row.album_id.to_hex()])?;
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
            let counts = album_counts(&connection, rows.iter().map(|row| row.album_id.to_hex()))?;
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
