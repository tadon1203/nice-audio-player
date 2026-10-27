//! The Library directories: listing them, and the writes that change them. The write side (the sync
//! worker) is the only caller of `add_directory`, `set_directory_enabled` and `remove_directory`.

use crate::ids::{DirectoryId, directory_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::storage::Database;
use crate::library::sync::rebuild::rebuild_albums_and_artists;
use crate::library::sync::state::LibraryDirectory;
use rusqlite::{Connection, params};
use std::path::Path;

/// Every Library directory, with the counts of its tracks.
pub(crate) fn list_directories(connection: &Connection) -> Result<Vec<LibraryDirectory>> {
    let mut statement = connection.prepare(
        "SELECT directory.id, directory.path, directory.enabled,
                directory.last_successful_scan_at_ms,
                (SELECT COUNT(*) FROM library_files file JOIN tracks track ON track.file_id = file.id
                  WHERE file.directory_id = directory.id AND file.availability = 'available')
                  AS track_count,
                (SELECT COUNT(*) FROM library_files file JOIN tracks track ON track.file_id = file.id
                  WHERE file.directory_id = directory.id AND file.availability = 'missing')
                  AS missing_count
         FROM directories directory ORDER BY directory.id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LibraryDirectory {
            id: directory_id_column(row, "id")?,
            path: row.get("path")?,
            enabled: row.get("enabled")?,
            last_successful_scan_at_ms: row
                .get::<_, Option<i64>>("last_successful_scan_at_ms")?
                .map(|value| value as u64),
            track_count: row.get::<_, i64>("track_count")? as u64,
            missing_count: row.get::<_, i64>("missing_count")? as u64,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Adds the directory at `input`. The path is validated here: it must exist,
/// be a directory, not contain the data directory, and neither repeat nor overlap a directory that is
/// already registered.
pub(crate) fn add_directory(database: &Database, input: &str) -> Result<LibraryDirectory> {
    if input.trim().is_empty() {
        return Err(LibraryError::InvalidDirectory(None));
    }
    let canonical =
        dunce::canonicalize(input).map_err(|cause| LibraryError::InvalidDirectory(Some(cause)))?;
    if !canonical.is_dir() {
        return Err(LibraryError::InvalidDirectory(None));
    }
    let path = canonical
        .to_str()
        .ok_or(LibraryError::InvalidDirectory(None))?
        .to_owned();
    // Compared canonically: the data directory may be reached through a link or a drive alias.
    let data_dir =
        dunce::canonicalize(database.data_dir()).unwrap_or_else(|_| database.data_dir().into());
    if data_dir.starts_with(&canonical) {
        return Err(LibraryError::DirectoryContainsDataDirectory);
    }
    let reader = database.read()?;
    for directory in list_directories(&reader)? {
        let other = Path::new(&directory.path);
        if other == canonical {
            return Err(LibraryError::DuplicateDirectory);
        }
        if canonical.starts_with(other) || other.starts_with(&canonical) {
            return Err(LibraryError::OverlappingDirectory);
        }
    }
    let connection = database.write()?;
    connection.execute(
        "INSERT INTO directories(path, enabled, scan_generation) VALUES(?1, 1, 0)",
        params![path],
    )?;
    Ok(LibraryDirectory {
        // SQLite gives every new row a positive rowid.
        id: DirectoryId::try_from_rowid(connection.last_insert_rowid())
            .expect("a new row has a positive rowid"),
        path,
        enabled: true,
        last_successful_scan_at_ms: None,
        track_count: 0,
        missing_count: 0,
    })
}

/// Sets whether the directory is enabled. A directory that is gone has nothing to change.
pub(crate) fn set_directory_enabled(
    database: &Database,
    id: DirectoryId,
    enabled: bool,
) -> Result<()> {
    let connection = database.write()?;
    connection.execute(
        "UPDATE directories SET enabled = ?2 WHERE id = ?1",
        params![id.rowid(), enabled],
    )?;
    Ok(())
}

/// Removes the directory with its files, tracks and metadata (they cascade), then rebuilds the albums.
/// A directory that is gone has nothing to remove.
pub(crate) fn remove_directory(database: &Database, id: DirectoryId) -> Result<()> {
    let mut connection = database.write()?;
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM directories WHERE id = ?1", params![id.rowid()])?;
    rebuild_albums_and_artists(&transaction)?;
    transaction.commit()?;
    Ok(())
}
