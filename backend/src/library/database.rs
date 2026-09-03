use super::migrations::{self, MigrationError};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
#[derive(Debug)]
pub enum DatabaseError {
    Open,
    Migration(MigrationError),
    Corrupt,
}
#[derive(Clone)]
pub struct Database {
    path: PathBuf,
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
        Ok(Self { path })
    }
    pub fn read(&self) -> Result<Connection, DatabaseError> {
        self.open(OpenFlags::SQLITE_OPEN_READ_ONLY)
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
