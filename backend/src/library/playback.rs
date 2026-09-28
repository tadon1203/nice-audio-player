//! Resolves library selections (an album, the track list under a filter) into the tracks a
//! playback queue is built from.

use super::catalog::{artwork_ref, track_order_sql, track_search_predicate};
use super::models::*;
use super::policy::effective_track_title;
use super::service::{parse_id, LibraryShared};
use crate::media::validation::{describe_audio_file, validate_audio_file, ValidatedAudioFile};
use rusqlite::{params, Row};
use std::path::Path;

/// A library track ready to be queued.
#[derive(Debug, Clone)]
pub struct PlayableTrack {
    pub track_id: String,
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
}

/// Every playable track of a selection, in playing order, and where to start.
#[derive(Debug, Clone)]
pub struct PlaybackSelection {
    pub tracks: Vec<PlayableTrack>,
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
    LibraryUnavailable,
    PersistenceFailed,
}

struct PlaybackRow {
    track_id: i64,
    root_path: String,
    relative_path: String,
    file_name: String,
    available: bool,
    indexed: bool,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    duration_ms: Option<i64>,
    artwork: Option<ArtworkRef>,
}

/// Columns every playback query returns, in the order `playback_row` reads them.
pub(super) const PLAYBACK_COLUMNS: &str = "t.id, r.path, f.relative_path, f.file_name, f.availability, f.inspection_status, m.title, m.artist, m.album, m.album_artist, m.duration_ms, a.content_hash, a.mime_type, a.relative_path";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let availability: String = row.get(4)?;
    let inspection: String = row.get(5)?;
    Ok(PlaybackRow {
        track_id: row.get(0)?,
        root_path: row.get(1)?,
        relative_path: row.get(2)?,
        file_name: row.get(3)?,
        available: availability == "available",
        indexed: inspection == "indexed",
        title: row.get(6)?,
        artist: row.get(7)?,
        album: row.get(8)?,
        album_artist: row.get(9)?,
        duration_ms: row.get(10)?,
        artwork: artwork_ref(row.get(11)?, row.get(12)?, row.get(13)?),
    })
}

fn non_blank(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

/// Keeps the tracks that can be played and locates the requested one among them. Tracks that
/// are missing or not indexed are skipped, except when the listener asked for that very track,
/// which is reported instead of quietly playing something else.
fn select_playable(
    rows: Vec<PlaybackRow>,
    start_track_id: Option<i64>,
) -> Result<PlaybackSelection, PlaybackSourceError> {
    if let Some(requested) = start_track_id {
        if !rows.iter().any(|row| row.track_id == requested) {
            return Err(PlaybackSourceError::TrackNotMember);
        }
    }
    let mut tracks = Vec::with_capacity(rows.len());
    let mut start_index = None;
    for row in rows {
        let requested = start_track_id == Some(row.track_id);
        if !row.available || !row.indexed {
            if requested {
                return Err(if row.available {
                    PlaybackSourceError::TrackNotPlayable
                } else {
                    PlaybackSourceError::TrackUnavailable
                });
            }
            continue;
        }
        let path = Path::new(&row.root_path).join(&row.relative_path);
        let path = path.to_string_lossy();
        // A file that vanished since the scan fails when it is loaded, and the queue moves on.
        // The track the listener picked is checked now so they get a clear answer.
        let file = if requested {
            validate_audio_file(&path).map_err(|_| PlaybackSourceError::TrackUnavailable)?
        } else {
            match describe_audio_file(&path) {
                Ok(file) => file,
                Err(_) => continue,
            }
        };
        if requested {
            start_index = Some(tracks.len());
        }
        tracks.push(PlayableTrack {
            track_id: row.track_id.to_string(),
            title: effective_track_title(row.title.as_deref(), &row.file_name),
            file,
            artist: non_blank(row.artist),
            album: non_blank(row.album),
            album_artist: non_blank(row.album_artist),
            artwork: row.artwork,
            duration_ms: row.duration_ms.map(|value| value as u64),
        });
    }
    if tracks.is_empty() {
        return Err(PlaybackSourceError::NoPlayableTracks);
    }
    Ok(PlaybackSelection {
        tracks,
        start_index: start_index.unwrap_or(0),
    })
}

fn parse_start_track(id: Option<&str>) -> Result<Option<i64>, PlaybackSourceError> {
    id.map(|id| parse_id(id).map_err(|_| PlaybackSourceError::InvalidTrackId))
        .transpose()
}

impl LibraryShared {
    /// The album in disc and track order.
    pub fn playback_for_album(
        &self,
        key: &LibraryAlbumKey,
        start_track_id: Option<&str>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        super::catalog::validate_album_key(key)
            .map_err(|_| PlaybackSourceError::InvalidAlbumKey)?;
        let start_track_id = parse_start_track(start_track_id)?;
        let connection = self
            .db()
            .map_err(|_| PlaybackSourceError::LibraryUnavailable)?
            .read()
            .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({members})
            SELECT {columns}
            FROM members mem
            JOIN tracks t ON t.id=mem.id
            JOIN library_files f ON f.id=t.file_id
            JOIN library_roots r ON r.id=f.root_id
            LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored'
            WHERE mem.album_title=?1 AND mem.effective_artist=?2
            ORDER BY CASE WHEN mem.disc_number IS NULL THEN 1 ELSE 0 END, mem.disc_number,
                     CASE WHEN mem.track_number IS NULL THEN 1 ELSE 0 END, mem.track_number, mem.id"#,
            members = super::catalog::CATALOG_MEMBER_PROJECTION,
            columns = PLAYBACK_COLUMNS,
        );
        let rows = collect_rows(&connection, &sql, params![key.title, key.album_artist])?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::AlbumNotFound);
        }
        select_playable(rows, start_track_id)
    }

    /// Every track the tracks page shows under `search`, in the page's sort order.
    pub fn playback_for_tracks(
        &self,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
        start_track_id: Option<&str>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        let start_track_id = parse_start_track(start_track_id)?;
        let search = search.unwrap_or_default().trim().to_owned();
        let pattern = super::catalog::literal_like_pattern(&search);
        let connection = self
            .db()
            .map_err(|_| PlaybackSourceError::LibraryUnavailable)?
            .read()
            .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
        let sql = format!(
            r#"SELECT {columns}
            FROM tracks t
            JOIN library_files f ON f.id=t.file_id
            JOIN library_roots r ON r.id=f.root_id
            LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored'
            WHERE {predicate}
            ORDER BY {order},t.id ASC"#,
            columns = PLAYBACK_COLUMNS,
            predicate = track_search_predicate(),
            order = track_order_sql(sort_key, sort_direction),
        );
        let rows = collect_rows(&connection, &sql, params![search, pattern])?;
        select_playable(rows, start_track_id)
    }
}

fn collect_rows(
    connection: &rusqlite::Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<PlaybackRow>, PlaybackSourceError> {
    let mut statement = connection
        .prepare(sql)
        .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
    let rows = statement
        .query_map(params, playback_row)
        .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| PlaybackSourceError::PersistenceFailed)
}
