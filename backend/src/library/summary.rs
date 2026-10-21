//! What the catalog lists albums and Album Artists from: one row each in `albums` and `artists`,
//! kept in step with the tracks inside the transaction that changes them, so a page of either is a
//! plain index range instead of an aggregate over every track. Aggregating per page is simpler, but
//! its cost grows with the whole Library on every page.
//!
//! It also settles **Compilations**: tracks that share a directory and an album title but not an
//! artist, and carry no Album Artist tag, are one album filed under Various Artists.
//!
//! The rows are computed by SQL from the tracks (`album_id()`, `artist_id()` and `search_key()` are
//! registered in `ids.rs`), so a rebuild and a single album give the same rows.

use super::keys;
use super::text;
use crate::ids::AlbumId;
use rusqlite::{OptionalExtension, Transaction, params, params_from_iter};
use std::collections::BTreeSet;
use std::ffi::OsStr;

/// The Album Artist compilations are filed under.
pub(crate) const VARIOUS_ARTISTS: &str = "Various Artists";

/// How many IDs one `IN (…)` list holds; far below SQLite's parameter limit.
const CHUNK: usize = 500;

/// The albums of the tracks, one row per `album_id`. The filter is either empty or a `WHERE` on
/// `m.album_id`.
const ALBUM_ROWS: &str = "INSERT INTO albums(id, artist_id, title, album_artist, album_directory,
                                  title_sort, album_artist_sort, search_text, year, track_count,
                                  cover_artwork_id)
     SELECT m.album_id, artist_id(m.album_artist), m.album, m.album_artist,
            MIN(m.album_directory), MIN(m.album_sort), MIN(m.album_artist_sort),
            search_key(m.album, m.album_artist), MIN(m.year), COUNT(*),
            (SELECT c.artwork_id FROM track_source_metadata c
             WHERE c.album_id = m.album_id AND c.artwork_id IS NOT NULL
             ORDER BY COALESCE(c.disc_number, 2147483647), COALESCE(c.track_number, 2147483647),
                      c.track_id
             LIMIT 1)
     FROM track_source_metadata m";

/// The Album Artists of the albums, one row per `artist_id`. The filter is either empty or a
/// `WHERE` on `a.artist_id`.
const ARTIST_ROWS: &str = "INSERT INTO artists(id, name, name_sort, search_text, album_count,
                                    track_count, cover_artwork_id)
     SELECT a.artist_id, a.album_artist, MIN(a.album_artist_sort), search_key(a.album_artist),
            COUNT(*), SUM(a.track_count),
            (SELECT b.cover_artwork_id FROM albums b WHERE b.artist_id = a.artist_id
             ORDER BY b.title = '', b.title_sort, b.title, b.id
             LIMIT 1)
     FROM albums a";

/// What a write changed: the albums and compilation groups it may have altered, to settle once
/// before the transaction commits. Albums are kept by their `album_id` (hex).
#[derive(Default)]
pub(crate) struct Touched {
    albums: BTreeSet<String>,
    /// (album directory, album title) pairs whose untagged tracks may now disagree on their artist.
    groups: BTreeSet<(String, String)>,
}

