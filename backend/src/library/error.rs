//! The Library's error vocabularies. Inside, the store speaks `StoreError`, which is logged once
//! with its cause where it is built; the facade maps it to the renderer-facing
//! `LibraryCommandError`, whose codes carry no implementation detail.

use super::database::DatabaseError;
use crate::errors::CommonError;
use log::error;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LibraryCommandError {
    Common {
        error: CommonError,
    },
    InvalidRoot,
    RootNotDirectory,
    CanonicalizationFailed,
    DuplicateRoot,
    OverlappingRoot,
    /// The folder holds the app's own data directory, which a scan would read as music.
    RootContainsDataDirectory,
    ScanInProgress,
    AlbumNotFound,
    InvalidCursor,
    AlbumArtistNotFound,
    RootMissing,
    ScanAlreadyRunning,
    NoEnabledRoots,
    ScanNotRunning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreError {
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
        error!("library.store.unavailable cause={cause:?}");
        Self::Persistence
    }
}

/// The shared codes a store failure maps to. A failure that no shared code describes is reported as
/// a persistence failure, which is how the lyrics and playback commands have always reported it.
impl From<StoreError> for CommonError {
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

impl From<StoreError> for LibraryCommandError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::InvalidCursor => Self::InvalidCursor,
            StoreError::AlbumNotFound => Self::AlbumNotFound,
            StoreError::AlbumArtistNotFound => Self::AlbumArtistNotFound,
            StoreError::TrackNotFound => Self::Common {
                error: CommonError::TrackNotFound,
            },
            StoreError::TrackUnavailable => Self::Common {
                error: CommonError::TrackUnavailable,
            },
            StoreError::Persistence => Self::Common {
                error: CommonError::PersistenceFailed,
            },
        }
    }
}

impl crate::tasks::TaskError for LibraryCommandError {
    fn task_failed() -> Self {
        Self::Common {
            error: CommonError::TaskFailed,
        }
    }
}
