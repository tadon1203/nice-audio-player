//! The Library: the indexed set of tracks from the registered music directories.
//!
//! `Library::open` yields a working Library or the reason it is unavailable, and the app holds
//! that result. A working Library has two sides that meet only in the database: the read side
//! (`store`: catalog, playback selections, track lookups) and the write side (`sync`: directories,
//! watchers, scanner), reached through the methods below.

pub(crate) mod accent;
pub(crate) mod artwork;
pub(crate) mod database;
pub(crate) mod directories;
pub(crate) mod keys;
pub(crate) mod maintenance;
pub(crate) mod models;
pub(crate) mod scanner;
pub(crate) mod store;
#[cfg(test)]
mod store_tests;
pub(crate) mod summary;
pub(crate) mod sync;
#[cfg(test)]
mod tests;
pub(crate) mod text;
pub(crate) mod watcher;

use crate::errors::CommandError;
use crate::ids::{ArtworkHash, DirectoryId};
use crate::state_hub::StateHub;
use database::{Database, DatabaseError};
use log::error;
use models::LibraryDirectory;
use serde::Serialize;
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use store::LibraryStore;
use sync::LibrarySync;

/// Makes an enum a text column: `as_str`, `Display`, `ToSql` and `FromSql` from one table of
/// names.
macro_rules! sql_text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        impl $name {
            pub(crate) fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }
        }
        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
        impl rusqlite::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
                Ok(self.as_str().into())
            }
        }
        impl rusqlite::types::FromSql for $name {
            fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                match value.as_str()? {
                    $($text => Ok(Self::$variant),)+
                    _ => Err(rusqlite::types::FromSqlError::InvalidType),
                }
            }
        }
    };
}
pub(crate) use sql_text_enum;

/// Whether a file is on disk where the library last saw it. Only the library reads it: the track
/// DTOs carry the `TrackState` that it and the inspection status decide together.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Availability {
    Available,
    Missing,
}

sql_text_enum!(Availability {
    Available => "available",
    Missing => "missing",
});

/// Where a file stands once inspected: `Unsupported` when it cannot be decoded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum InspectionStatus {
    Indexed,
    Unsupported,
}

sql_text_enum!(InspectionStatus {
    Indexed => "indexed",
    Unsupported => "unsupported",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TagStatus {
    Loaded,
    Absent,
    Failed,
}

sql_text_enum!(TagStatus {
    Loaded => "loaded",
    Absent => "absent",
    Failed => "failed",
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ArtworkStatus {
    NotPresent,
    Unavailable,
    Invalid,
    Stored,
    StoreFailed,
}

sql_text_enum!(ArtworkStatus {
    NotPresent => "notPresent",
    Unavailable => "unavailable",
    Invalid => "invalid",
    Stored => "stored",
    StoreFailed => "storeFailed",
});

/// Why the Library is unavailable. The only reason left is a database that cannot be opened: any
/// other database is replaced at open.
#[derive(Debug, Clone, Serialize, specta::Type, thiserror::Error)]
#[serde(rename_all = "camelCase")]
pub enum LibraryUnavailableReason {
    #[error("the database could not be opened")]
    DatabaseOpenFailed,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LibraryStatus {
    Ready,
    Unavailable { reason: LibraryUnavailableReason },
}

/// The Library's read-side errors. The store logs a failure once, where it is built; the facade
/// maps it to a code that carries no implementation detail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StoreError {
    InvalidCursor,
    TrackNotFound,
    TrackUnavailable,
    AlbumNotFound,
    AlbumArtistNotFound,
    /// The database failed; the cause was logged where the error was built.
    Persistence,
}

impl From<rusqlite::Error> for StoreError {
    fn from(cause: rusqlite::Error) -> Self {
        error!("library.store.failed cause={cause}");
        Self::Persistence
    }
}

impl From<DatabaseError> for StoreError {
    fn from(cause: DatabaseError) -> Self {
        error!("library.store.unavailable cause={cause}");
        Self::Persistence
    }
}

/// The shared codes a store failure maps to. A failure that no shared code describes is reported as
/// a persistence failure, which is how the lyrics and playback commands have always reported it.
impl From<StoreError> for CommandError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::TrackNotFound => Self::TrackNotFound,
            StoreError::TrackUnavailable => Self::TrackUnavailable,
            StoreError::InvalidCursor
            | StoreError::AlbumNotFound
            | StoreError::AlbumArtistNotFound
            | StoreError::Persistence => Self::PersistenceFailed,
        }
    }
}

/// The errors of the Library commands that are not directory commands. Directory commands return
/// `CommandError` directly.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LibraryCommandError {
    Common { error: CommandError },
    ScanInProgress,
    AlbumNotFound,
    InvalidCursor,
    AlbumArtistNotFound,
    NoEnabledDirectories,
    ScanAlreadyRunning,
    ScanNotRunning,
}

impl From<CommandError> for LibraryCommandError {
    fn from(error: CommandError) -> Self {
        Self::Common { error }
    }
}

impl From<StoreError> for LibraryCommandError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::InvalidCursor => Self::InvalidCursor,
            StoreError::AlbumNotFound => Self::AlbumNotFound,
            StoreError::AlbumArtistNotFound => Self::AlbumArtistNotFound,
            StoreError::TrackNotFound => Self::Common {
                error: CommandError::TrackNotFound,
            },
            StoreError::TrackUnavailable => Self::Common {
                error: CommandError::TrackUnavailable,
            },
            StoreError::Persistence => Self::Common {
                error: CommandError::PersistenceFailed,
            },
        }
    }
}

