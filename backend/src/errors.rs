//! The error of the Backend, and the code a command answers the Renderer with. A function that can
//! fail returns `crate::Result<T>` and uses `?`. The Host converts the error to a `CommandError` and
//! logs it once, at the command boundary.
//!
//! `contain` keeps a panic from a parser from reaching the Host.

use std::any::Any;
use std::panic::{UnwindSafe, catch_unwind};

/// The failure of a Backend function. It keeps its cause, so the Host's log shows the whole chain.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("the track was not found")]
    TrackNotFound,
    #[error("the album was not found")]
    AlbumNotFound,
    #[error("the artist was not found")]
    ArtistNotFound,
    #[error("the queue item is not upcoming or is not in the queue")]
    QueueItemNotFound,
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
    /// The user changes a directory while a scan runs. The Renderer disables that control during a
    /// scan, so this is a rare race.
    #[error("a scan is running")]
    ScanRunning,
    #[error("a worker has stopped")]
    WorkerStopped,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Lofty(#[from] lofty::error::FileParseError),
    #[error(transparent)]
    Cpal(#[from] cpal::Error),
}

impl Error {
    /// The code the Renderer sees. Every failure that the Renderer cannot act on is `Internal`.
    pub fn code(&self) -> CommandError {
        match self {
            Self::TrackNotFound
            | Self::AlbumNotFound
            | Self::ArtistNotFound
            | Self::QueueItemNotFound => CommandError::NotFound,
            Self::TrackUnavailable => CommandError::TrackUnavailable,
            Self::LibraryUnavailable => CommandError::LibraryUnavailable,
            Self::InvalidDirectory(_) => CommandError::InvalidDirectory,
            Self::DuplicateDirectory => CommandError::DuplicateDirectory,
            Self::OverlappingDirectory => CommandError::OverlappingDirectory,
            Self::DirectoryContainsDataDirectory => CommandError::DirectoryContainsDataDirectory,
            Self::ScanRunning
            | Self::WorkerStopped
            | Self::Database(_)
            | Self::Io(_)
            | Self::Lofty(_)
            | Self::Cpal(_) => CommandError::Internal,
        }
    }
}

/// The result of a Backend function.
pub type Result<T, E = Error> = std::result::Result<T, E>;

/// The codes a command answers with. Each code has one message in the Renderer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum CommandError {
    NotFound,
    TrackUnavailable,
    LibraryUnavailable,
    InvalidDirectory,
    DuplicateDirectory,
    OverlappingDirectory,
    DirectoryContainsDataDirectory,
    Internal,
}

/// A panic caught by [`contain`]. The payload is logged there and not kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Panicked;

impl std::fmt::Display for Panicked {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("the work panicked")
    }
}

/// Runs `f` and turns a panic into `Panicked` (logs `name` and the payload).
/// Used only where third-party parsers read the user's files.
pub fn contain<T>(name: &str, f: impl FnOnce() -> T + UnwindSafe) -> Result<T, Panicked> {
    catch_unwind(f).map_err(|payload| {
        log::error!(
            "contain.panicked what={name} message={}",
            panic_message(payload.as_ref())
        );
        Panicked
    })
}

/// Reads the message of a panic payload. A panic with a format string carries a `String`,
/// and a panic with a literal carries a `&str`.
fn panic_message(payload: &(dyn Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("non-string panic payload")
}

#[cfg(test)]
mod tests {
    use super::{CommandError, Error, Panicked, contain, panic_message};
    use std::panic::catch_unwind;

    #[test]
    fn each_error_has_one_command_code() {
        let cases = [
            (Error::TrackNotFound, CommandError::NotFound),
            (Error::AlbumNotFound, CommandError::NotFound),
            (Error::ArtistNotFound, CommandError::NotFound),
            (Error::QueueItemNotFound, CommandError::NotFound),
            (Error::TrackUnavailable, CommandError::TrackUnavailable),
            (Error::LibraryUnavailable, CommandError::LibraryUnavailable),
            (
                Error::InvalidDirectory(None),
                CommandError::InvalidDirectory,
            ),
            (Error::DuplicateDirectory, CommandError::DuplicateDirectory),
            (
                Error::OverlappingDirectory,
                CommandError::OverlappingDirectory,
            ),
            (
                Error::DirectoryContainsDataDirectory,
                CommandError::DirectoryContainsDataDirectory,
            ),
            (Error::WorkerStopped, CommandError::Internal),
        ];
        for (error, code) in cases {
            assert_eq!(error.code(), code, "{error}");
        }
    }

    #[test]
    fn the_database_and_io_errors_show_their_cause_and_code_is_internal() {
        let database = Error::from(rusqlite::Error::InvalidQuery);
        assert_eq!(
            database.to_string(),
            rusqlite::Error::InvalidQuery.to_string()
        );
        assert_eq!(database.code(), CommandError::Internal);

        let io = Error::from(std::io::Error::other("disk"));
        assert_eq!(io.to_string(), "disk");
        assert_eq!(io.code(), CommandError::Internal);
    }

    #[test]
    fn contain_returns_panicked_for_a_panicking_closure_and_ok_otherwise() {
        assert_eq!(contain("test", || 7), Ok(7));
        assert_eq!(
            contain("test", || -> u8 { panic!("bad file") }),
            Err(Panicked)
        );
    }

    #[test]
    fn the_panic_message_is_read_from_both_payload_types() {
        let literal = catch_unwind(|| panic!("bad file")).unwrap_err();
        assert_eq!(panic_message(literal.as_ref()), "bad file");

        let formatted = catch_unwind(|| panic!("bad {}", "file")).unwrap_err();
        assert_eq!(panic_message(formatted.as_ref()), "bad file");

        let other = catch_unwind(|| std::panic::panic_any(7u8)).unwrap_err();
        assert_eq!(panic_message(other.as_ref()), "non-string panic payload");
    }
}
