//! One track: its summary, its properties and where its file is.

use super::LibraryStore;
use crate::ids::{AlbumId, ArtistId, ArtworkHash, TrackId, album_id_column, track_id_column};
use crate::library::{
    artwork::{ArtworkMimeType, ArtworkRef},
    error::StoreError,
    location::TrackLocation,
    models::{
        ArtistRef, LibraryTrackProperties, LibraryTrackSummary, TrackAlbum, TrackCore, TrackState,
    },
    status::{Availability, InspectionStatus},
};
use rusqlite::{OptionalExtension, Row, params};

/// The state of a track, from its file's availability and inspection. Every DTO's `state` comes
/// from here, and so does the playback path's check that a track can play.
pub(super) fn track_state(availability: Availability, inspection: InspectionStatus) -> TrackState {
    match (availability, inspection) {
        (Availability::Missing, _) => TrackState::Missing,
        (Availability::Available, InspectionStatus::Indexed) => TrackState::Playable,
        (Availability::Available, InspectionStatus::Unsupported) => TrackState::Unsupported,
    }
}

/// The SQL condition, on the `f` alias of `library_files`, that holds for the files `track_state`
/// calls playable.
pub(super) fn playable_file_condition() -> String {
    format!(
        "f.availability = '{}' AND f.inspection_status = '{}'",
        Availability::Available.as_str(),
        InspectionStatus::Indexed.as_str()
    )
}

/// The columns `summary_from_row` reads, in its order.
pub(super) const SUMMARY_COLUMNS: &str = "t.id, m.title, m.artist, m.album, al.album_artist, m.duration_ms, a.content_hash, a.mime_type, m.file_format, m.bit_depth, m.bitrate_kbps, f.availability, f.inspection_status, m.album_id, al.artist_id";
pub(super) const SUMMARY_COLUMN_COUNT: usize = 15;

/// What `SUMMARY_COLUMNS` are selected from.
pub(super) const SUMMARY_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id LEFT JOIN albums al ON al.id = m.album_id";

pub(super) fn non_blank(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

pub(super) fn artwork_ref(
    hash: Option<String>,
    mime_type: Option<ArtworkMimeType>,
) -> Option<ArtworkRef> {
    Some(ArtworkRef {
        hash: ArtworkHash::try_from(hash?).ok()?,
        mime_type: mime_type?,
    })
}

/// The album of a track: `None` for a track with no album tag, which has no album ID either. An
/// album row always comes with its Album Artist, so a missing one is treated as no album.
pub(super) fn track_album(
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
        artist: ArtistRef {
            id: artist_id?,
            name: artist_name?,
        },
    })
}

pub(super) fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<LibraryTrackSummary> {
    let title: String = row.get(3)?;
    let duration: Option<i64> = row.get(5)?;
    let state = track_state(row.get(11)?, row.get(12)?);
    let artist: String = row.get(2)?;
    let album = track_album(
        title,
        album_id_column(row, 13)?,
        row.get::<_, Option<String>>(14)?
            .and_then(|hex| ArtistId::from_hex(&hex)),
        row.get(4)?,
    );
    Ok(LibraryTrackSummary {
        core: TrackCore {
            id: track_id_column(row, 0)?,
            title: row.get(1)?,
            artist: (!artist.is_empty()).then_some(artist),
            duration_ms: duration.map(|value| value as u64),
            artwork: artwork_ref(row.get(6)?, row.get(7)?),
        },
        state,
        album,
        file_format: non_blank(row.get(8)?),
        bit_depth: row.get::<_, Option<i64>>(9)?.map(|value| value as u32),
        bitrate_kbps: row.get::<_, Option<i64>>(10)?.map(|value| value as u64),
    })
}

impl LibraryStore {
    /// Where the track's file is. The one query every consumer of a track's path goes through.
    pub fn track_location(&self, id: TrackId) -> Result<TrackLocation, StoreError> {
        let connection = self.read()?;
        let (root, relative, availability): (String, String, Availability) = connection
            .query_row(
                "SELECT r.path, f.relative_path, f.availability
                 FROM tracks t
                 JOIN library_files f ON f.id = t.file_id
                 JOIN library_roots r ON r.id = f.root_id
                 WHERE t.id = ?1",
                params![id.rowid()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?
            .ok_or(StoreError::TrackNotFound)?;
        Ok(TrackLocation::new(
            &root,
            &relative,
            availability == Availability::Available,
        ))
    }

    /// Tags, audio format and the file's path, or `None` for an unknown track.
    pub fn track_properties(
        &self,
        id: TrackId,
    ) -> Result<Option<LibraryTrackProperties>, StoreError> {
        let location = match self.track_location(id) {
            Ok(location) => location,
            Err(StoreError::TrackNotFound) => return Ok(None),
            Err(error) => return Err(error),
        };
        let path = location.path()?.to_string_lossy().into_owned();
        let connection = self.read()?;
        Ok(connection
            .query_row(
                "SELECT f.file_name, m.tag_title, m.tag_artist, m.tag_album, m.tag_album_artist,
                        m.track_number, m.track_total, m.disc_number, m.disc_total, m.genre, m.date,
                        m.duration_ms, m.file_format, m.codec, m.sample_rate, m.channel_count,
                        m.bit_depth, m.bitrate_kbps, f.availability, f.inspection_status
                 FROM tracks t
                 JOIN library_files f ON f.id = t.file_id
                 JOIN track_source_metadata m ON m.track_id = t.id
                 WHERE t.id = ?1",
                params![id.rowid()],
                |row| {
                    let number = |index: usize| -> rusqlite::Result<Option<u32>> {
                        Ok(row
                            .get::<_, Option<i64>>(index)?
                            .and_then(|value| u32::try_from(value).ok()))
                    };
                    Ok(LibraryTrackProperties {
                        id,
                        path: path.clone(),
                        file_name: row.get(0)?,
                        title: non_blank(row.get(1)?),
                        artist: non_blank(row.get(2)?),
                        album: non_blank(row.get(3)?),
                        album_artist: non_blank(row.get(4)?),
                        track_number: number(5)?,
                        track_total: number(6)?,
                        disc_number: number(7)?,
                        disc_total: number(8)?,
                        genre: non_blank(row.get(9)?),
                        date: non_blank(row.get(10)?),
                        duration_ms: row
                            .get::<_, Option<i64>>(11)?
                            .and_then(|value| u64::try_from(value).ok()),
                        file_format: non_blank(row.get(12)?),
                        codec: non_blank(row.get(13)?),
                        sample_rate: number(14)?,
                        channel_count: number(15)?,
                        bit_depth: number(16)?,
                        bitrate_kbps: number(17)?,
                        state: track_state(row.get(18)?, row.get(19)?),
                    })
                },
            )
            .optional()?)
    }
}
