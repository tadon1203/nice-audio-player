use super::keys::{album_edition_of, SortTags, TrackKeys};
use super::summary;
use rusqlite::{params, Connection, Transaction};

pub const CURRENT_SCHEMA_VERSION: i32 = 4;

/// One step of a migration: a script, or Rust code for what SQL cannot compute.
enum Step {
    Sql(&'static str),
    Rust(fn(&Transaction) -> rusqlite::Result<()>),
}

const MIGRATIONS: [&[Step]; CURRENT_SCHEMA_VERSION as usize] = [
    &[Step::Sql(include_str!("migrations/0001_library.sql"))],
    &[
        Step::Sql(include_str!("migrations/0002_catalog_keys.sql")),
        Step::Rust(backfill_track_keys),
        // After the backfill, so the indexes are built once instead of kept up to date per row.
        Step::Sql(include_str!("migrations/0002_catalog_indexes.sql")),
    ],
    &[Step::Sql(include_str!("migrations/0003_file_identity.sql"))],
    &[
        Step::Sql(include_str!("migrations/0004_catalog_summaries.sql")),
        Step::Rust(backfill_catalog_keys),
        // After the backfill, so the indexes are built once instead of kept up to date per row.
        Step::Sql(include_str!("migrations/0004_catalog_indexes.sql")),
    ],
];

#[derive(Debug)]
pub enum MigrationError {
    SchemaTooNew,
    Sql,
}
impl From<rusqlite::Error> for MigrationError {
    fn from(error: rusqlite::Error) -> Self {
        log::error!("library.migration.failed cause={error}");
        Self::Sql
    }
}
pub fn apply(connection: &mut Connection) -> Result<(), MigrationError> {
    let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(MigrationError::SchemaTooNew);
    };
    if version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    };
    let transaction = connection.transaction()?;
    for step in MIGRATIONS
        .iter()
        .skip(version as usize)
        .flat_map(|steps| steps.iter())
    {
        match step {
            Step::Sql(sql) => transaction.execute_batch(sql)?,
            Step::Rust(run) => run(&transaction)?,
        }
    }
    transaction.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}

/// Gives every existing track the keys the scanner now writes, from the tags it already has.
fn backfill_track_keys(transaction: &Transaction) -> rusqlite::Result<()> {
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

/// Gives every existing track the sort, search and album_edition keys from the tags it already has
/// (SortOrder tags arrive with the rescan this migration asks for), settles compilations and
/// fills the album and Album Artist summaries.
fn backfill_catalog_keys(transaction: &Transaction) -> rusqlite::Result<()> {
    type Row = (i64, [Option<String>; 5], String, i64, String);
    let rows: Vec<Row> = transaction
        .prepare(
            "SELECT m.track_id, m.title, m.artist, m.album, m.album_artist, m.date, f.file_name,
                    f.root_id, f.relative_path
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
                row.get(7)?,
                row.get(8)?,
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
    for (track_id, [title, artist, album, album_artist, date], file_name, root_id, relative) in rows
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
            &album_edition_of(root_id, &relative),
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
            keys.album_dir,
        ])?;
    }
    summary::rebuild(transaction)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A database as the first release left it, holding one track.
    fn first_release() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("migrations/0001_library.sql"))
            .unwrap();
        connection
            .execute_batch(
                "INSERT INTO library_roots(id,path,enabled,scan_generation,created_at_ms,updated_at_ms) VALUES(1,'C:/Music',1,1,0,0);
                 INSERT INTO library_files(id,root_id,relative_path,file_name,extension,byte_length,modification_key,source_revision,seen_generation,availability,inspection_status,updated_at_ms) VALUES(1,1,'a.flac','a.flac','flac',1,'1',1,1,'available','indexed',0);
                 INSERT INTO tracks(id,file_id,created_at_ms) VALUES(1,1,0);
                 INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,date,tag_status,artwork_status,updated_at_ms) VALUES(1,1,' ','Singer',' Record ',NULL,'0000-01-01','loaded','notPresent',0);
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        connection
    }

    #[test]
    fn existing_tracks_get_their_keys_without_a_rescan() {
        let mut connection = first_release();

        apply(&mut connection).unwrap();

        let keys: (String, String, String, String, Option<i32>) = connection
            .query_row(
                "SELECT title_key, artist_key, album_key, album_artist_key, year FROM track_source_metadata",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(
            keys,
            (
                "a".into(),
                "Singer".into(),
                "Record".into(),
                "Singer".into(),
                None
            )
        );
        let version: i32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn files_get_identity_columns_and_are_read_once_more_to_fill_them() {
        let mut connection = first_release();

        apply(&mut connection).unwrap();

        let file: (i64, Option<String>, i64, String) = connection
            .query_row(
                "SELECT byte_length, content_hash, relink_pending, modification_key FROM library_files",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(file, (0, None, 0, "rescan".into()));
    }

    #[test]
    fn existing_tracks_get_sort_and_search_keys_and_summaries_without_waiting_for_a_rescan() {
        let mut connection = first_release();

        apply(&mut connection).unwrap();

        let keys: (String, String, String, String) = connection
            .query_row(
                "SELECT title_sort, artist_sort, search_key, album_dir FROM track_source_metadata",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            keys,
            (
                "a".into(),
                "singer".into(),
                "a\u{1f}singer\u{1f}record\u{1f}singer".into(),
                "1/".into()
            )
        );
        let album: (String, String, String, i64, Option<i64>) = connection
            .query_row(
                "SELECT album_artist_key, album_key, album_sort, track_count, year FROM albums",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            album,
            ("Singer".into(), "Record".into(), "record".into(), 1, None)
        );
        let artist: (String, i64, i64) = connection
            .query_row(
                "SELECT name, album_count, track_count FROM album_artists",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(artist, ("Singer".into(), 1, 1));
    }

    #[test]
    fn a_database_from_a_newer_release_is_refused() {
        let mut connection = first_release();
        connection
            .pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION + 1)
            .unwrap();

        assert!(matches!(
            apply(&mut connection),
            Err(MigrationError::SchemaTooNew)
        ));
    }
}
