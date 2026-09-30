//! Resolves library selections (an album, the track list under a filter) into the tracks a
//! playback queue is built from.

use super::catalog::{artwork_ref, track_order_sql, track_search_predicate};
use super::models::*;
use super::policy::effective_track_title;
use super::service::{parse_id, LibraryShared};
use super::status::{ArtworkStatus, Availability, InspectionStatus};
use crate::media::validation::{describe_audio_file, validate_audio_file, ValidatedAudioFile};
use rusqlite::{params, Row};
use std::collections::HashMap;
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
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    /// The catalog's key for the album, `None` for a track with no album tag.
    pub album_key: Option<LibraryAlbumKey>,
    /// How many tracks the library holds for that album.
    pub album_track_count: Option<u32>,
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
    track_number: Option<i64>,
    disc_number: Option<i64>,
    date: Option<String>,
    album_title: String,
    effective_artist: String,
}

type AlbumCounts = HashMap<(String, String), u32>;

/// Columns every playback query returns, in the order `playback_row` reads them.
pub(super) const PLAYBACK_COLUMNS: &str = "t.id, r.path, f.relative_path, f.file_name, f.availability, f.inspection_status, m.title, m.artist, m.album, m.album_artist, m.duration_ms, a.content_hash, a.mime_type, a.relative_path, m.track_number, m.disc_number, m.date, COALESCE(trim(m.album),''), COALESCE(NULLIF(trim(m.album_artist),''),NULLIF(trim(m.artist),''),'')";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let availability: Availability = row.get(4)?;
    let inspection: InspectionStatus = row.get(5)?;
    Ok(PlaybackRow {
        track_id: row.get(0)?,
        root_path: row.get(1)?,
        relative_path: row.get(2)?,
        file_name: row.get(3)?,
        available: availability == Availability::Available,
        indexed: inspection == InspectionStatus::Indexed,
        title: row.get(6)?,
        artist: row.get(7)?,
        album: row.get(8)?,
        album_artist: row.get(9)?,
        duration_ms: row.get(10)?,
        artwork: artwork_ref(row.get(11)?, row.get(12)?, row.get(13)?),
        track_number: row.get(14)?,
        disc_number: row.get(15)?,
        date: row.get(16)?,
        album_title: row.get(17)?,
        effective_artist: row.get(18)?,
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
    counts: &AlbumCounts,
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
        let album_key = (!row.album_title.is_empty()).then(|| LibraryAlbumKey {
            title: row.album_title.clone(),
            album_artist: row.effective_artist.clone(),
        });
        let album_track_count = album_key.as_ref().and_then(|key| {
            counts
                .get(&(key.title.clone(), key.album_artist.clone()))
                .copied()
        });
        tracks.push(PlayableTrack {
            track_id: row.track_id.to_string(),
            title: effective_track_title(row.title.as_deref(), &row.file_name),
            file,
            artist: non_blank(row.artist),
            album: non_blank(row.album),
            album_artist: non_blank(row.album_artist),
            artwork: row.artwork,
            duration_ms: row.duration_ms.map(|value| value as u64),
            track_number: row.track_number.and_then(|value| u32::try_from(value).ok()),
            disc_number: row.disc_number.and_then(|value| u32::try_from(value).ok()),
            year: row.date.as_deref().and_then(year_of),
            album_key,
            album_track_count,
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

/// The year of a tag date (`2019`, `2019-05`, `2019-05-03`), when it starts with four digits.
fn year_of(date: &str) -> Option<i32> {
    let year = date.trim().get(..4)?;
    if year.chars().all(|c| c.is_ascii_digit()) {
        year.parse().ok()
    } else {
        None
    }
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
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='{stored}'
            WHERE mem.album_title=?1 AND mem.effective_artist=?2
            ORDER BY CASE WHEN mem.disc_number IS NULL THEN 1 ELSE 0 END, mem.disc_number,
                     CASE WHEN mem.track_number IS NULL THEN 1 ELSE 0 END, mem.track_number, mem.id"#,
            members = super::catalog::CATALOG_MEMBER_PROJECTION,
            columns = PLAYBACK_COLUMNS,
            stored = ArtworkStatus::Stored,
        );
        let rows = collect_rows(&connection, &sql, params![key.title, key.album_artist])?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::AlbumNotFound);
        }
        let counts = counts_of(&rows);
        select_playable(rows, &counts, start_track_id)
    }

    /// One track, for adding to a queue that is already playing.
    pub fn playback_for_track(&self, track_id: &str) -> Result<PlayableTrack, PlaybackSourceError> {
        let track_id = parse_id(track_id).map_err(|_| PlaybackSourceError::InvalidTrackId)?;
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
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='{stored}'
            WHERE t.id=?1"#,
            columns = PLAYBACK_COLUMNS,
            stored = ArtworkStatus::Stored,
        );
        let rows = collect_rows(&connection, &sql, params![track_id])?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::InvalidTrackId);
        }
        let counts = match rows.first() {
            Some(row) if !row.album_title.is_empty() => {
                album_counts(&connection, Some((&row.album_title, &row.effective_artist)))?
            }
            _ => AlbumCounts::new(),
        };
        select_playable(rows, &counts, Some(track_id))?
            .tracks
            .into_iter()
            .next()
            .ok_or(PlaybackSourceError::NoPlayableTracks)
    }

    /// These tracks, in the order given; ids the library no longer knows are left out.
    pub fn playback_for_track_ids(
        &self,
        track_ids: &[String],
        start_track_id: Option<&str>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        let start_track_id = parse_start_track(start_track_id)?;
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
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='{stored}'
            WHERE t.id=?1"#,
            columns = PLAYBACK_COLUMNS,
            stored = ArtworkStatus::Stored,
        );
        let mut statement = connection
            .prepare(&sql)
            .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
        let mut rows = Vec::with_capacity(track_ids.len());
        for id in track_ids {
            let id = parse_id(id).map_err(|_| PlaybackSourceError::InvalidTrackId)?;
            let found = statement
                .query_map(params![id], playback_row)
                .map_err(|_| PlaybackSourceError::PersistenceFailed)?
                .next()
                .transpose()
                .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
            rows.extend(found);
        }
        // Albums are counted over the whole library, as in the tracks page.
        let counts = album_counts(&connection, None)?;
        select_playable(rows, &counts, start_track_id)
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
            LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='{stored}'
            WHERE {predicate}
            ORDER BY {order},t.id ASC"#,
            columns = PLAYBACK_COLUMNS,
            stored = ArtworkStatus::Stored,
            predicate = track_search_predicate(),
            order = track_order_sql(sort_key, sort_direction),
        );
        let rows = collect_rows(&connection, &sql, params![search, pattern])?;
        let counts = album_counts(&connection, None)?;
        select_playable(rows, &counts, start_track_id)
    }
}

