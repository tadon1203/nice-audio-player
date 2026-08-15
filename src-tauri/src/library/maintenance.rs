#![allow(dead_code)]
use super::{artwork, database::Database};
use rusqlite::params;
use std::{collections::HashSet, fs, path::Path};

pub(crate) fn collect_source_artwork(database: &Database) -> Result<Vec<i64>, ()> {
    let data_dir = database.data_dir().to_path_buf();
    let rows = {
        let connection = database.read().map_err(|_| ())?;
        let mut statement = connection
            .prepare(
                "SELECT id,content_hash,mime_type,relative_path,byte_length FROM artwork_assets",
            )
            .map_err(|_| ())?;
        let mapped = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|_| ())?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(|_| ())?
    };
    let mut broken = Vec::new();
    for (id, hash, mime, relative, length) in rows {
        if !artwork::is_canonical_source_path(&hash, &mime, &relative) {
            continue;
        }
        let path = data_dir.join(&relative);
        let valid = fs::metadata(path)
            .map(|metadata| metadata.is_file() && metadata.len() == length as u64)
            .unwrap_or(false);
        if !valid {
            broken.push(id);
        }
    }
    let mut retry_roots = HashSet::new();
    let mut live_paths = HashSet::new();
    {
        let mut connection = database.write().map_err(|_| ())?;
        let tx = connection.transaction().map_err(|_| ())?;
        for asset_id in broken {
            let mut roots = tx.prepare("SELECT DISTINCT f.root_id FROM track_source_metadata m JOIN tracks t ON t.id=m.track_id JOIN library_files f ON f.id=t.file_id WHERE m.artwork_id=?1").map_err(|_| ())?;
            let ids = roots
                .query_map(params![asset_id], |row| row.get::<_, i64>(0))
                .map_err(|_| ())?;
            for id in ids.flatten() {
                retry_roots.insert(id);
            }
            tx.execute("UPDATE track_source_metadata SET artwork_id=NULL,artwork_status='storeFailed' WHERE artwork_id=?1", params![asset_id]).map_err(|_| ())?;
        }
        tx.execute("DELETE FROM artwork_assets WHERE id NOT IN (SELECT DISTINCT artwork_id FROM track_source_metadata WHERE artwork_id IS NOT NULL)", []).map_err(|_| ())?;
        let mut statement = tx
            .prepare("SELECT content_hash,mime_type,relative_path FROM artwork_assets")
            .map_err(|_| ())?;
        let live = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| ())?;
        for row in live.flatten() {
            if artwork::is_canonical_source_path(&row.0, &row.1, &row.2) {
                live_paths.insert(row.2);
            }
        }
        drop(statement);
        tx.commit().map_err(|_| ())?;
    }
    remove_unowned_files(&data_dir, &live_paths);
    Ok(retry_roots.into_iter().collect())
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
                || (artwork::is_canonical_relative_path(&relative)
                    && !live_paths.contains(&relative))
            {
                let _ = fs::remove_file(path);
            }
        }
    }
}

