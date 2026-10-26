//! The code a command answers the Renderer with, and `contain`. Each domain has its own error type:
//! `LibraryError` and `PlayerError`. A failure that no caller matches travels as `anyhow::Error`.
//! The Host turns the error of a use case into a `CommandError` and logs it once, at the command
//! boundary.
//!
//! The messages of the errors are for the log. The Backend builds no text for the user.

use crate::library::errors::LibraryError;
use crate::player::errors::PlayerError;
use std::any::Any;
use std::panic::{UnwindSafe, catch_unwind};

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

impl CommandError {
    /// The code for `error`. A failure that the Renderer cannot act on is `Internal`.
    pub fn of(error: &anyhow::Error) -> Self {
        if let Some(error) = error.downcast_ref::<LibraryError>() {
            error.code()
        } else if let Some(error) = error.downcast_ref::<PlayerError>() {
            error.code()
        } else {
            Self::Internal
        }
    }
}

/// Runs `f` and turns a panic into an error (the payload is in its message).
/// Used only where third-party parsers read the user's files.
pub fn contain<T>(name: &str, f: impl FnOnce() -> T + UnwindSafe) -> anyhow::Result<T> {
    catch_unwind(f)
        .map_err(|payload| anyhow::anyhow!("{name} panicked: {}", panic_message(payload.as_ref())))
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
    use super::{CommandError, contain, panic_message};
    use crate::library::errors::LibraryError;
    use crate::player::errors::PlayerError;
    use std::panic::catch_unwind;

    #[test]
    fn each_library_error_has_one_command_code() {
        let cases = [
            (LibraryError::TrackNotFound, CommandError::NotFound),
            (LibraryError::AlbumNotFound, CommandError::NotFound),
            (LibraryError::ArtistNotFound, CommandError::NotFound),
            (
                LibraryError::TrackUnavailable,
                CommandError::TrackUnavailable,
            ),
            (
                LibraryError::LibraryUnavailable,
                CommandError::LibraryUnavailable,
            ),
            (
                LibraryError::InvalidDirectory(None),
                CommandError::InvalidDirectory,
            ),
            (
                LibraryError::DuplicateDirectory,
                CommandError::DuplicateDirectory,
            ),
            (
                LibraryError::OverlappingDirectory,
                CommandError::OverlappingDirectory,
            ),
            (
                LibraryError::DirectoryContainsDataDirectory,
                CommandError::DirectoryContainsDataDirectory,
            ),
            (
                LibraryError::Internal(anyhow::anyhow!("a worker has stopped")),
                CommandError::Internal,
            ),
        ];
        for (error, code) in cases {
            let message = error.to_string();
            assert_eq!(CommandError::of(&error.into()), code, "{message}");
        }
    }

    #[test]
    fn a_player_error_has_a_code_and_wraps_a_library_error() {
        let missing = anyhow::Error::from(PlayerError::QueueItemNotFound);
        assert_eq!(CommandError::of(&missing), CommandError::NotFound);

        let wrapped = anyhow::Error::from(PlayerError::from(LibraryError::LibraryUnavailable));
        assert_eq!(CommandError::of(&wrapped), CommandError::LibraryUnavailable);
    }

    #[test]
    fn the_code_is_found_through_context() {
        let error = anyhow::Error::from(LibraryError::DuplicateDirectory).context("adding");
        assert_eq!(CommandError::of(&error), CommandError::DuplicateDirectory);
    }

    #[test]
    fn an_error_of_no_domain_is_internal_and_shows_its_cause() {
        let io = anyhow::Error::from(std::io::Error::other("disk"));
        assert_eq!(io.to_string(), "disk");
        assert_eq!(CommandError::of(&io), CommandError::Internal);
    }

    #[test]
    fn contain_returns_an_error_for_a_panicking_closure_and_ok_otherwise() {
        assert_eq!(contain("test", || 7).ok(), Some(7));
        let error = contain("test", || -> u8 { panic!("bad file") }).unwrap_err();
        assert_eq!(error.to_string(), "test panicked: bad file");
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
