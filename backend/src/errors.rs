//! The error a command answers with, and the function that keeps a panic from a parser from
//! reaching the Host. Each code is what the Renderer sees; the messages only reach the log.

use crate::audio::playback::PlaybackFailureCode;
use std::any::Any;
use std::panic::{UnwindSafe, catch_unwind};

/// The codes a command can answer with, so the Renderer shows each one the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum CommandError {
    // shared
    #[error("the track was not found")]
    TrackNotFound,
    #[error("the track cannot be played")]
    TrackUnavailable,
    #[error("the library is unavailable")]
    LibraryUnavailable,
    #[error("the change could not be saved")]
    PersistenceFailed,
    #[error("the background task failed")]
    TaskFailed,
    // library
    #[error("the folder is invalid")]
    InvalidFolder,
    #[error("the folder is not a directory")]
    FolderNotDirectory,
    #[error("the folder is already in the library")]
    DuplicateFolder,
    #[error("the folder overlaps another folder")]
    OverlappingFolder,
    #[error("the folder contains the app's data directory")]
    FolderContainsDataDirectory,
    #[error("the folder is missing")]
    FolderMissing,
    #[error("the album was not found")]
    AlbumNotFound,
    #[error("the artist was not found")]
    ArtistNotFound,
    #[error("a scan is already running")]
    ScanAlreadyRunning,
    #[error("no scan is running")]
    ScanNotRunning,
    #[error("no folder is enabled")]
    NoEnabledFolders,
    // player
    #[error("the output failed: {failure:?}")]
    Output { failure: PlaybackFailureCode },
    #[error("the playback was superseded")]
    Superseded,
    #[error("the queue item was not found")]
    QueueItemNotFound,
    #[error("the queue is busy")]
    QueueBusy,
    #[error("the volume is invalid")]
    InvalidVolume,
    #[error("the playback state is invalid")]
    InvalidPlaybackState,
    #[error("the duration is unavailable")]
    DurationUnavailable,
    #[error("the seek failed")]
    SeekFailed,
    // devices
    #[error("the audio devices could not be listed")]
    DeviceEnumerationFailed,
}

/// A panic caught by [`contain`]. The payload is logged there and not kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Panicked;

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
    use super::{Panicked, contain, panic_message};
    use std::panic::catch_unwind;

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
