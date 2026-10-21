mod legacy;

use super::summary;
use rusqlite::{Connection, Transaction};

pub(crate) const CURRENT_SCHEMA_VERSION: i32 = 5;

/// One step of a migration: a script, or Rust code for what SQL cannot compute.
enum Step {
    Sql(&'static str),
    Rust(fn(&Transaction<'_>) -> rusqlite::Result<()>),
}

/// One schema version: its steps run in one transaction, which also sets `user_version`.
struct Migration {
    /// Turns foreign keys off before the transaction and on after it, and runs
    /// `PRAGMA foreign_key_check` before the commit (SQLite's table rebuild procedure).
    foreign_keys_off: bool,
    steps: &'static [Step],
}

/// Version N is `MIGRATIONS[N - 1]`. The scripts of a version are in `migrations/<version>/`,
/// and their names give the order they run in.
const MIGRATIONS: [Migration; CURRENT_SCHEMA_VERSION as usize] = [
    Migration {
        foreign_keys_off: false,
        steps: &[Step::Sql(include_str!("migrations/0001/01_library.sql"))],
    },
    Migration {
        foreign_keys_off: false,
        steps: &[
            Step::Sql(include_str!("migrations/0002/01_catalog_keys.sql")),
            Step::Rust(legacy::backfill_track_keys),
            // After the backfill, so the indexes are built once instead of kept up to date per row.
            Step::Sql(include_str!("migrations/0002/02_catalog_indexes.sql")),
        ],
    },
    Migration {
        foreign_keys_off: false,
        steps: &[Step::Sql(include_str!(
            "migrations/0003/01_file_identity.sql"
        ))],
    },
    Migration {
        foreign_keys_off: false,
        steps: &[
            Step::Sql(include_str!("migrations/0004/01_catalog_summaries.sql")),
            Step::Rust(legacy::backfill_catalog_keys),
            // After the backfill, so the indexes are built once instead of kept up to date per row.
            Step::Sql(include_str!("migrations/0004/02_catalog_indexes.sql")),
        ],
    },
    Migration {
        foreign_keys_off: true,
        steps: &[
            Step::Sql(include_str!("migrations/0005/01_tracks_autoincrement.sql")),
            Step::Sql(include_str!("migrations/0005/02_catalog_ids.sql")),
            // The same rebuild a rescan uses, so the migrated summaries are the ones it would make.
            Step::Rust(summary::rebuild),
            // After the rebuild, so the indexes are built once instead of kept up to date per row.
            Step::Sql(include_str!("migrations/0005/03_catalog_indexes.sql")),
        ],
    },
];

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("the database is from a newer version of the app")]
    SchemaTooNew,
    #[error("a migration statement failed")]
    Sql,
    /// A migration that rebuilt tables left a row pointing at nothing.
    #[error("a migration left a row pointing at nothing")]
    ForeignKeys,
}
impl From<rusqlite::Error> for MigrationError {
    fn from(error: rusqlite::Error) -> Self {
        log::error!("library.migration.failed cause={error}");
        Self::Sql
    }
}
pub(crate) fn apply(connection: &mut Connection) -> Result<(), MigrationError> {
    let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version > CURRENT_SCHEMA_VERSION {
        return Err(MigrationError::SchemaTooNew);
    }
    for (index, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        migrate(connection, migration, index as i32 + 1)?;
    }
    Ok(())
}

/// Runs one version. Foreign keys are switched off outside the transaction (SQLite ignores the
/// switch inside one) and back on after it, even when it failed.
fn migrate(
    connection: &mut Connection,
    migration: &Migration,
    version: i32,
) -> Result<(), MigrationError> {
    if migration.foreign_keys_off {
        connection.pragma_update(None, "foreign_keys", false)?;
    }
    let result = run_in_transaction(connection, migration, version);
    if migration.foreign_keys_off {
        connection.pragma_update(None, "foreign_keys", true)?;
    }
    result
}

fn run_in_transaction(
    connection: &mut Connection,
    migration: &Migration,
    version: i32,
) -> Result<(), MigrationError> {
    let transaction = connection.transaction()?;
    for step in migration.steps {
        match step {
            Step::Sql(sql) => transaction.execute_batch(sql)?,
            Step::Rust(run) => run(&transaction)?,
        }
    }
    if migration.foreign_keys_off {
        let mut check = transaction.prepare("PRAGMA foreign_key_check")?;
        if check.exists([])? {
            log::error!("library.migration.foreign_key_check version={version}");
            return Err(MigrationError::ForeignKeys);
        }
    }
    transaction.pragma_update(None, "user_version", version)?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{AlbumId, register_sql_functions};
    use std::ffi::OsStr;

    /// A database as the first release left it, holding one track.
    fn first_release() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        register_sql_functions(&connection).unwrap();
        connection
            .execute_batch(include_str!("migrations/0001/01_library.sql"))
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
                "SELECT title, artist, album, album_artist, year FROM track_source_metadata",
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
                "SELECT title_sort, artist_sort, search_text, album_directory FROM track_source_metadata",
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
        let album: (String, String, String, i64, Option<i64>, String) = connection
            .query_row(
                "SELECT album_artist, title, title_sort, track_count, year, id FROM albums",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            album,
            (
                "Singer".into(),
                "Record".into(),
                "record".into(),
                1,
                None,
                AlbumId::of("Singer", "Record", OsStr::new("C:/Music/")).to_hex(),
            )
        );
        let artist: (String, i64, i64) = connection
            .query_row(
                "SELECT name, album_count, track_count FROM artists",
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
