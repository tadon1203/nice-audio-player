//! What the catalog lists albums and Album Artists from: one row each in `albums` and
//! `album_artists`, kept in step with the tracks inside the transaction that changes them, so a
//! page of either is a plain index range instead of an aggregate over every track.
//!
//! It also settles **Compilations**: tracks that share a directory and an album title but not an
//! artist, and carry no Album Artist tag, are one album filed under Various Artists.

use super::text;
use rusqlite::{params, OptionalExtension, Transaction};
use std::collections::BTreeSet;

/// The Album Artist compilations are filed under.
pub(crate) const VARIOUS_ARTISTS: &str = "Various Artists";

/// An album: (Album Artist, album title, directory).
pub(crate) type AlbumId = (String, String, String);

/// What a write changed: the albums and compilation groups it may have altered, to settle once
/// before the transaction commits.
#[derive(Default)]
pub(crate) struct Touched {
    albums: BTreeSet<AlbumId>,
    /// (directory, album title) pairs whose untagged tracks may now disagree on their artist.
    groups: BTreeSet<(String, String)>,
}

impl Touched {
    /// A track as it is stored now, before it changes (a new track has none).
    pub fn stored_track(&mut self, tx: &Transaction, track_id: i64) -> rusqlite::Result<()> {
        let stored: Option<AlbumId> = tx
            .query_row(
                "SELECT album_artist_key, album_key, album_dir FROM track_source_metadata
                 WHERE track_id = ?1",
                params![track_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        if let Some(id) = stored {
            self.album(id);
        }
        Ok(())
    }

    /// A track as it is stored after it changed.
    pub fn album(&mut self, id: AlbumId) {
        if !id.1.is_empty() {
            self.groups.insert((id.2.clone(), id.1.clone()));
        }
        self.albums.insert(id);
    }
}

/// Makes the summaries and the compilations right for everything `touched`.
pub(crate) fn settle(tx: &Transaction, mut touched: Touched) -> rusqlite::Result<()> {
    for (directory, album) in std::mem::take(&mut touched.groups) {
        settle_compilation(tx, &directory, &album, &mut touched.albums)?;
    }
    let mut artists = BTreeSet::new();
    for (artist, album, directory) in &touched.albums {
        refresh_album(tx, artist, album, directory)?;
        artists.insert(artist.clone());
    }
    for artist in artists {
        refresh_artist(tx, &artist)?;
    }
    Ok(())
}

/// Rebuilds every summary from the tracks: after a change too big to follow row by row (a folder
/// removed, Missing tracks deleted, a migration).
pub(crate) fn rebuild(tx: &Transaction) -> rusqlite::Result<()> {
    let groups: Vec<(String, String)> = tx
        .prepare(
            "SELECT DISTINCT album_dir, album_key FROM track_source_metadata
             WHERE album_key <> '' AND trim(COALESCE(album_artist, '')) = ''",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut ignored = BTreeSet::new();
    for (directory, album) in groups {
        settle_compilation(tx, &directory, &album, &mut ignored)?;
    }
    tx.execute("DELETE FROM albums", [])?;
    tx.execute("DELETE FROM album_artists", [])?;
    let albums: Vec<AlbumId> = tx
        .prepare(
            "SELECT DISTINCT album_artist_key, album_key, album_dir FROM track_source_metadata",
        )?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    let mut artists = BTreeSet::new();
    for (artist, album, directory) in &albums {
        refresh_album(tx, artist, album, directory)?;
        artists.insert(artist.clone());
    }
    for artist in artists {
        refresh_artist(tx, &artist)?;
    }
    Ok(())
}

/// Files the untagged tracks of one album folder: under Various Artists when they have several
/// artists, else each under its own. Albums that lose or gain tracks by it are added to `moved`.
fn settle_compilation(
    tx: &Transaction,
    directory: &str,
    album: &str,
    moved: &mut BTreeSet<AlbumId>,
) -> rusqlite::Result<()> {
    struct Row {
        track_id: i64,
        title: String,
        artist: String,
        artist_sort: String,
        filed_under: String,
    }
    let rows: Vec<Row> = tx
        .prepare_cached(
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
        moved.insert((
            row.filed_under.clone(),
            album.to_owned(),
            directory.to_owned(),
        ));
        moved.insert((under.to_owned(), album.to_owned(), directory.to_owned()));
        tx.prepare_cached(
            "UPDATE track_source_metadata
             SET album_artist_key = ?2, album_artist_sort = ?3, search_key = ?4 WHERE track_id = ?1",
        )?
        .execute(params![
            row.track_id,
            under,
            sort,
            text::search_key(&[&row.title, &row.artist, album, under]),
        ])?;
    }
    Ok(())
}

/// Writes the `albums` row of one album from its tracks, or removes it when it has none.
fn refresh_album(
    tx: &Transaction,
    artist: &str,
    album: &str,
    directory: &str,
) -> rusqlite::Result<()> {
    let (count, year, album_sort, artist_sort): (i64, Option<i64>, Option<String>, Option<String>) =
        tx.prepare_cached(
            "SELECT COUNT(*), MIN(year), MIN(album_sort), MIN(album_artist_sort)
             FROM track_source_metadata
             WHERE album_artist_key = ?1 AND album_key = ?2 AND album_dir = ?3",
        )?
        .query_row(params![artist, album, directory], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
    if count == 0 {
        tx.prepare_cached(
            "DELETE FROM albums WHERE album_artist_key = ?1 AND album_key = ?2 AND album_dir = ?3",
        )?
        .execute(params![artist, album, directory])?;
        return Ok(());
    }
    // The cover is the artwork of the first track that has any, in playing order.
    let cover: Option<i64> = tx
        .prepare_cached(
            "SELECT artwork_id FROM track_source_metadata
             WHERE album_artist_key = ?1 AND album_key = ?2 AND album_dir = ?3
               AND artwork_id IS NOT NULL
             ORDER BY COALESCE(disc_number, 2147483647), COALESCE(track_number, 2147483647), track_id
             LIMIT 1",
        )?
        .query_row(params![artist, album, directory], |row| row.get(0))
        .optional()?;
    tx.prepare_cached(
        "INSERT INTO albums(album_artist_key, album_key, album_dir, album_sort, artist_sort,
                            search_key, year, track_count, cover_artwork_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(album_artist_key, album_key, album_dir) DO UPDATE SET
            album_sort = excluded.album_sort, artist_sort = excluded.artist_sort,
            search_key = excluded.search_key, year = excluded.year,
            track_count = excluded.track_count, cover_artwork_id = excluded.cover_artwork_id",
    )?
    .execute(params![
        artist,
        album,
        directory,
        album_sort.unwrap_or_default(),
        artist_sort.unwrap_or_default(),
        text::search_key(&[album, artist]),
        year,
        count,
        cover,
    ])?;
    Ok(())
}

/// Writes the `album_artists` row of one Album Artist from their albums, or removes it.
fn refresh_artist(tx: &Transaction, name: &str) -> rusqlite::Result<()> {
    let (albums, tracks, sort): (i64, Option<i64>, Option<String>) = tx
        .prepare_cached(
            "SELECT COUNT(*), SUM(track_count), MIN(artist_sort) FROM albums
             WHERE album_artist_key = ?1",
        )?
        .query_row(params![name], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
    if albums == 0 {
        tx.prepare_cached("DELETE FROM album_artists WHERE name = ?1")?
            .execute(params![name])?;
        return Ok(());
    }
    // Their cover is the cover of their first album by title, whether or not another has one.
    let cover: Option<i64> = tx
        .prepare_cached(
            "SELECT cover_artwork_id FROM albums WHERE album_artist_key = ?1
             ORDER BY album_key = '', album_sort, album_key, album_dir LIMIT 1",
        )?
        .query_row(params![name], |row| row.get(0))
        .optional()?
        .flatten();
    tx.prepare_cached(
        "INSERT INTO album_artists(name, sort_key, search_key, album_count, track_count,
                                   cover_artwork_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(name) DO UPDATE SET
            sort_key = excluded.sort_key, search_key = excluded.search_key,
            album_count = excluded.album_count, track_count = excluded.track_count,
            cover_artwork_id = excluded.cover_artwork_id",
    )?
    .execute(params![
        name,
        sort.unwrap_or_default(),
        text::search_key(&[name]),
        albums,
        tracks.unwrap_or_default(),
        cover,
    ])?;
    Ok(())
}