/// The codes the Renderer shows for a Library command. A cursor is never invalid from the
/// Renderer's side, so it is a failed task.
impl From<LibraryCommandError> for CommandError {
    fn from(error: LibraryCommandError) -> Self {
        match error {
            LibraryCommandError::Common { error } => error,
            LibraryCommandError::ScanInProgress | LibraryCommandError::ScanAlreadyRunning => {
                Self::ScanAlreadyRunning
            }
            LibraryCommandError::ScanNotRunning => Self::ScanNotRunning,
            LibraryCommandError::NoEnabledDirectories => Self::NoEnabledDirectories,
            LibraryCommandError::AlbumNotFound => Self::AlbumNotFound,
            LibraryCommandError::AlbumArtistNotFound => Self::ArtistNotFound,
            LibraryCommandError::InvalidCursor => Self::TaskFailed,
        }
    }
}

/// A track's file is not where the Library says it is, or not inside its directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("the track's location is unavailable")]
pub struct Unavailable;

impl From<Unavailable> for StoreError {
    fn from(_: Unavailable) -> Self {
        Self::TrackUnavailable
    }
}

impl From<Unavailable> for LibraryCommandError {
    fn from(_: Unavailable) -> Self {
        Self::Common {
            error: CommandError::TrackUnavailable,
        }
    }
}

/// Where a track's file is: a directory and a path below it. Every consumer (playback, properties,
/// Show in Explorer, lyrics) builds the file's path here, so none can skip the check that it stays
/// inside its directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrackLocation {
    directory: PathBuf,
    relative: PathBuf,
    available: bool,
}

/// A track's file as it is on disk right now. Both paths are canonical.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExistingFile {
    pub directory: PathBuf,
    pub path: PathBuf,
}

impl TrackLocation {
    pub(crate) fn new(directory: &str, relative: &str, available: bool) -> Self {
        Self {
            directory: PathBuf::from(directory),
            relative: PathBuf::from(relative),
            available,
        }
    }

    /// The file's path, without touching the filesystem: the directory joined with a relative path that
    /// only descends. Cheap enough to take for every track of a playback context.
    pub(crate) fn path(&self) -> Result<PathBuf, Unavailable> {
        let descends = self
            .relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
        if !descends || self.relative.as_os_str().is_empty() {
            return Err(Unavailable);
        }
        Ok(self.directory.join(&self.relative))
    }

    /// The file itself: still marked available, still there, and (symbolic links resolved) still
    /// inside its directory.
    pub(crate) fn existing(&self) -> Result<ExistingFile, Unavailable> {
        if !self.available {
            return Err(Unavailable);
        }
        let path = self.path()?;
        let directory = dunce::canonicalize(&self.directory)
            .inspect_err(|cause| {
                log::warn!("library.location.directory_canonicalize_failed cause={cause}");
            })
            .map_err(|_| Unavailable)?;
        let path = dunce::canonicalize(path)
            .inspect_err(|cause| {
                log::warn!("library.location.path_canonicalize_failed cause={cause}");
            })
            .map_err(|_| Unavailable)?;
        if !path.starts_with(&directory) || !path.is_file() {
            return Err(Unavailable);
        }
        Ok(ExistingFile { directory, path })
    }
}

#[derive(Clone)]
pub(crate) struct Library {
    database: Database,
    store: LibraryStore,
    sync: Arc<LibrarySync>,
}

impl Library {
    /// Opens the Library in `directory`: opens its database (see `Database::initialize`), then
    /// starts watching and scanning the registered directories.
    pub(crate) fn open(
        directory: &Path,
        hub: Arc<StateHub>,
    ) -> Result<Self, LibraryUnavailableReason> {
        let database = Database::initialize(directory).map_err(|error| {
            error!("library.database.unavailable cause={error}");
            LibraryUnavailableReason::DatabaseOpenFailed
        })?;
        let sync = LibrarySync::start(database.clone(), hub);
        Ok(Self {
            store: LibraryStore::new(database.clone()),
            database,
            sync: Arc::new(sync),
        })
    }

    /// The read side.
    pub(crate) fn store(&self) -> &LibraryStore {
        &self.store
    }

    pub(crate) fn directories(&self) -> Result<Vec<LibraryDirectory>, CommandError> {
        Ok(self.store.directories()?)
    }

    /// Adds a directory. A path that is not valid Unicode cannot be stored, so it is refused rather
    /// than changed.
    pub(crate) fn add_directory(&self, path: PathBuf) -> Result<LibraryDirectory, CommandError> {
        let path = path
            .into_os_string()
            .into_string()
            .map_err(|_| CommandError::InvalidDirectory)?;
        self.sync.add_directory(path)
    }

    pub(crate) fn set_directory_enabled(
        &self,
        id: DirectoryId,
        enabled: bool,
    ) -> Result<(), CommandError> {
        self.sync.set_directory_enabled(id, enabled)
    }

    pub(crate) fn remove_directory(&self, id: DirectoryId) -> Result<(), CommandError> {
        self.sync.remove_directory(id)
    }

    /// Deletes every Missing track from the Library. Source files are never touched.
    pub(crate) fn delete_missing(&self) -> Result<u64, LibraryCommandError> {
        self.sync.delete_missing()
    }

    pub(crate) fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.sync.start_scan()
    }

    pub(crate) fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.sync.cancel_scan()
    }

    /// The accent color of stored artwork, computed on first request and cached.
    pub(crate) fn artwork_accent(
        &self,
        hash: &ArtworkHash,
    ) -> Result<Option<String>, LibraryCommandError> {
        Ok(accent::artwork_accent(&self.database, hash)?)
    }

    /// Stops the watchers and any scan in progress, waits for them, and drops the idle read
    /// connections, so the database file can be replaced.
    pub(crate) fn shutdown(&self) {
        self.sync.shutdown();
        self.database.close();
    }
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}
