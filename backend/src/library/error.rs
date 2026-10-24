//! The Library's error vocabularies. Inside, the store speaks `StoreError`, which is logged once
//! with its cause where it is built; the facade maps it to the renderer-facing
//! `LibraryCommandError`, whose codes carry no implementation detail.

use super::database::DatabaseError;
use crate::errors::CommandError;
use log::error;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(
    tag = "code",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LibraryCommandError {
    Common {
        error: CommandError,
    },
    InvalidDirectory,
    DirectoryNotDirectory,
    CanonicalizationFailed,
    DuplicateDirectory,
    OverlappingDirectory,
    /// The directory holds the app's own data directory, which a scan would read as music.
    DirectoryContainsDataDirectory,
    ScanInProgress,
    AlbumNotFound,
    InvalidCursor,
    AlbumArtistNotFound,
    DirectoryMissing,
    ScanAlreadyRunning,
    NoEnabledDirectories,
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

/// The codes the Renderer shows for a Library command. A path that cannot be resolved is an
/// invalid directory, and a cursor is never invalid from the Renderer's side, so it is a failed task.
impl From<LibraryCommandError> for CommandError {
    fn from(error: LibraryCommandError) -> Self {
        match error {
            LibraryCommandError::Common { error } => error,
            LibraryCommandError::InvalidDirectory | LibraryCommandError::CanonicalizationFailed => {
                Self::InvalidDirectory
            }
            LibraryCommandError::DirectoryNotDirectory => Self::DirectoryNotDirectory,
            LibraryCommandError::DuplicateDirectory => Self::DuplicateDirectory,
            LibraryCommandError::OverlappingDirectory => Self::OverlappingDirectory,
            LibraryCommandError::DirectoryContainsDataDirectory => {
                Self::DirectoryContainsDataDirectory
            }
            LibraryCommandError::ScanInProgress | LibraryCommandError::ScanAlreadyRunning => {
                Self::ScanAlreadyRunning
            }
            LibraryCommandError::ScanNotRunning => Self::ScanNotRunning,
            LibraryCommandError::NoEnabledDirectories => Self::NoEnabledDirectories,
            LibraryCommandError::AlbumNotFound => Self::AlbumNotFound,
            LibraryCommandError::AlbumArtistNotFound => Self::ArtistNotFound,
            LibraryCommandError::DirectoryMissing => Self::DirectoryMissing,
            LibraryCommandError::InvalidCursor => Self::TaskFailed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CommandError, LibraryCommandError};

    #[test]
    fn renamed_and_bug_codes_map_to_the_shared_codes() {
        assert_eq!(
            CommandError::from(LibraryCommandError::ScanInProgress),
            CommandError::ScanAlreadyRunning
        );
        assert_eq!(
            CommandError::from(LibraryCommandError::CanonicalizationFailed),
            CommandError::InvalidDirectory
        );
        assert_eq!(
            CommandError::from(LibraryCommandError::AlbumArtistNotFound),
            CommandError::ArtistNotFound
        );
        assert_eq!(
            CommandError::from(LibraryCommandError::InvalidCursor),
            CommandError::TaskFailed
        );
    }
}
