//! Resolves library selections (an album, the track list under a filter) into the tracks a
//! playback queue is built from.

use super::{
    catalog::{track_filter, track_ordering, validate_album_key, ALBUM_ORDER},
    track::{artwork_ref, non_blank},
    LibraryStore,
};
use crate::library::{
    artwork::ArtworkRef,
    error::{parse_id, StoreError},
    location::TrackLocation,
    models::{LibraryAlbumKey, LibrarySortDirection, LibraryTrackSortKey},
    status::{Availability, InspectionStatus},
};
use crate::media::validation::{describe_audio_file, validate_audio_file, ValidatedAudioFile};
use rusqlite::{params, Connection, Row};
use std::collections::{hash_map::Entry, HashMap};

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
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u32>,
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
    PersistenceFailed,
}

impl From<StoreError> for PlaybackSourceError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::InvalidId | StoreError::TrackNotFound => Self::InvalidTrackId,
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
    track_id: i64,
    location: TrackLocation,
    indexed: bool,
    title: String,
    artist: String,
    album: String,
    album_artist: Option<String>,
    album_artist_key: String,
    duration_ms: Option<i64>,
    artwork: Option<ArtworkRef>,
    track_number: Option<i64>,
    disc_number: Option<i64>,
    year: Option<i32>,
    file_format: Option<String>,
    bit_depth: Option<u32>,
    bitrate_kbps: Option<u32>,
}

impl PlaybackRow {
    fn available(&self) -> bool {
        self.location.available()
    }

    fn album_key(&self) -> Option<LibraryAlbumKey> {
        (!self.album.is_empty()).then(|| LibraryAlbumKey {
            title: self.album.clone(),
            album_artist: self.album_artist_key.clone(),
        })
    }
}

type AlbumCounts = HashMap<LibraryAlbumKey, u32>;

/// The columns every playback query returns, in the order `playback_row` reads them, and what they
/// are selected from.
const PLAYBACK_COLUMNS: &str = "t.id, r.path, f.relative_path, f.availability, f.inspection_status, m.title_key, m.artist_key, m.album_key, m.album_artist, m.album_artist_key, m.duration_ms, a.content_hash, a.mime_type, a.relative_path, m.track_number, m.disc_number, m.year, m.file_format, m.bit_depth, m.bitrate_kbps";
const PLAYBACK_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id JOIN library_roots r ON r.id = f.root_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id";

