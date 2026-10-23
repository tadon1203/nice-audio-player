use super::migrations::{self, MigrationError};
use crate::ids::register_sql_functions;
use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Read connections kept open for reuse. Opening one means a file open, pragmas, and a WAL
/// check, which would otherwise happen for every catalog page and every lookup.
const MAX_IDLE_READERS: usize = 4;

type ReaderPool = Arc<Mutex<Vec<Connection>>>;
#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("the database could not be opened")]
    Open,
    #[error("the database migration failed: {0}")]
    Migration(MigrationError),
    #[error("the database file is corrupt")]
    Corrupt,
}
#[derive(Clone)]
pub(crate) struct Database {
    path: PathBuf,
    readers: ReaderPool,
}

/// A read-only connection on loan from the pool; it goes back when dropped.
pub(crate) struct ReadConnection {
    connection: Option<Connection>,
    pool: ReaderPool,
}

impl Deref for ReadConnection {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        self.connection
            .as_ref()
            .expect("connection is present until drop")
    }
}

#[cfg(test)]
impl ReadConnection {
    /// For tests that watch which statements a read runs.
    pub(crate) fn connection_mut(&mut self) -> &mut Connection {
        self.connection
            .as_mut()
            .expect("connection is present until drop")
    }
}

impl Drop for ReadConnection {
    fn drop(&mut self) {
        if let Some(connection) = self.connection.take() {
            let mut pool = self.pool.lock();
            if pool.len() < MAX_IDLE_READERS {
                pool.push(connection);
            }
        }
    }
}
impl Database {
    pub(crate) fn data_dir(&self) -> &Path {
        self.path.parent().unwrap_or_else(|| Path::new("."))
    }
}
impl Database {
    pub(crate) fn initialize(directory: &Path) -> Result<Self, DatabaseError> {
        std::fs::create_dir_all(directory)
            .inspect_err(|cause| log::warn!("library.database.directory_failed cause={cause}"))
            .map_err(|_| DatabaseError::Open)?;
        let path = directory.join(DATABASE_FILE);
        let mut connection = Connection::open(&path).map_err(DatabaseError::from)?;
        configure_common(&connection).map_err(DatabaseError::from)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(DatabaseError::from)?;
        verify_wal(&connection).map_err(DatabaseError::from)?;
        back_up_before_migration(&connection, directory)?;
        migrations::apply(&mut connection).map_err(DatabaseError::Migration)?;
        Ok(Self {
            path,
            readers: ReaderPool::default(),
        })
    }
    pub(crate) fn read(&self) -> Result<ReadConnection, DatabaseError> {
        let idle = self.readers.lock().pop();
        let connection = match idle {
            Some(connection) => connection,
            None => self.open(OpenFlags::SQLITE_OPEN_READ_ONLY)?,
        };
        Ok(ReadConnection {
            connection: Some(connection),
            pool: Arc::clone(&self.readers),
        })
    }
    pub(crate) fn write(&self) -> Result<Connection, DatabaseError> {
        self.open(OpenFlags::SQLITE_OPEN_READ_WRITE)
    }
    fn open(&self, flags: OpenFlags) -> Result<Connection, DatabaseError> {
        let c = Connection::open_with_flags(&self.path, flags).map_err(DatabaseError::from)?;
        configure_common(&c).map_err(DatabaseError::from)?;
        verify_wal(&c).map_err(DatabaseError::from)?;
        Ok(c)
    }
}
/// The database file's name; a reset or a migration backup is this plus a suffix.
const DATABASE_FILE: &str = "library.sqlite3";
/// Dropped in the data directory to ask for a reset at the next start (see [`request_reset`]).
const RESET_MARKER: &str = "reset-library";

/// Copies a database that is about to be migrated to `library.sqlite3.v<N>.bak` (N is the schema
/// version it is leaving), so a migration that goes wrong or loses data can be undone by hand.
/// A new database has nothing to save, and a failed copy stops the migration.
fn back_up_before_migration(
    connection: &Connection,
    directory: &Path,
) -> Result<(), DatabaseError> {
    let version: i32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(DatabaseError::from)?;
    if version == 0 || version >= migrations::CURRENT_SCHEMA_VERSION {
        return Ok(());
    }
    let backup = directory.join(format!("{DATABASE_FILE}.v{version}.bak"));
    // `VACUUM INTO` refuses to overwrite; a leftover is from an attempt that did not finish, and
    // this copy is the fresher one.
    if let Err(cause) = std::fs::remove_file(&backup)
        && cause.kind() != std::io::ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
    connection
        .execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
        .map(drop)
        .map_err(|cause| {
            log::error!("library.database.backup_failed cause={cause}");
            DatabaseError::Open
        })
}

