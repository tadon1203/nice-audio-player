//! What the library knows about one track, for the Properties view.

use super::models::LibraryTrackProperties;
use super::service::{parse_id, LibraryCommandError, LibraryShared};
use rusqlite::{params, OptionalExtension};
use std::path::Path;

fn non_blank(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

impl LibraryShared {
    /// Tags, audio format and the file's location, or `None` for an unknown track.
    pub fn track_properties(
        &self,
        id: &str,
    ) -> Result<Option<LibraryTrackProperties>, LibraryCommandError> {
        let numeric_id = parse_id(id)?;
        let connection = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        connection
            .query_row(
                "SELECT r.path, f.relative_path, f.file_name, m.title, m.artist, m.album, m.album_artist,
                        m.track_number, m.track_total, m.disc_number, m.disc_total, m.genre, m.date,
                        m.duration_ms, m.file_format, m.codec, m.sample_rate, m.channel_count,
                        m.bit_depth, m.bitrate_kbps
                 FROM tracks t
                 JOIN library_files f ON f.id=t.file_id
                 JOIN library_roots r ON r.id=f.root_id
                 LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
                 WHERE t.id=?1",
                params![numeric_id],
                |row| {
                    let root: String = row.get(0)?;
                    let relative: String = row.get(1)?;
                    let number = |index: usize| -> rusqlite::Result<Option<u32>> {
                        Ok(row
                            .get::<_, Option<i64>>(index)?
                            .and_then(|value| u32::try_from(value).ok()))
                    };
                    Ok(LibraryTrackProperties {
                        id: id.to_owned(),
                        path: Path::new(&root)
                            .join(&relative)
                            .to_string_lossy()
                            .into_owned(),
                        file_name: row.get(2)?,
                        title: non_blank(row.get(3)?),
                        artist: non_blank(row.get(4)?),
                        album: non_blank(row.get(5)?),
                        album_artist: non_blank(row.get(6)?),
                        track_number: number(7)?,
                        track_total: number(8)?,
                        disc_number: number(9)?,
                        disc_total: number(10)?,
                        genre: non_blank(row.get(11)?),
                        date: non_blank(row.get(12)?),
                        duration_ms: row
                            .get::<_, Option<i64>>(13)?
                            .and_then(|value| u64::try_from(value).ok()),
                        file_format: non_blank(row.get(14)?),
                        codec: non_blank(row.get(15)?),
                        sample_rate: number(16)?,
                        channel_count: number(17)?,
                        bit_depth: number(18)?,
                        bitrate_kbps: number(19)?,
                    })
                },
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)
    }

    /// The file's full path, for revealing it in the file manager. Only a file that is still
    /// there is revealed.
    pub fn track_file_path(&self, id: &str) -> Result<String, LibraryCommandError> {
        let numeric_id = parse_id(id)?;
        let connection = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let (root, relative): (String, String) = connection
            .query_row(
                "SELECT r.path, f.relative_path FROM tracks t JOIN library_files f ON f.id=t.file_id JOIN library_roots r ON r.id=f.root_id WHERE t.id=?1",
                params![numeric_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?
            .ok_or(LibraryCommandError::TrackNotFound)?;
        let path = Path::new(&root).join(relative);
        if !path.is_file() {
            return Err(LibraryCommandError::TrackUnavailable);
        }
        Ok(path.to_string_lossy().into_owned())
    }
}