/// Tracks per album over the whole library (or one album), keyed like the catalog.
fn album_counts(
    connection: &rusqlite::Connection,
    only: Option<(&str, &str)>,
) -> Result<AlbumCounts, PlaybackSourceError> {
    let filter = if only.is_some() {
        "AND album_title=?1 AND effective_artist=?2"
    } else {
        ""
    };
    let sql = format!(
        "WITH members AS MATERIALIZED ({members}) SELECT album_title, effective_artist, COUNT(*) FROM members WHERE album_title<>'' {filter} GROUP BY album_title, effective_artist",
        members = super::catalog::CATALOG_MEMBER_PROJECTION,
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
    let map = |row: &Row<'_>| {
        Ok((
            (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
            row.get::<_, u32>(2)?,
        ))
    };
    let rows = match only {
        Some((title, artist)) => statement.query_map(params![title, artist], map),
        None => statement.query_map([], map),
    }
    .map_err(|_| PlaybackSourceError::PersistenceFailed)?;
    rows.collect::<Result<AlbumCounts, _>>()
        .map_err(|_| PlaybackSourceError::PersistenceFailed)
}

/// An album's rows are all its members, so they count themselves.
fn counts_of(rows: &[PlaybackRow]) -> AlbumCounts {
    let mut counts = AlbumCounts::new();
    for row in rows.iter().filter(|row| !row.album_title.is_empty()) {
        *counts
            .entry((row.album_title.clone(), row.effective_artist.clone()))
            .or_default() += 1;
    }
    counts
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

#[cfg(test)]
mod year_tests {
    use super::year_of;

    #[test]
    fn reads_the_year_from_tag_dates() {
        assert_eq!(year_of("2019"), Some(2019));
        assert_eq!(year_of(" 2019-05-03"), Some(2019));
        assert_eq!(year_of("19"), None);
        assert_eq!(year_of("n/a"), None);
        assert_eq!(year_of("日本語日本語"), None);
    }
}
