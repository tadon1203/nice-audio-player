//! The registered music directories: listing them, and the writes that change them. The write side
//! (the sync worker) is the only caller of `add`, `set_enabled`, `remove` and `delete_missing`.

use super::{albums, database::Database, models::LibraryDirectory};
use crate::ids::{DirectoryId, directory_id_column};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use rusqlite::{Connection, params};
use std::path::Path;

pub(crate) fn list(connection: &Connection) -> Result<Vec<LibraryDirectory>> {
    let mut statement = connection.prepare(
        "SELECT f.id, f.path, f.enabled, f.last_successful_scan_at_ms,
                (SELECT COUNT(*) FROM library_files l JOIN tracks t ON t.file_id = l.id
                  WHERE l.directory_id = f.id AND l.availability = 'available'),
                (SELECT COUNT(*) FROM library_files l JOIN tracks t ON t.file_id = l.id
                  WHERE l.directory_id = f.id AND l.availability = 'missing')
         FROM directories f ORDER BY f.id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LibraryDirectory {
            id: directory_id_column(row, 0)?,
            path: row.get(1)?,
            enabled: row.get(2)?,
            last_successful_scan_at_ms: row.get::<_, Option<i64>>(3)?.map(|value| value as u64),
            track_count: row.get::<_, i64>(4)? as u64,
            missing_count: row.get::<_, i64>(5)? as u64,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Adds the directory at `input`. The path is validated here: it must exist,
/// be a directory, not contain the data directory, and neither repeat nor overlap a directory that is
/// already registered.
pub(crate) fn add(database: &Database, input: &str) -> Result<LibraryDirectory> {
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
    for directory in list(&reader)? {
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
pub(crate) fn set_enabled(database: &Database, id: DirectoryId, enabled: bool) -> Result<()> {
    let connection = database.write()?;
    connection.execute(
        "UPDATE directories SET enabled = ?2 WHERE id = ?1",
        params![id.rowid(), enabled],
    )?;
    Ok(())
}

/// Removes the directory with its files, tracks and metadata (they cascade), then rebuilds the albums.
/// A directory that is gone has nothing to remove.
pub(crate) fn remove(database: &Database, id: DirectoryId) -> Result<()> {
    let mut connection = database.write()?;
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM directories WHERE id = ?1", params![id.rowid()])?;
    albums::rebuild(&transaction)?;
    transaction.commit()?;
    Ok(())
}

/// Forgets the tracks whose file is gone, for good, then rebuilds the albums. Never touches a source
/// file.
pub(crate) fn delete_missing(database: &Database) -> Result<()> {
    let mut connection = database.write()?;
    let transaction = connection.transaction()?;
    // Tracks and their metadata cascade.
    transaction.execute(
        "DELETE FROM library_files WHERE availability = 'missing'",
        [],
    )?;
    albums::rebuild(&transaction)?;
    transaction.commit()?;
    Ok(())
}
