//! The Album and Album Artist rows the catalog lists, rebuilt from the tracks. A page of either is a
//! plain index range over these tables, instead of an aggregate over every track.
//!
//! The rebuild also settles **Compilations**: tracks that share a directory and an album title but
//! not an artist, and carry no Album Artist tag, are one album filed under Various Artists.
//!
//! The rows are computed by SQL from the tracks (`artist_id()` and `search_key()` are registered in
//! `ids.rs`). Every rebuild replaces all of them, so a rebuild after a batch of changes and a rebuild
//! of the whole Library give the same rows.

use crate::ids::AlbumId;
use crate::library::storage::keys;
use crate::library::sync::scan::absolute_directory;
use rusqlite::{Transaction, params};
use std::ffi::OsStr;

/// The Album Artist compilations are filed under.
pub(crate) const VARIOUS_ARTISTS: &str = "Various Artists";

/// The albums of the tracks, one row per `album_id`.
const ALBUM_ROWS: &str = "INSERT INTO albums(id, artist_id, title, album_artist, directory_id,
                                  relative_dir, title_sort, album_artist_sort, search_text, year,
                                  track_count, cover_artwork_hash)
     SELECT source_metadata.album_id, artist_id(source_metadata.album_artist),
            source_metadata.album, source_metadata.album_artist,
            MIN(source_metadata.album_directory_id), MIN(source_metadata.album_relative_dir),
            MIN(source_metadata.album_sort), MIN(source_metadata.album_artist_sort),
            search_key(source_metadata.album, source_metadata.album_artist),
            MIN(source_metadata.year), COUNT(*),
            (SELECT candidate.artwork_hash FROM track_source_metadata candidate
             WHERE candidate.album_id = source_metadata.album_id
               AND candidate.artwork_hash IS NOT NULL
             ORDER BY COALESCE(candidate.disc_number, 2147483647),
                      COALESCE(candidate.track_number, 2147483647),
                      candidate.track_id
             LIMIT 1)
     FROM track_source_metadata source_metadata
     GROUP BY source_metadata.album_id";

/// The Album Artists of the albums, one row per `artist_id`.
const ARTIST_ROWS: &str = "INSERT INTO artists(id, name, name_sort, search_text, album_count,
                                    track_count, cover_artwork_hash)
     SELECT album.artist_id, album.album_artist, MIN(album.album_artist_sort),
            search_key(album.album_artist),
            COUNT(*), SUM(album.track_count),
            (SELECT same_artist_album.cover_artwork_hash FROM albums same_artist_album
             WHERE same_artist_album.artist_id = album.artist_id
             ORDER BY same_artist_album.title = '', same_artist_album.title_sort,
                      same_artist_album.title, same_artist_album.id
             LIMIT 1)
     FROM albums album
     GROUP BY album.artist_id";

/// Replaces the Album and Album Artist rows with ones computed from the tracks, settling the
/// compilations first. The caller bumps the Library version after it commits the transaction.
pub(crate) fn rebuild_albums_and_artists(transaction: &Transaction<'_>) -> rusqlite::Result<()> {
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
            "SELECT source_metadata.track_id, source_metadata.title, source_metadata.artist,
                    source_metadata.artist_sort, directory.path
             FROM track_source_metadata source_metadata
             JOIN directories directory ON directory.id = source_metadata.album_directory_id
             WHERE source_metadata.album_directory_id = ?1
               AND source_metadata.album_relative_dir = ?2
               AND source_metadata.album = ?3
               AND trim(COALESCE(source_metadata.tag_album_artist, '')) = ''",
        )?
        .query_map(params![directory_id, relative_dir, title], |row| {
            Ok(Row {
                track_id: row.get("track_id")?,
                track_title: row.get("title")?,
                artist: row.get("artist")?,
                artist_sort: row.get("artist_sort")?,
                directory_path: row.get("path")?,
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
            (VARIOUS_ARTISTS, keys::sort_key(VARIOUS_ARTISTS, None))
        } else {
            (row.artist.as_str(), row.artist_sort.clone())
        };
        let directory = absolute_directory(&row.directory_path, relative_dir);
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
                keys::track_search_key(&row.track_title, &row.artist, title, under),
                album_id,
            ])?;
    }
    Ok(())
}
