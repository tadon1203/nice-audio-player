//! Housekeeping for the artwork store: unlink artwork whose file is gone, forget assets no track
//! uses, and delete files no asset owns.

use super::{
    artwork::{ArtworkMimeType, ArtworkPath},
    database::Database,
    error::StoreError,
    status::ArtworkStatus,
};
use rusqlite::params;
use std::{collections::HashSet, fs, path::Path};

/// Collects the artwork store's garbage and returns the folders whose artwork was found missing,
/// so they can be scanned again to store it.
pub(crate) fn collect_source_artwork(database: &Database) -> Result<Vec<i64>, StoreError> {
    let data_dir = database.data_dir().to_path_buf();
    let broken = broken_assets(database, &data_dir)?;
    let mut retry_roots = HashSet::new();
    let mut live_paths = HashSet::new();
    {
        let mut connection = database.write()?;
        let transaction = connection.transaction()?;
        for asset_id in broken {
            let mut roots = transaction.prepare(
                "SELECT DISTINCT f.root_id FROM track_source_metadata m
                 JOIN tracks t ON t.id = m.track_id
                 JOIN library_files f ON f.id = t.file_id
                 WHERE m.artwork_id = ?1",
            )?;
            for id in roots.query_map(params![asset_id], |row| row.get::<_, i64>(0))? {
                retry_roots.insert(id?);
            }
            transaction.execute(
                "UPDATE track_source_metadata SET artwork_id = NULL, artwork_status = ?2
                 WHERE artwork_id = ?1",
                params![asset_id, ArtworkStatus::StoreFailed],
            )?;
        }
        transaction.execute(
            "DELETE FROM artwork_assets
             WHERE id NOT IN (SELECT DISTINCT artwork_id FROM track_source_metadata WHERE artwork_id IS NOT NULL)",
            [],
        )?;
        let mut statement = transaction
            .prepare("SELECT content_hash, mime_type, relative_path FROM artwork_assets")?;
        let live = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, ArtworkMimeType>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        for row in live {
            let (hash, mime_type, relative) = row?;
            if ArtworkPath::is_canonical(&hash, mime_type, &relative) {
                live_paths.insert(relative);
            }
        }
        drop(statement);
        transaction.commit()?;
    }
    remove_unowned_files(&data_dir, &live_paths);
    Ok(retry_roots.into_iter().collect())
}

/// The assets whose file is missing or has the wrong size.
fn broken_assets(database: &Database, data_dir: &Path) -> Result<Vec<i64>, StoreError> {
    let connection = database.read()?;
    let mut statement = connection.prepare(
        "SELECT id, content_hash, mime_type, relative_path, byte_length FROM artwork_assets",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, ArtworkMimeType>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;
    let mut broken = Vec::new();
    for row in rows {
        let (id, hash, mime_type, relative, length) = row?;
        if !ArtworkPath::is_canonical(&hash, mime_type, &relative) {
            continue;
        }
        let valid = fs::metadata(data_dir.join(&relative))
            .map(|metadata| metadata.is_file() && metadata.len() == length as u64)
            .unwrap_or(false);
        if !valid {
            broken.push(id);
        }
    }
    Ok(broken)
}

fn remove_unowned_files(data_dir: &Path, live_paths: &HashSet<String>) {
    let root = data_dir.join("artwork");
    let Ok(shards) = fs::read_dir(root) else {
        return;
    };
    for shard in shards.flatten() {
        let Ok(entries) = fs::read_dir(shard.path()) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
                continue;
            };
            let relative = format!("artwork/{}/{}", shard.file_name().to_string_lossy(), name);
            if name.contains(".tmp-")
                || (ArtworkPath::parse(&relative).is_some() && !live_paths.contains(&relative))
            {
                let _ = fs::remove_file(path);
            }
        }
    }
}
