//! The Library: the indexed set of tracks from the registered music directories.
//!
//! `Library::start` always yields a Library. One that could not open its database is unavailable:
//! it answers every command with `LibraryUnavailable`. A working Library has two sides that meet only in the database: the read side
//! (`lists` and `tracks`: the lists, playback selections, track lookups) and the write side
//! (`sync`: directories, watchers, and the scan), reached through the methods below.

pub(crate) mod albums;
pub(crate) mod artwork;
pub(crate) mod database;
pub(crate) mod directories;
pub(crate) mod lists;
pub(crate) mod media;
pub(crate) mod models;
pub(crate) mod scan;
#[cfg(test)]
mod store_tests;
pub(crate) mod sync;
#[cfg(test)]
mod tests;
pub(crate) mod text;
pub(crate) mod tracks;
pub(crate) mod version;

use crate::Result;
use crate::errors::Error;
use crate::ids::DirectoryId;
use crate::messages::{self, BackendMessage};
use database::{Database, ReadConnection};
use log::error;
#[cfg(test)]
use models::LibraryDirectory;
use models::LibraryState;
use serde::Serialize;
use std::{
    path::{Component, Path, PathBuf},
    sync::{Arc, mpsc::Sender},
    time::{SystemTime, UNIX_EPOCH},
};
use sync::LibrarySync;
use version::LibraryVersion;

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

/// Whether the Library is usable. It is unavailable only when its database cannot be opened: any
/// other database is replaced at open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LibraryStatus {
    Ready,
    Unavailable,
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
    pub(crate) fn path(&self) -> Result<PathBuf> {
        let descends = self
            .relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
        if !descends || self.relative.as_os_str().is_empty() {
            return Err(Error::TrackUnavailable);
        }
        Ok(self.directory.join(&self.relative))
    }

    /// The file itself: still marked available, still there, and (symbolic links resolved) still
    /// inside its directory. A path that cannot be resolved is a file that is not there.
    pub(crate) fn existing(&self) -> Result<ExistingFile> {
        if !self.available {
            return Err(Error::TrackUnavailable);
        }
        let path = self.path()?;
        let Ok(directory) = dunce::canonicalize(&self.directory) else {
            return Err(Error::TrackUnavailable);
        };
        let Ok(path) = dunce::canonicalize(path) else {
            return Err(Error::TrackUnavailable);
        };
        if !path.starts_with(&directory) || !path.is_file() {
            return Err(Error::TrackUnavailable);
        }
        Ok(ExistingFile { directory, path })
    }
}

#[derive(Clone)]
pub(crate) struct Library {
    database: Database,
    sync: Arc<LibrarySync>,
    /// See [`Library::version`]. Shared with the sync worker and the scan thread, which advance it
    /// after each commit that alters a list.
    version: Arc<LibraryVersion>,
}

impl Library {
    /// The Library of the data directory `directory`, always: when its database cannot be opened,
    /// the cause is logged, the Unavailable state is sent, and the Library that returns fails
    /// every command with `LibraryUnavailable`. No worker runs in that case, so the state is sent
    /// here.
    pub(crate) fn start(directory: &Path, host: &Sender<BackendMessage>) -> Self {
        Self::open(directory, host.clone()).unwrap_or_else(|cause| {
            error!("library.open_failed cause={cause}");
            messages::send(
                host,
                BackendMessage::Library(LibraryState::empty(LibraryStatus::Unavailable)),
            );
            Self {
                database: Database::unavailable(),
                sync: Arc::new(LibrarySync::Unavailable),
                version: Arc::new(LibraryVersion::default()),
            }
        })
    }

    /// Opens the Library in `directory`: opens its database (see `Database::initialize`), then
    /// starts watching and scanning the registered directories.
    pub(crate) fn open(directory: &Path, host: Sender<BackendMessage>) -> Result<Self> {
        let database = Database::initialize(directory)?;
        let version = Arc::new(LibraryVersion::default());
        let sync = LibrarySync::start(database.clone(), host, Arc::clone(&version));
        Ok(Self {
            database,
            sync: Arc::new(sync),
            version,
        })
    }

    /// The current [`LibraryVersion`].
    pub(crate) fn version(&self) -> u64 {
        self.version.get()
    }

    fn read(&self) -> Result<ReadConnection> {
        self.database.read()
    }

    #[cfg(test)]
    pub(crate) fn directories(&self) -> Result<Vec<LibraryDirectory>> {
        let connection = self.read()?;
        directories::list(&connection)
    }

    /// Adds a directory. A path that is not valid Unicode cannot be stored, so it is refused rather
    /// than changed.
    pub(crate) fn add_directory(&self, path: PathBuf) -> Result<()> {
        let Ok(path) = path.into_os_string().into_string() else {
            return Err(Error::InvalidDirectory(None));
        };
        self.sync.add_directory(path)
    }

    pub(crate) fn set_directory_enabled(&self, id: DirectoryId, enabled: bool) -> Result<()> {
        self.sync.set_directory_enabled(id, enabled)
    }

    pub(crate) fn remove_directory(&self, id: DirectoryId) -> Result<()> {
        self.sync.remove_directory(id)
    }

    /// Deletes every Missing track from the Library. Source files are never touched.
    pub(crate) fn delete_missing_tracks(&self) -> Result<()> {
        self.sync.delete_missing_tracks()
    }

    pub(crate) fn start_scan(&self) -> Result<()> {
        self.sync.start_scan()
    }

    pub(crate) fn cancel_scan(&self) -> Result<()> {
        self.sync.cancel_scan()
    }

    /// The accent color of the stored original image at `path` (the path the Renderer holds), computed
    /// on first request and cached. A path that names no stored image has no accent.
    pub(crate) fn artwork_accent(&self, path: &str) -> Result<Option<String>> {
        let Some(hash) = artwork::hash_of_original(path) else {
            return Ok(None);
        };
        artwork::artwork_accent(&self.database, &hash)
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
