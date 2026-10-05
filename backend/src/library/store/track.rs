//! One track: its summary, its properties and where its file is.

use super::LibraryStore;
use crate::library::{
    artwork::{ArtworkMimeType, ArtworkRef},
    error::{parse_id, StoreError},
    location::TrackLocation,
    models::{LibraryAlbumKey, LibraryTrackProperties, LibraryTrackSummary},
    status::{Availability, InspectionStatus},
};
use rusqlite::{params, OptionalExtension, Row};

/// The columns `summary_from_row` reads, in its order.
pub(super) const SUMMARY_COLUMNS: &str = "t.id, m.title_key, m.artist_key, m.album_key, m.album_artist, m.album_artist_key, m.duration_ms, a.content_hash, a.mime_type, a.relative_path, m.file_format, m.bit_depth, m.bitrate_kbps, f.availability, f.inspection_status, m.album_dir";
pub(super) const SUMMARY_COLUMN_COUNT: usize = 16;

/// What `SUMMARY_COLUMNS` are selected from.
pub(super) const SUMMARY_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id";

pub(super) fn non_blank(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

pub(super) fn artwork_ref(
    hash: Option<String>,
    mime_type: Option<ArtworkMimeType>,
    path: Option<String>,
) -> Option<ArtworkRef> {
    Some(ArtworkRef {
        content_hash: hash?,
        mime_type: mime_type?,
        relative_path: path?,
    })
}

pub(super) fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<LibraryTrackSummary> {
    let id: i64 = row.get(0)?;
    let album: String = row.get(3)?;
    let album_artist_key: String = row.get(5)?;
    let duration: Option<i64> = row.get(6)?;
    let availability: Availability = row.get(13)?;
    let inspection: InspectionStatus = row.get(14)?;
    let artist: String = row.get(2)?;
    let album_edition: String = row.get(15)?;
    Ok(LibraryTrackSummary {
        id: id.to_string(),
        title: row.get(1)?,
        artist: (!artist.is_empty()).then_some(artist),
        album_key: (!album.is_empty()).then(|| LibraryAlbumKey {
            title: album.clone(),
            album_artist: album_artist_key,
            album_edition,
        }),
        album: (!album.is_empty()).then_some(album),
        album_artist: non_blank(row.get(4)?),
        artwork: artwork_ref(row.get(7)?, row.get(8)?, row.get(9)?),
        duration_ms: duration.map(|value| value as u64),
        file_format: non_blank(row.get(10)?),
        bit_depth: row.get::<_, Option<i64>>(11)?.map(|value| value as u32),
        bitrate_kbps: row.get::<_, Option<i64>>(12)?.map(|value| value as u64),
        playable: availability == Availability::Available
            && inspection == InspectionStatus::Indexed,
        availability,
    })
}

impl LibraryStore {
    /// One track's summary, looked up by its library id.
    pub fn track_by_id(&self, id: &str) -> Result<Option<LibraryTrackSummary>, StoreError> {
        let id = parse_id(id)?;
        let connection = self.read()?;
        Ok(connection
            .query_row(
                &format!("SELECT {SUMMARY_COLUMNS} {SUMMARY_FROM} WHERE t.id = ?1"),
                params![id],
                summary_from_row,
            )
            .optional()?)
    }

    /// Where the track's file is. The one query every consumer of a track's path goes through.
    pub fn track_location(&self, id: &str) -> Result<TrackLocation, StoreError> {
        let id = parse_id(id)?;
        let connection = self.read()?;
        let (root, relative, availability): (String, String, Availability) = connection
            .query_row(
                "SELECT r.path, f.relative_path, f.availability
                 FROM tracks t
                 JOIN library_files f ON f.id = t.file_id
                 JOIN library_roots r ON r.id = f.root_id
                 WHERE t.id = ?1",
                params![id],
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
    pub fn track_properties(&self, id: &str) -> Result<Option<LibraryTrackProperties>, StoreError> {
        let location = match self.track_location(id) {
            Ok(location) => location,
            Err(StoreError::TrackNotFound) => return Ok(None),
            Err(error) => return Err(error),
        };
        let path = location.path()?.to_string_lossy().into_owned();
        let connection = self.read()?;
        Ok(connection
            .query_row(
                "SELECT f.file_name, m.title, m.artist, m.album, m.album_artist,
                        m.track_number, m.track_total, m.disc_number, m.disc_total, m.genre, m.date,
                        m.duration_ms, m.file_format, m.codec, m.sample_rate, m.channel_count,
                        m.bit_depth, m.bitrate_kbps
                 FROM tracks t
                 JOIN library_files f ON f.id = t.file_id
                 JOIN track_source_metadata m ON m.track_id = t.id
                 WHERE t.id = ?1",
                params![parse_id(id)?],
                |row| {
                    let number = |index: usize| -> rusqlite::Result<Option<u32>> {
                        Ok(row
                            .get::<_, Option<i64>>(index)?
                            .and_then(|value| u32::try_from(value).ok()))
                    };
                    Ok(LibraryTrackProperties {
                        id: id.to_owned(),
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
                    })
                },
            )
            .optional()?)
    }
}
