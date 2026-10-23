//! The Rust steps of schema versions 2 and 4, as those versions ran them. A migration runs them on
//! a database one version behind, so they use the columns of that version (`title_key`,
//! `album_dir`, …), not the ones the current code writes.
//!
//! Version 4 does not fill the summary tables. Version 5 rebuilds them from the tracks, so only the
//! track data is settled here (the compilations, which refile tracks).

use crate::library::keys::{SortTags, TrackKeys, album_edition_of, track_search_key};
use crate::library::summary::VARIOUS_ARTISTS;
use crate::library::text;
use rusqlite::{Transaction, params};

/// Gives every existing track the keys the scanner wrote at version 2, from the tags it has.
pub(super) fn backfill_track_keys(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    type Row = (i64, [Option<String>; 5], String);
    let rows: Vec<Row> = transaction
        .prepare(
            "SELECT m.track_id, m.title, m.artist, m.album, m.album_artist, m.date, f.file_name
             FROM track_source_metadata m
             JOIN tracks t ON t.id = m.track_id
             JOIN library_files f ON f.id = t.file_id",
        )?
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                [
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ],
                row.get(6)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    let mut update = transaction.prepare(
        "UPDATE track_source_metadata
         SET title_key = ?2, artist_key = ?3, album_key = ?4, album_artist_key = ?5, year = ?6
         WHERE track_id = ?1",
    )?;
    for (track_id, [title, artist, album, album_artist, date], file_name) in rows {
        let keys = TrackKeys::new(
            title.as_deref(),
            artist.as_deref(),
            album.as_deref(),
            album_artist.as_deref(),
            date.as_deref(),
            &file_name,
        );
        update.execute(params![
            track_id,
            keys.title,
            keys.artist,
            keys.album,
            keys.album_artist,
            keys.year
        ])?;
    }
    Ok(())
}

/// Gives every existing track the sort, search and `album_dir` keys from the tags it already has
/// (`SortOrder` tags arrive with the rescan this migration asks for), then settles the compilations.
pub(super) fn backfill_catalog_keys(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    type Row = (i64, [Option<String>; 5], String, String, String);
    let rows: Vec<Row> = transaction
        .prepare(
            "SELECT m.track_id, m.title, m.artist, m.album, m.album_artist, m.date, f.file_name,
                    f.root_id, f.relative_path, r.path
             FROM track_source_metadata m
             JOIN tracks t ON t.id = m.track_id
             JOIN library_files f ON f.id = t.file_id
             JOIN library_roots r ON r.id = f.root_id",
        )?
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                [
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ],
                row.get(6)?,
                album_edition_of(row.get(7)?, &row.get::<_, String>(8)?),
                row.get(9)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    let mut update = transaction.prepare(
        "UPDATE track_source_metadata
         SET title_key = ?2, artist_key = ?3, album_key = ?4, album_artist_key = ?5, year = ?6,
             title_sort = ?7, artist_sort = ?8, album_sort = ?9, album_artist_sort = ?10,
             search_key = ?11, album_dir = ?12
         WHERE track_id = ?1",
    )?;
    for (
        track_id,
        [title, artist, album, album_artist, date],
        file_name,
        album_directory,
        directory_path,
    ) in rows
    {
        let keys = TrackKeys::build(
            [
                title.as_deref(),
                artist.as_deref(),
                album.as_deref(),
                album_artist.as_deref(),
            ],
            date.as_deref(),
            &file_name,
            SortTags::default(),
            &album_directory,
            &directory_path,
        );
        update.execute(params![
            track_id,
            keys.title,
            keys.artist,
            keys.album,
            keys.album_artist,
            keys.year,
            keys.title_sort,
            keys.artist_sort,
            keys.album_sort,
            keys.album_artist_sort,
            keys.search,
            keys.album_directory,
        ])?;
    }
    settle_compilations(transaction)
}

/// Files the untagged tracks of every album directory: under Various Artists when they have several
/// artists, else each under its own (CONTEXT.md, "Compilation").
fn settle_compilations(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    let groups: Vec<(String, String)> = transaction
        .prepare(
            "SELECT DISTINCT album_dir, album_key FROM track_source_metadata
             WHERE album_key <> '' AND trim(COALESCE(album_artist, '')) = ''",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (directory, album) in groups {
        settle_compilation(transaction, &directory, &album)?;
    }
    Ok(())
}

fn settle_compilation(
    transaction: &Transaction<'_>,
    directory: &str,
    album: &str,
) -> rusqlite::Result<()> {
    struct Row {
        track_id: i64,
        title: String,
        artist: String,
        artist_sort: String,
        filed_under: String,
    }
    let rows: Vec<Row> = transaction
        .prepare(
            "SELECT track_id, title_key, artist_key, artist_sort, album_artist_key
             FROM track_source_metadata
             WHERE album_dir = ?1 AND album_key = ?2 AND trim(COALESCE(album_artist, '')) = ''",
        )?
        .query_map(params![directory, album], |row| {
            Ok(Row {
                track_id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                artist_sort: row.get(3)?,
                filed_under: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let artists: std::collections::BTreeSet<&str> = rows
        .iter()
        .map(|row| row.artist.as_str())
        .filter(|artist| !artist.is_empty())
        .collect();
    let compilation = artists.len() > 1;
    for row in &rows {
        let (under, sort) = if compilation {
            (VARIOUS_ARTISTS, text::sort_key(VARIOUS_ARTISTS, None))
        } else {
            (row.artist.as_str(), row.artist_sort.clone())
        };
        if under == row.filed_under {
            continue;
        }
        transaction
            .prepare_cached(
                "UPDATE track_source_metadata
                 SET album_artist_key = ?2, album_artist_sort = ?3, search_key = ?4
                 WHERE track_id = ?1",
            )?
            .execute(params![
                row.track_id,
                under,
                sort,
                track_search_key(&row.title, &row.artist, album, under),
            ])?;
    }
    Ok(())
}