impl Touched {
    /// A track as it is stored now, before it changes (a new track has none).
    pub(crate) fn stored_track(
        &mut self,
        tx: &Transaction<'_>,
        track_id: i64,
    ) -> rusqlite::Result<()> {
        let stored: Option<(String, String, String)> = tx
            .query_row(
                "SELECT album_id, album_directory, album FROM track_source_metadata
                 WHERE track_id = ?1",
                params![track_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        if let Some((album_id, directory, title)) = stored {
            self.album(album_id, &directory, &title);
        }
        Ok(())
    }

    /// An album a track is on, now or before it changed.
    pub(crate) fn album(&mut self, album_id: String, directory: &str, title: &str) {
        if !title.is_empty() {
            self.groups.insert((directory.to_owned(), title.to_owned()));
        }
        self.albums.insert(album_id);
    }
}

/// Makes the summaries and the compilations right for everything `touched`.
pub(crate) fn settle(tx: &Transaction<'_>, mut touched: Touched) -> rusqlite::Result<()> {
    for (directory, title) in std::mem::take(&mut touched.groups) {
        settle_compilation(tx, &directory, &title, &mut touched.albums)?;
    }
    let albums: Vec<String> = touched.albums.into_iter().collect();
    refresh(tx, &albums)
}

/// Rebuilds every summary from the tracks: after a change too big to follow row by row (a directory
/// removed, Missing tracks deleted, a migration).
pub(crate) fn rebuild(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    let groups: Vec<(String, String)> = tx
        .prepare(
            "SELECT DISTINCT album_directory, album FROM track_source_metadata
             WHERE album <> '' AND trim(COALESCE(tag_album_artist, '')) = ''",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut ignored = BTreeSet::new();
    for (directory, title) in groups {
        settle_compilation(tx, &directory, &title, &mut ignored)?;
    }
    tx.execute("DELETE FROM albums", [])?;
    tx.execute("DELETE FROM artists", [])?;
    tx.execute(&format!("{ALBUM_ROWS} GROUP BY m.album_id"), [])?;
    tx.execute(&format!("{ARTIST_ROWS} GROUP BY a.artist_id"), [])?;
    Ok(())
}

/// Files the untagged tracks of one album directory: under Various Artists when they have several
/// artists, else each under its own. Albums that lose or gain tracks by it are added to `moved`.
fn settle_compilation(
    tx: &Transaction<'_>,
    directory: &str,
    title: &str,
    moved: &mut BTreeSet<String>,
) -> rusqlite::Result<()> {
    struct Row {
        track_id: i64,
        album_id: String,
        track_title: String,
        artist: String,
        artist_sort: String,
        filed_under: String,
        root_path: String,
    }
    let rows: Vec<Row> = tx
        .prepare_cached(
            "SELECT m.track_id, m.album_id, m.title, m.artist, m.artist_sort, m.album_artist, r.path
             FROM track_source_metadata m
             JOIN tracks t ON t.id = m.track_id
             JOIN library_files f ON f.id = t.file_id
             JOIN library_roots r ON r.id = f.root_id
             WHERE m.album_directory = ?1 AND m.album = ?2
               AND trim(COALESCE(m.tag_album_artist, '')) = ''",
        )?
        .query_map(params![directory, title], |row| {
            Ok(Row {
                track_id: row.get(0)?,
                album_id: row.get(1)?,
                track_title: row.get(2)?,
                artist: row.get(3)?,
                artist_sort: row.get(4)?,
                filed_under: row.get(5)?,
                root_path: row.get(6)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let artists: BTreeSet<&str> = rows
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
        let directory = keys::absolute_directory(&row.root_path, directory);
        let album_id = AlbumId::of(under, title, OsStr::new(&directory)).to_hex();
        moved.insert(row.album_id.clone());
        moved.insert(album_id.clone());
        tx.prepare_cached(
            "UPDATE track_source_metadata
             SET album_artist = ?2, album_artist_sort = ?3, search_text = ?4, album_id = ?5
             WHERE track_id = ?1",
        )?
        .execute(params![
            row.track_id,
            under,
            sort,
            keys::track_search_key(&row.track_title, &row.artist, title, under),
            album_id,
        ])?;
    }
    Ok(())
}

/// Rewrites the rows of the given albums and of their Album Artists. The artists are read before
/// the album rows are replaced (an album that moved leaves its old artist) and after (the tracks
/// say where the albums are now); both sets are refreshed.
fn refresh(tx: &Transaction<'_>, albums: &[String]) -> rusqlite::Result<()> {
    let mut artists = BTreeSet::new();
    for chunk in albums.chunks(CHUNK) {
        artists.extend(ids_of(
            tx,
            "SELECT DISTINCT artist_id FROM albums WHERE id IN",
            chunk,
        )?);
        artists.extend(ids_of(
            tx,
            "SELECT DISTINCT artist_id(album_artist) FROM track_source_metadata
             WHERE album_id IN",
            chunk,
        )?);
    }
    let artists: Vec<String> = artists.into_iter().collect();
    for chunk in albums.chunks(CHUNK) {
        delete_rows(tx, "albums", chunk)?;
        insert_rows(
            tx,
            ALBUM_ROWS,
            "WHERE m.album_id IN",
            "GROUP BY m.album_id",
            chunk,
        )?;
    }
    for chunk in artists.chunks(CHUNK) {
        delete_rows(tx, "artists", chunk)?;
        insert_rows(
            tx,
            ARTIST_ROWS,
            "WHERE a.artist_id IN",
            "GROUP BY a.artist_id",
            chunk,
        )?;
    }
    Ok(())
}

/// `IN (?1, …)` for `count` parameters.
fn placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// The first column of `prefix (ids…)` as text.
fn ids_of(tx: &Transaction<'_>, prefix: &str, ids: &[String]) -> rusqlite::Result<Vec<String>> {
    let sql = format!("{prefix} ({})", placeholders(ids.len()));
    tx.prepare_cached(&sql)?
        .query_map(params_from_iter(ids), |row| row.get(0))?
        .collect()
}

/// Removes the rows of `table` (`albums` or `artists`) with these IDs.
fn delete_rows(tx: &Transaction<'_>, table: &str, ids: &[String]) -> rusqlite::Result<()> {
    tx.prepare_cached(&format!(
        "DELETE FROM {table} WHERE id IN ({})",
        placeholders(ids.len())
    ))?
    .execute(params_from_iter(ids))
    .map(drop)
}

/// Inserts the rows of `select` (`ALBUM_ROWS` or `ARTIST_ROWS`) that the `filter` column holds in
/// `ids`, grouped as `group` says.
fn insert_rows(
    tx: &Transaction<'_>,
    select: &str,
    filter: &str,
    group: &str,
    ids: &[String],
) -> rusqlite::Result<()> {
    tx.prepare_cached(&format!(
        "{select} {filter} ({}) {group}",
        placeholders(ids.len())
    ))?
    .execute(params_from_iter(ids))
    .map(drop)
}
