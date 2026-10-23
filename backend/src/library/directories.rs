//! The registered music directories: listing them, and the writes that change them. The write side
//! (the sync actor) is the only caller of `register`, `set_enabled` and `remove`.

use super::{
    database::Database,
    error::{LibraryCommandError, StoreError},
    models::LibraryDirectory,
    summary,
};
use crate::errors::logged;
use crate::ids::{DirectoryId, directory_id_column};
use rusqlite::{Connection, params};
use std::path::Path;

pub(crate) fn list(connection: &Connection) -> Result<Vec<LibraryDirectory>, StoreError> {
    let mut statement = connection.prepare(
        "SELECT r.id, r.path, r.enabled, r.scan_generation, r.last_successful_scan_at_ms,
                (SELECT COUNT(*) FROM library_files f JOIN tracks t ON t.file_id = f.id
                  WHERE f.root_id = r.id AND f.availability = 'available'),
                (SELECT COUNT(*) FROM library_files f JOIN tracks t ON t.file_id = f.id
                  WHERE f.root_id = r.id AND f.availability = 'missing')
         FROM library_roots r ORDER BY r.id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LibraryDirectory {
            id: directory_id_column(row, 0)?,
            path: row.get(1)?,
            enabled: row.get(2)?,
            scan_generation: row.get::<_, i64>(3)? as u64,
            last_successful_scan_at_ms: row.get::<_, Option<i64>>(4)?.map(|value| value as u64),
            track_count: row.get::<_, i64>(5)? as u64,
            missing_count: row.get::<_, i64>(6)? as u64,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub(crate) fn register(
    database: &Database,
    input: &str,
) -> Result<LibraryDirectory, LibraryCommandError> {
    if input.trim().is_empty() {
        return Err(LibraryCommandError::InvalidDirectory);
    }
    let canonical = dunce::canonicalize(input).map_err(logged(
        LibraryCommandError::CanonicalizationFailed,
        "library.directories.canonicalize_failed",
    ))?;
    if !canonical.is_dir() {
        return Err(LibraryCommandError::DirectoryNotDirectory);
    }
    let path = canonical
        .to_str()
        .ok_or(LibraryCommandError::CanonicalizationFailed)?
        .to_owned();
    // Compared canonically: the data directory may be reached through a link or a drive alias.
    let data_dir =
        dunce::canonicalize(database.data_dir()).unwrap_or_else(|_| database.data_dir().into());
    if data_dir.starts_with(&canonical) {
        return Err(LibraryCommandError::DirectoryContainsDataDirectory);
    }
    let reader = database.read().map_err(StoreError::from)?;
    for directory in list(&reader)? {
        let other = Path::new(&directory.path);
        if other == canonical || canonical.starts_with(other) || other.starts_with(&canonical) {
            return Err(if other == canonical {
                LibraryCommandError::DuplicateDirectory
            } else {
                LibraryCommandError::OverlappingDirectory
            });
        }
    }
    let connection = database.write().map_err(StoreError::from)?;
    connection
        .execute(
            "INSERT INTO library_roots(path, enabled, scan_generation) VALUES(?1, 1, 0)",
            params![path],
        )
        .map_err(StoreError::from)?;
    Ok(LibraryDirectory {
        id: DirectoryId::try_from_rowid(connection.last_insert_rowid())
            .ok_or(StoreError::Persistence)?,
        path,
        enabled: true,
        scan_generation: 0,
        last_successful_scan_at_ms: None,
        track_count: 0,
        missing_count: 0,
    })
}

pub(crate) fn set_enabled(
    database: &Database,
    id: DirectoryId,
    enabled: bool,
) -> Result<LibraryDirectory, LibraryCommandError> {
    let connection = database.write().map_err(StoreError::from)?;
    let changed = connection
        .execute(
            "UPDATE library_roots SET enabled = ?2 WHERE id = ?1",
            params![id.rowid(), enabled],
        )
        .map_err(StoreError::from)?;
    if changed == 0 {
        return Err(LibraryCommandError::DirectoryMissing);
    }
    list(&connection)?
        .into_iter()
        .find(|directory| directory.id == id)
        .ok_or(LibraryCommandError::DirectoryMissing)
}

/// Removes the directory with its files, tracks and metadata (they cascade).
pub(crate) fn remove(database: &Database, id: DirectoryId) -> Result<(), LibraryCommandError> {
    let mut connection = database.write().map_err(StoreError::from)?;
    let transaction = connection.transaction().map_err(StoreError::from)?;
    let removed = transaction
        .execute(
            "DELETE FROM library_roots WHERE id = ?1",
            params![id.rowid()],
        )
        .map_err(StoreError::from)?;
    if removed == 0 {
        return Err(LibraryCommandError::DirectoryMissing);
    }
    summary::rebuild(&transaction).map_err(StoreError::from)?;
    transaction.commit().map_err(StoreError::from)?;
    Ok(())
}

/// Forgets the tracks whose file is gone, for good. Never touches a source file. Returns how many
/// tracks went.
pub(crate) fn delete_missing(database: &Database) -> Result<u64, LibraryCommandError> {
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
    summary::rebuild(&transaction).map_err(StoreError::from)?;
    transaction.commit().map_err(StoreError::from)?;
    Ok(tracks as u64)
}
