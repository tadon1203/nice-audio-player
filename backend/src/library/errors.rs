//! The failure of a Library function. A variant exists only where a caller matches it. Every other
//! failure is `Internal`. The messages are for the log.

use crate::errors::CommandError;

#[derive(Debug, thiserror::Error)]
pub(crate) enum LibraryError {
    #[error("the track was not found")]
    TrackNotFound,
    #[error("the album was not found")]
    AlbumNotFound,
    #[error("the artist was not found")]
    ArtistNotFound,
    #[error("the track's file is unavailable")]
    TrackUnavailable,
    #[error("the library is unavailable")]
    LibraryUnavailable,
    /// The path is blank, is not a directory, or is not Unicode. `Some` carries the error from
    /// reading the path.
    #[error("the directory is invalid")]
    InvalidDirectory(#[source] Option<std::io::Error>),
    #[error("the directory is already in the library")]
    DuplicateDirectory,
    #[error("the directory overlaps another directory")]
    OverlappingDirectory,
    #[error("the directory contains the app's data directory")]
    DirectoryContainsDataDirectory,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub(crate) type Result<T> = std::result::Result<T, LibraryError>;

impl LibraryError {
    /// The code the Renderer sees.
    pub(crate) fn code(&self) -> CommandError {
        match self {
            Self::TrackNotFound | Self::AlbumNotFound | Self::ArtistNotFound => {
                CommandError::NotFound
            }
            Self::TrackUnavailable => CommandError::TrackUnavailable,
            Self::LibraryUnavailable => CommandError::LibraryUnavailable,
            Self::InvalidDirectory(_) => CommandError::InvalidDirectory,
            Self::DuplicateDirectory => CommandError::DuplicateDirectory,
            Self::OverlappingDirectory => CommandError::OverlappingDirectory,
            Self::DirectoryContainsDataDirectory => CommandError::DirectoryContainsDataDirectory,
            Self::Internal(_) => CommandError::Internal,
        }
    }
}

/// `?` turns the error of a library the Library uses into `Internal`.
macro_rules! internal_from {
    ($($error:ty),+) => {$(
        impl From<$error> for LibraryError {
            fn from(error: $error) -> Self {
                Self::Internal(error.into())
            }
        }
    )+};
}

internal_from!(
    rusqlite::Error,
    std::io::Error,
    lofty::error::FileParseError
);