/// Asks for the database to be moved aside and recreated at the next start. Done at start-up,
/// before anything has it open, so it works even when the database cannot be opened at all.
pub(crate) fn request_reset(directory: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(directory)?;
    std::fs::write(directory.join(RESET_MARKER), b"")
}

/// Carries out a requested reset: the database (and its WAL files) becomes `library.sqlite3.bak`,
/// replacing an older one, and the next open creates an empty one. Artwork and waveform caches
/// are kept; the rescan finds them again.
pub(crate) fn apply_requested_reset(directory: &Path) {
    let marker = directory.join(RESET_MARKER);
    if !marker.exists() {
        return;
    }
    for suffix in ["", "-wal", "-shm"] {
        let from = directory.join(format!("{DATABASE_FILE}{suffix}"));
        let to = directory.join(format!("{DATABASE_FILE}{suffix}.bak"));
        if from.exists()
            && let Err(cause) = std::fs::rename(&from, &to).or_else(|_| {
                if let Err(cause) = std::fs::remove_file(&to)
                    && cause.kind() != std::io::ErrorKind::NotFound
                {
                    log::debug!("cleanup.remove_file_failed cause={cause}");
                }
                std::fs::rename(&from, &to)
            })
        {
            log::error!("library.database.reset_failed cause={cause}");
            if suffix.is_empty() {
                // Nothing moved; the marker stays and the reset is tried again at next start.
                return;
            }
            // The database is already aside: a stale WAL left here must not meet the new one.
            if let Err(cause) = std::fs::remove_file(&from)
                && cause.kind() != std::io::ErrorKind::NotFound
            {
                log::debug!("cleanup.remove_file_failed cause={cause}");
            }
        }
    }
    if let Err(cause) = std::fs::remove_file(&marker)
        && cause.kind() != std::io::ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
    log::info!("library.database.reset");
}

/// Every connection goes through here, and the SQL functions are registered before any migration
/// runs, because a migration computes IDs with them.
fn configure_common(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    register_sql_functions(connection)
}
fn verify_wal(connection: &Connection) -> rusqlite::Result<()> {
    let mode: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}
impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        match error {
            rusqlite::Error::SqliteFailure(failure, _)
                if failure.code == rusqlite::ErrorCode::NotADatabase =>
            {
                DatabaseError::Corrupt
            }
            _ => DatabaseError::Open,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDirectory;

    fn user_version(path: &Path) -> i32 {
        Connection::open(path)
            .unwrap()
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn a_database_is_backed_up_before_it_is_migrated() {
        let directory = TestDirectory::new();
        let dir = directory.file("");
        let database = Database::initialize(&dir).unwrap();
        drop(database);
        // Pretend the file is one schema version behind.
        let old = migrations::CURRENT_SCHEMA_VERSION - 1;
        Connection::open(dir.join(DATABASE_FILE))
            .unwrap()
            .pragma_update(None, "user_version", old)
            .unwrap();

        // The faked version may not migrate; the backup is taken first, and that is what is checked.
        drop(Database::initialize(&dir));

        let backup = dir.join(format!("{DATABASE_FILE}.v{old}.bak"));
        assert!(backup.exists(), "a backup exists after the migration ran");
        assert_eq!(
            user_version(&backup),
            old,
            "it holds the pre-migration state"
        );
    }

    #[test]
    fn a_new_or_current_database_makes_no_backup() {
        let directory = TestDirectory::new();
        let dir = directory.file("");
        Database::initialize(&dir).unwrap();
        Database::initialize(&dir).unwrap();
        assert!(std::fs::read_dir(&dir).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".bak")
        }));
    }

    #[test]
    fn a_requested_reset_moves_the_database_to_bak_and_starts_empty() {
        let directory = TestDirectory::new();
        let dir = directory.file("");
        {
            let database = Database::initialize(&dir).unwrap();
            database
                .write()
                .unwrap()
                .execute(
                    "INSERT INTO library_roots(path, enabled, scan_generation) VALUES('x', 1, 0)",
                    [],
                )
                .unwrap();
        }
        request_reset(&dir).unwrap();

        apply_requested_reset(&dir);
        let fresh = Database::initialize(&dir).unwrap();

        assert!(dir.join(format!("{DATABASE_FILE}.bak")).exists());
        assert!(!dir.join(RESET_MARKER).exists());
        let directories: i64 = fresh
            .read()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM library_roots", [], |row| row.get(0))
            .unwrap();
        assert_eq!(directories, 0);
    }

    #[test]
    fn a_corrupt_database_can_be_reset() {
        let directory = TestDirectory::new();
        let dir = directory.file("");
        std::fs::write(dir.join(DATABASE_FILE), vec![b'x'; 200]).unwrap();
        assert!(matches!(
            Database::initialize(&dir),
            Err(DatabaseError::Corrupt)
        ));

        request_reset(&dir).unwrap();
        apply_requested_reset(&dir);

        assert!(Database::initialize(&dir).is_ok());
    }
}
