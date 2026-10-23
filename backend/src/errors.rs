//! The error a command answers with, and the helpers that log a failure or keep a panic from a
//! parser from reaching the Host. Each code is what the Renderer sees; the messages only reach
//! the log.

pub use crate::audio::devices::AudioDeviceListError;
use crate::audio::playback::PlaybackFailureCode;
pub use crate::audio::playback::service::PlaybackServiceError;
pub use crate::library::error::LibraryCommandError;
pub use crate::lyrics::LyricsCommandError;
use std::any::Any;
use std::io::ErrorKind;
use std::panic::{UnwindSafe, catch_unwind};
use std::path::Path;

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
    #[error("the directory is invalid")]
    InvalidDirectory,
    #[error("the directory is not a directory")]
    DirectoryNotDirectory,
    #[error("the directory is already in the library")]
    DuplicateDirectory,
    #[error("the directory overlaps another directory")]
    OverlappingDirectory,
    #[error("the directory contains the app's data directory")]
    DirectoryContainsDataDirectory,
    #[error("the directory is missing")]
    DirectoryMissing,
    #[error("the album was not found")]
    AlbumNotFound,
    #[error("the artist was not found")]
    ArtistNotFound,
    #[error("a scan is already running")]
    ScanAlreadyRunning,
    #[error("no scan is running")]
    ScanNotRunning,
    #[error("no directory is enabled")]
    NoEnabledDirectories,
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

/// Logs `context` and the cause at `warn`, then returns `code`.
pub fn logged<E: std::fmt::Display, C>(code: C, context: &'static str) -> impl FnOnce(E) -> C {
    move |cause| {
        log::warn!("{context} cause={cause}");
        code
    }
}

/// Logs `context` and the error at `debug` when `result` is `Err`; returns nothing.
pub fn log_failed<T, E: std::fmt::Display>(result: Result<T, E>, context: &'static str) {
    if let Err(cause) = result {
        log::debug!("{context} cause={cause}");
    }
}

/// Removes `path`. A file that is already gone is the goal, not a failure; any other error is
/// logged at `debug`. A file that cannot be removed leaves a stale file behind, which the next
/// run tolerates, so the error is not returned to the caller.
pub fn remove_file_best_effort(path: &Path) {
    if let Err(cause) = std::fs::remove_file(path)
        && cause.kind() != ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
}

#[cfg(test)]
mod tests {
    use super::{Panicked, contain, log_failed, logged, panic_message, remove_file_best_effort};
    use crate::test_support::TestDirectory;
    use parking_lot::Mutex;
    use std::panic::catch_unwind;
    use std::sync::Once;

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

    static RECORDS: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static INSTALL: Once = Once::new();

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _metadata: &log::Metadata<'_>) -> bool {
            true
        }

        fn log(&self, record: &log::Record<'_>) {
            RECORDS
                .lock()
                .push(format!("{} {}", record.level(), record.args()));
        }

        fn flush(&self) {}
    }

    fn install() {
        INSTALL.call_once(|| {
            log::set_logger(&Capture).expect("the test logger is the only one installed");
            log::set_max_level(log::LevelFilter::Debug);
        });
    }

    fn has_line(line: &str) -> bool {
        RECORDS.lock().iter().any(|record| record == line)
    }

    #[derive(Debug, PartialEq, Eq)]
    enum Code {
        Failed,
    }

    #[test]
    fn logged_returns_the_code_and_logs_the_context_with_the_cause() {
        install();

        let code = logged(Code::Failed, "diagnostics.test.reads")("disk gone");

        assert_eq!(code, Code::Failed);
        assert!(
            has_line("WARN diagnostics.test.reads cause=disk gone"),
            "the warn line must carry the context and the cause"
        );
    }

    #[test]
    fn log_failed_logs_an_error_at_debug() {
        install();

        log_failed(Err::<(), _>("disk gone"), "diagnostics.test.failed");

        assert!(
            has_line("DEBUG diagnostics.test.failed cause=disk gone"),
            "the debug line must carry the context and the cause"
        );
    }

    #[test]
    fn log_failed_is_silent_on_ok() {
        install();

        log_failed(Ok::<(), &str>(()), "diagnostics.test.succeeded");

        assert!(
            !RECORDS
                .lock()
                .iter()
                .any(|record| record.contains("diagnostics.test.succeeded")),
            "an Ok result logs nothing"
        );
    }

    #[test]
    fn a_missing_file_is_not_an_error() {
        let directory = TestDirectory::new();
        let missing = directory.file("gone.bin");

        remove_file_best_effort(&missing);

        assert!(!missing.exists());
    }

    #[test]
    fn an_existing_file_is_removed() {
        let directory = TestDirectory::new();
        let file = directory.file("stale.bin");
        std::fs::write(&file, b"stale").unwrap();

        remove_file_best_effort(&file);

        assert!(!file.exists());
    }
}
