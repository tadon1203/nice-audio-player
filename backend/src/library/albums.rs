//! The Album and Album Artist rows the catalog lists, rebuilt from the tracks. A page of either is a
//! plain index range over these tables, instead of an aggregate over every track.
//!
//! The rebuild also settles **Compilations**: tracks that share a directory and an album title but
//! not an artist, and carry no Album Artist tag, are one album filed under Various Artists.
//!
//! The rows are computed by SQL from the tracks (`artist_id()` and `search_key()` are registered in
//! `ids.rs`). Every rebuild replaces all of them, so a rebuild after a batch of changes and a rebuild
//! of the whole Library give the same rows.

use super::text;
use crate::ids::AlbumId;
use rusqlite::{Transaction, params};
use std::ffi::OsStr;

/// The Album Artist compilations are filed under.
pub(crate) const VARIOUS_ARTISTS: &str = "Various Artists";

/// The albums of the tracks, one row per `album_id`.
const ALBUM_ROWS: &str = "INSERT INTO albums(id, artist_id, title, album_artist, directory_id,
                                  relative_dir, title_sort, album_artist_sort, search_text, year,
                                  track_count, cover_artwork_hash)
     SELECT m.album_id, artist_id(m.album_artist), m.album, m.album_artist,
            MIN(m.album_directory_id), MIN(m.album_relative_dir), MIN(m.album_sort),
            MIN(m.album_artist_sort), search_key(m.album, m.album_artist), MIN(m.year), COUNT(*),
            (SELECT c.artwork_hash FROM track_source_metadata c
             WHERE c.album_id = m.album_id AND c.artwork_hash IS NOT NULL
             ORDER BY COALESCE(c.disc_number, 2147483647), COALESCE(c.track_number, 2147483647),
                      c.track_id
             LIMIT 1)
     FROM track_source_metadata m
     GROUP BY m.album_id";

/// The Album Artists of the albums, one row per `artist_id`.
const ARTIST_ROWS: &str = "INSERT INTO artists(id, name, name_sort, search_text, album_count,
                                    track_count, cover_artwork_hash)
     SELECT a.artist_id, a.album_artist, MIN(a.album_artist_sort), search_key(a.album_artist),
            COUNT(*), SUM(a.track_count),
            (SELECT b.cover_artwork_hash FROM albums b WHERE b.artist_id = a.artist_id
             ORDER BY b.title = '', b.title_sort, b.title, b.id
             LIMIT 1)
     FROM albums a
     GROUP BY a.artist_id";

/// Replaces the Album and Album Artist rows with ones computed from the tracks, settling the
/// compilations first. The caller bumps the Library version after it commits the transaction.
pub(crate) fn rebuild(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
    let groups: Vec<(i64, String, String)> = transaction
        .prepare(
            "SELECT DISTINCT album_directory_id, album_relative_dir, album
             FROM track_source_metadata
             WHERE album <> '' AND trim(COALESCE(tag_album_artist, '')) = ''",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (directory_id, relative_dir, title) in groups {
        settle_compilation(transaction, directory_id, &relative_dir, &title)?;
    }
    transaction.execute("DELETE FROM albums", [])?;
    transaction.execute("DELETE FROM artists", [])?;
    transaction.execute(ALBUM_ROWS, [])?;
    transaction.execute(ARTIST_ROWS, [])?;
    Ok(())
}

/// Files the untagged tracks of one album edition: under Various Artists when they have several
/// artists, else each under its own artist.
fn settle_compilation(
    transaction: &Transaction<'_>,
    directory_id: i64,
    relative_dir: &str,
    title: &str,
) -> rusqlite::Result<()> {
    struct Row {
        track_id: i64,
        track_title: String,
        artist: String,
        artist_sort: String,
        directory_path: String,
    }
    let rows: Vec<Row> = transaction
        .prepare_cached(
            "SELECT m.track_id, m.title, m.artist, m.artist_sort, d.path
             FROM track_source_metadata m
             JOIN directories d ON d.id = m.album_directory_id
             WHERE m.album_directory_id = ?1 AND m.album_relative_dir = ?2 AND m.album = ?3
               AND trim(COALESCE(m.tag_album_artist, '')) = ''",
        )?
        .query_map(params![directory_id, relative_dir, title], |row| {
            Ok(Row {
                track_id: row.get(0)?,
                track_title: row.get(1)?,
                artist: row.get(2)?,
                artist_sort: row.get(3)?,
                directory_path: row.get(4)?,
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
        let directory = text::absolute_directory(&row.directory_path, relative_dir);
        let album_id = AlbumId::of(under, title, OsStr::new(&directory)).to_hex();
        transaction
            .prepare_cached(
                "UPDATE track_source_metadata
             SET album_artist = ?2, album_artist_sort = ?3, search_text = ?4, album_id = ?5
             WHERE track_id = ?1",
            )?
            .execute(params![
                row.track_id,
                under,
                sort,
                text::track_search_key(&row.track_title, &row.artist, title, under),
                album_id,
            ])?;
    }
    Ok(())
}