fn playback_row(row: &Row<'_>) -> rusqlite::Result<PlaybackRow> {
    let root: String = row.get(1)?;
    let relative: String = row.get(2)?;
    let availability: Availability = row.get(3)?;
    let inspection: InspectionStatus = row.get(4)?;
    Ok(PlaybackRow {
        track_id: row.get(0)?,
        location: TrackLocation::new(&root, &relative, availability == Availability::Available),
        indexed: inspection == InspectionStatus::Indexed,
        title: row.get(5)?,
        artist: row.get(6)?,
        album: row.get(7)?,
        album_artist: row.get(8)?,
        album_artist_key: row.get(9)?,
        duration_ms: row.get(10)?,
        artwork: artwork_ref(row.get(11)?, row.get(12)?, row.get(13)?),
        track_number: row.get(14)?,
        disc_number: row.get(15)?,
        year: row.get(16)?,
        file_format: non_blank(row.get(17)?),
        bit_depth: row
            .get::<_, Option<i64>>(18)?
            .and_then(|value| u32::try_from(value).ok()),
        bitrate_kbps: row
            .get::<_, Option<i64>>(19)?
            .and_then(|value| u32::try_from(value).ok()),
    })
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
        if !row.available() || !row.indexed {
            if requested {
                return Err(if row.available() {
                    PlaybackSourceError::TrackNotPlayable
                } else {
                    PlaybackSourceError::TrackUnavailable
                });
            }
            continue;
        }
        // A file that vanished since the scan fails when it is loaded, and the queue moves on.
        // The track the listener picked is checked now so they get a clear answer.
        let file = if requested {
            let existing = row
                .location
                .existing()
                .map_err(|_| PlaybackSourceError::TrackUnavailable)?;
            validate_audio_file(&existing.path.to_string_lossy())
                .map_err(|_| PlaybackSourceError::TrackUnavailable)?
        } else {
            let Ok(path) = row.location.path() else {
                continue;
            };
            match describe_audio_file(&path.to_string_lossy()) {
                Ok(file) => file,
                Err(_) => continue,
            }
        };
        if requested {
            start_index = Some(tracks.len());
        }
        let album_key = row.album_key();
        let album_track_count = album_key.as_ref().and_then(|key| counts.get(key).copied());
        tracks.push(PlayableTrack {
            track_id: row.track_id.to_string(),
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

impl LibraryStore {
    /// The album in disc and track order.
    pub fn playback_for_album(
        &self,
        key: &LibraryAlbumKey,
        start_track_id: Option<&str>,
    ) -> Result<PlaybackSelection, PlaybackSourceError> {
        validate_album_key(key)?;
        let start_track_id = parse_start_track(start_track_id)?;
        let connection = self.read()?;
        let rows = collect_rows(
            &connection,
            &format!(
                "SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM}
                 WHERE m.album_artist_key = ?1 AND m.album_key = ?2
                 ORDER BY {ALBUM_ORDER}"
            ),
            params![key.album_artist, key.title],
        )?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::AlbumNotFound);
        }
        // An album's rows are all its members, so they count themselves.
        let counts = AlbumCounts::from([(key.clone(), rows.len() as u32)]);
        select_playable(rows, &counts, start_track_id)
    }

    /// One track, for adding to a queue that is already playing.
    pub fn playback_for_track(&self, track_id: &str) -> Result<PlayableTrack, PlaybackSourceError> {
        let track_id = parse_id(track_id).map_err(|_| PlaybackSourceError::InvalidTrackId)?;
        let connection = self.read()?;
        let rows = collect_rows(
            &connection,
            &format!("SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE t.id = ?1"),
            params![track_id],
        )?;
        if rows.is_empty() {
            return Err(PlaybackSourceError::InvalidTrackId);
        }
        let counts = album_counts(&connection, &rows)?;
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
        let connection = self.read()?;
        let mut statement = connection
            .prepare(&format!(
                "SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE t.id = ?1"
            ))
            .map_err(StoreError::from)?;
        let mut rows = Vec::with_capacity(track_ids.len());
        for id in track_ids {
            let id = parse_id(id).map_err(|_| PlaybackSourceError::InvalidTrackId)?;
            let found = statement
                .query_map(params![id], playback_row)
                .map_err(StoreError::from)?
                .next()
                .transpose()
                .map_err(StoreError::from)?;
            rows.extend(found);
        }
        let counts = album_counts(&connection, &rows)?;
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
        let filter = track_filter(search);
        let connection = self.read()?;
        let rows = collect_rows(
            &connection,
            &format!(
                "SELECT {PLAYBACK_COLUMNS} {PLAYBACK_FROM} WHERE {} ORDER BY {}",
                filter.sql,
                track_ordering(sort_key, sort_direction).order_by()
            ),
            rusqlite::params_from_iter(filter.params),
        )?;
        let counts = album_counts(&connection, &rows)?;
        select_playable(rows, &counts, start_track_id)
    }
}

/// How many tracks the library holds for each album the rows belong to (and for no other).
fn album_counts(
    connection: &Connection,
    rows: &[PlaybackRow],
) -> Result<AlbumCounts, PlaybackSourceError> {
    let mut statement = connection
        .prepare(
            "SELECT COUNT(*) FROM track_source_metadata WHERE album_artist_key = ?1 AND album_key = ?2",
        )
        .map_err(StoreError::from)?;
    let mut counts = AlbumCounts::new();
    for key in rows.iter().filter_map(PlaybackRow::album_key) {
        if let Entry::Vacant(slot) = counts.entry(key) {
            let count = statement
                .query_row(params![slot.key().album_artist, slot.key().title], |row| {
                    row.get(0)
                })
                .map_err(StoreError::from)?;
            slot.insert(count);
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
