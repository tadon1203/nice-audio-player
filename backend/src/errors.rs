//! The error types a command answers with. Each one is the code the Renderer sees.

pub use crate::audio::devices::AudioDeviceListError;
pub use crate::audio::playback::service::PlaybackServiceError;
pub use crate::library::error::LibraryCommandError;
pub use crate::lyrics::LyricsCommandError;

/// The codes every command can answer with, so the Renderer shows each one the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum CommonError {
    TrackNotFound,
    TrackUnavailable,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}
