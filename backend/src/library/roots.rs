//! The registered music folders: listing them, and the writes that change them. The write side
//! (the sync actor) is the only caller of `register`, `set_enabled` and `remove`.

use super::{
    database::Database,
    error::{parse_id, LibraryCommandError, StoreError},
    models::LibraryRoot,
};
use rusqlite::{params, Connection};
use std::path::Path;

pub(crate) fn list(connection: &Connection) -> Result<Vec<LibraryRoot>, StoreError> {
    let mut statement = connection.prepare(
        "SELECT id, path, enabled, scan_generation, last_successful_scan_at_ms FROM library_roots ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(LibraryRoot {
            id: row.get::<_, i64>(0)?.to_string(),
            path: row.get(1)?,
            enabled: row.get(2)?,
            scan_generation: row.get::<_, i64>(3)? as u64,
            last_successful_scan_at_ms: row.get::<_, Option<i64>>(4)?.map(|value| value as u64),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub(crate) fn register(
    database: &Database,
    input: &str,
) -> Result<LibraryRoot, LibraryCommandError> {
    if input.trim().is_empty() {
        return Err(LibraryCommandError::InvalidRoot);
    }
    let canonical =
        dunce::canonicalize(input).map_err(|_| LibraryCommandError::CanonicalizationFailed)?;
    if !canonical.is_dir() {
        return Err(LibraryCommandError::RootNotDirectory);
    }
    let path = canonical
        .to_str()
        .ok_or(LibraryCommandError::CanonicalizationFailed)?
        .to_owned();
    let reader = database.read().map_err(StoreError::from)?;
    for root in list(&reader)? {
        let other = Path::new(&root.path);
        if other == canonical || canonical.starts_with(other) || other.starts_with(&canonical) {
            return Err(if other == canonical {
                LibraryCommandError::DuplicateRoot
            } else {
                LibraryCommandError::OverlappingRoot
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
    Ok(LibraryRoot {
        id: connection.last_insert_rowid().to_string(),
        path,
        enabled: true,
        scan_generation: 0,
        last_successful_scan_at_ms: None,
    })
}

pub(crate) fn set_enabled(
    database: &Database,
    id: &str,
    enabled: bool,
) -> Result<LibraryRoot, LibraryCommandError> {
    let id = parse_id(id)?;
    let connection = database.write().map_err(StoreError::from)?;
    let changed = connection
        .execute(
            "UPDATE library_roots SET enabled = ?2 WHERE id = ?1",
            params![id, enabled],
        )
        .map_err(StoreError::from)?;
    if changed == 0 {
        return Err(LibraryCommandError::RootMissing);
    }
    list(&connection)?
        .into_iter()
        .find(|root| root.id == id.to_string())
        .ok_or(LibraryCommandError::RootMissing)
}

/// Removes the folder with its files, tracks and metadata (they cascade).
pub(crate) fn remove(database: &Database, id: &str) -> Result<(), LibraryCommandError> {
    let id = parse_id(id)?;
    let connection = database.write().map_err(StoreError::from)?;
    let removed = connection
        .execute("DELETE FROM library_roots WHERE id = ?1", params![id])
        .map_err(StoreError::from)?;
    if removed == 0 {
        return Err(LibraryCommandError::RootMissing);
    }
    Ok(())
}
