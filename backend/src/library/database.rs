use super::migrations::{self, MigrationError};
use rusqlite::{Connection, OpenFlags};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

/// Read connections kept open for reuse. Opening one means a file open, pragmas, and a WAL
/// check, which would otherwise happen for every catalog page and every lookup.
const MAX_IDLE_READERS: usize = 4;

type ReaderPool = Arc<Mutex<Vec<Connection>>>;
#[derive(Debug)]
pub enum DatabaseError {
    Open,
    Migration(MigrationError),
    Corrupt,
}
#[derive(Clone)]
pub struct Database {
    path: PathBuf,
    readers: ReaderPool,
}

/// A read-only connection on loan from the pool; it goes back when dropped.
pub struct ReadConnection {
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

impl Drop for ReadConnection {
    fn drop(&mut self) {
        if let Some(connection) = self.connection.take() {
            let mut pool = self.pool.lock().unwrap_or_else(PoisonError::into_inner);
            if pool.len() < MAX_IDLE_READERS {
                pool.push(connection);
            }
        }
    }
}
impl Database {
    pub fn data_dir(&self) -> &Path {
        self.path.parent().unwrap_or_else(|| Path::new("."))
    }
}
impl Database {
    pub fn initialize(directory: &Path) -> Result<Self, DatabaseError> {
        std::fs::create_dir_all(directory).map_err(|_| DatabaseError::Open)?;
        let path = directory.join("library.sqlite3");
        let mut connection = Connection::open(&path).map_err(map_error)?;
        configure_common(&connection).map_err(map_error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(map_error)?;
        verify_wal(&connection).map_err(map_error)?;
        migrations::apply(&mut connection).map_err(DatabaseError::Migration)?;
        Ok(Self {
            path,
            readers: ReaderPool::default(),
        })
    }
    pub fn read(&self) -> Result<ReadConnection, DatabaseError> {
        let idle = self
            .readers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .pop();
        let connection = match idle {
            Some(connection) => connection,
            None => self.open(OpenFlags::SQLITE_OPEN_READ_ONLY)?,
        };
        Ok(ReadConnection {
            connection: Some(connection),
            pool: Arc::clone(&self.readers),
        })
    }
    pub fn write(&self) -> Result<Connection, DatabaseError> {
        self.open(OpenFlags::SQLITE_OPEN_READ_WRITE)
    }
    fn open(&self, flags: OpenFlags) -> Result<Connection, DatabaseError> {
        let c = Connection::open_with_flags(&self.path, flags).map_err(map_error)?;
        configure_common(&c).map_err(map_error)?;
        verify_wal(&c).map_err(map_error)?;
        Ok(c)
    }
}
fn configure_common(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    Ok(())
}
fn verify_wal(connection: &Connection) -> rusqlite::Result<()> {
    let mode: String = connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(rusqlite::Error::InvalidQuery);
    }
    Ok(())
}
fn map_error(error: rusqlite::Error) -> DatabaseError {
    match error {
        rusqlite::Error::SqliteFailure(ref failure, _)
            if failure.code == rusqlite::ErrorCode::NotADatabase =>
        {
            DatabaseError::Corrupt
        }
        _ => DatabaseError::Open,
    }
}
