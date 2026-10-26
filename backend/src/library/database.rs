//! The Library's database file. A database of the current schema is opened as it is; an empty file
//! is given the schema; anything else is replaced by an empty database. Every connection goes
//! through `configure_common`, so the SQL functions are registered on each.

use crate::Result;
use crate::ids::register_sql_functions;
use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// The schema this build reads and writes (`schema.sql`).
const SCHEMA_VERSION: i32 = 2;
const SCHEMA: &str = include_str!("schema.sql");
/// The tables a database of the current schema holds.
const TABLES: [&str; 7] = [
    "directories",
    "library_files",
    "tracks",
    "track_source_metadata",
    "artwork",
    "albums",
    "artists",
];
/// The database file's name; its WAL files sit beside it.
const DATABASE_FILE: &str = "library.sqlite3";
/// The artwork store in the data directory. A reset deletes it with the database.
const ARTWORK_DIRECTORY: &str = "artwork";
/// Read connections kept open for reuse. Opening one means a file open and pragmas, which would
/// otherwise happen for every catalog page and every lookup.
const MAX_IDLE_READERS: usize = 4;

type ReaderPool = Arc<Mutex<Vec<Connection>>>;

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
    /// Opens the database in `directory`, giving it the schema or replacing it as its contents
    /// call for (see the module docs).
    pub(crate) fn initialize(directory: &Path) -> Result<Self> {
        std::fs::create_dir_all(directory)?;
        let path = directory.join(DATABASE_FILE);
        // A file that cannot be read at all is replaced, as a file of another version is; the cause
        // is logged here, because the replacement deletes whatever the file was.
        let inspection = inspect(&path).unwrap_or_else(|cause| {
            log::warn!("library.database.inspect_failed cause={cause}");
            Inspection::Other
        });
        match inspection {
            Inspection::Current => {}
            Inspection::Empty => create(&path)?,
            Inspection::Other => reset(directory)?,
        }
        Ok(Self {
            path,
            readers: ReaderPool::default(),
        })
    }

    pub(crate) fn data_dir(&self) -> &Path {
        self.path.parent().unwrap_or_else(|| Path::new("."))
    }

    pub(crate) fn read(&self) -> Result<ReadConnection> {
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

    pub(crate) fn write(&self) -> Result<Connection> {
        self.open(OpenFlags::SQLITE_OPEN_READ_WRITE)
    }

    /// Drops the idle read connections, so the file can be deleted.
    pub(crate) fn close(&self) {
        self.readers.lock().clear();
    }

    fn open(&self, flags: OpenFlags) -> Result<Connection> {
        let connection = Connection::open_with_flags(&self.path, flags)?;
        configure_common(&connection)?;
        Ok(connection)
    }
}

/// What the file at the database's path holds, as far as opening it goes.
#[derive(Debug, PartialEq, Eq)]
enum Inspection {
    /// The current schema, with every table it has.
    Current,
    /// No file, or an empty one: there is nothing to keep.
    Empty,
    /// Anything else: another schema version, a missing table, or a file that is not a database.
    Other,
}

/// Fails when the file cannot be read as a database at all, which is for the caller to decide.
fn inspect(path: &Path) -> rusqlite::Result<Inspection> {
    if !path.exists() {
        return Ok(Inspection::Empty);
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let version =
        connection.pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))?;
    let tables = table_names(&connection)?;
    Ok(match version {
        0 if tables.is_empty() => Inspection::Empty,
        SCHEMA_VERSION
            if TABLES
                .iter()
                .all(|table| tables.iter().any(|name| name == table)) =>
        {
            Inspection::Current
        }
        _ => Inspection::Other,
    })
}

fn table_names(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement =
        connection.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")?;
    statement.query_map([], |row| row.get(0))?.collect()
}

/// Creates an empty database at `path` with the schema. WAL is set here, once: the file keeps it.
fn create(path: &Path) -> Result<()> {
    let mut connection = Connection::open(path)?;
    configure_common(&connection)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(SCHEMA)?;
    transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    transaction.commit()?;
    Ok(())
}

/// Deletes the database with its WAL files, and the artwork store, then creates an empty database.
/// The caller holds no connection to the database. Used at open and by a reset.
pub(crate) fn reset(directory: &Path) -> Result<()> {
    std::fs::create_dir_all(directory)?;
    for suffix in ["", "-wal", "-shm"] {
        remove_if_present(
            &directory.join(format!("{DATABASE_FILE}{suffix}")),
            |path| std::fs::remove_file(path),
        )?;
    }
    remove_if_present(&directory.join(ARTWORK_DIRECTORY), |path| {
        std::fs::remove_dir_all(path)
    })?;
    create(&directory.join(DATABASE_FILE))
}

/// Removes `path` with `remove`. A file that is already gone is not an error.
fn remove_if_present(path: &Path, remove: fn(&Path) -> std::io::Result<()>) -> Result<()> {
    match remove(path) {
        Err(cause) if cause.kind() != std::io::ErrorKind::NotFound => Err(cause.into()),
        _ => Ok(()),
    }
}

/// Every connection goes through here, and the SQL functions are registered on each.
fn configure_common(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    register_sql_functions(connection)
}
