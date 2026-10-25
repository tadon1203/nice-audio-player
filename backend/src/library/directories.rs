//! The registered music directories: listing them, and the writes that change them. The write side
//! (the sync worker) is the only caller of `add`, `set_enabled`, `remove` and `delete_missing`.

use super::{
    StoreError, albums, database::Database, models::LibraryDirectory, version::LibraryVersion,
};
use crate::errors::CommandError;
use crate::ids::{DirectoryId, directory_id_column};
use rusqlite::{Connection, params};
use std::path::Path;

pub(crate) fn list(connection: &Connection) -> Result<Vec<LibraryDirectory>, StoreError> {
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
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Adds the directory at `input`. The path is validated here: it must exist,
/// be a directory, not contain the data directory, and neither repeat nor overlap a directory that is
/// already registered.
pub(crate) fn add(database: &Database, input: &str) -> Result<LibraryDirectory, CommandError> {
    if input.trim().is_empty() {
        return Err(CommandError::InvalidDirectory);
    }
    let canonical = dunce::canonicalize(input)
        .inspect_err(|cause| log::warn!("library.directories.canonicalize_failed cause={cause}"))
        .map_err(|_| CommandError::InvalidDirectory)?;
    if !canonical.is_dir() {
        return Err(CommandError::DirectoryNotDirectory);
    }
    let path = canonical
        .to_str()
        .ok_or(CommandError::InvalidDirectory)?
        .to_owned();
    // Compared canonically: the data directory may be reached through a link or a drive alias.
    let data_dir =
        dunce::canonicalize(database.data_dir()).unwrap_or_else(|_| database.data_dir().into());
    if data_dir.starts_with(&canonical) {
        return Err(CommandError::DirectoryContainsDataDirectory);
    }
    let reader = database.read().map_err(StoreError::from)?;
    for directory in list(&reader)? {
        let other = Path::new(&directory.path);
        if other == canonical || canonical.starts_with(other) || other.starts_with(&canonical) {
            return Err(if other == canonical {
                CommandError::DuplicateDirectory
            } else {
                CommandError::OverlappingDirectory
            });
        }
    }
    let connection = database.write().map_err(StoreError::from)?;
    connection
        .execute(
            "INSERT INTO directories(path, enabled, scan_generation) VALUES(?1, 1, 0)",
            params![path],
        )
        .map_err(StoreError::from)?;
    Ok(LibraryDirectory {
        id: DirectoryId::try_from_rowid(connection.last_insert_rowid())
            .ok_or(StoreError::Persistence)?,
        path,
        enabled: true,
        last_successful_scan_at_ms: None,
        track_count: 0,
        missing_count: 0,
    })
}

pub(crate) fn set_enabled(
    database: &Database,
    id: DirectoryId,
    enabled: bool,
) -> Result<(), CommandError> {
    let connection = database.write().map_err(StoreError::from)?;
    let changed = connection
        .execute(
            "UPDATE directories SET enabled = ?2 WHERE id = ?1",
            params![id.rowid(), enabled],
        )
        .map_err(StoreError::from)?;
    if changed == 0 {
        return Err(CommandError::DirectoryMissing);
    }
    Ok(())
}

/// Removes the directory with its files, tracks and metadata (they cascade), then rebuilds the albums.
pub(crate) fn remove(
    database: &Database,
    id: DirectoryId,
    version: &LibraryVersion,
) -> Result<(), CommandError> {
    let mut connection = database.write().map_err(StoreError::from)?;
    let transaction = connection.transaction().map_err(StoreError::from)?;
    let removed = transaction
        .execute("DELETE FROM directories WHERE id = ?1", params![id.rowid()])
        .map_err(StoreError::from)?;
    if removed == 0 {
        return Err(CommandError::DirectoryMissing);
    }
    albums::rebuild(&transaction, version).map_err(StoreError::from)?;
    transaction.commit().map_err(StoreError::from)?;
    Ok(())
}

/// Forgets the tracks whose file is gone, for good, then rebuilds the albums. Never touches a source
/// file. Returns how many tracks went.
pub(crate) fn delete_missing(
    database: &Database,
    version: &LibraryVersion,
) -> Result<u32, CommandError> {
    let mut connection = database.write().map_err(StoreError::from)?;
    let transaction = connection.transaction().map_err(StoreError::from)?;
    let tracks: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM library_files f JOIN tracks t ON t.file_id = f.id
             WHERE f.availability = 'missing'",
            [],
            |row| row.get(0),
        )
        .map_err(StoreError::from)?;
    // Tracks and their metadata cascade.
    transaction
        .execute(
            "DELETE FROM library_files WHERE availability = 'missing'",
            [],
        )
        .map_err(StoreError::from)?;
    albums::rebuild(&transaction, version).map_err(StoreError::from)?;
    transaction.commit().map_err(StoreError::from)?;
    u32::try_from(tracks).map_err(|_| CommandError::PersistenceFailed)
}
