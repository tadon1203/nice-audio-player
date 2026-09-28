//! Audio playback: one worker thread owns the queue and the output stream; the rest of the
//! application talks to it through `PlaybackService` and reads published snapshots.

mod decode_worker;
mod item;
mod preferences;
mod queue;
mod service;
mod session;
mod snapshot;
mod source_loader;
mod worker;

pub use item::{PlaybackItem, PlaybackItemSeed};
pub use preferences::{PlaybackPreferences, PreferencesObserver};
pub use queue::{PlaybackQueueMoveDirection, PlaybackRepeatMode};
pub use service::{
    PlaybackService, PlaybackServiceError, PlaybackServiceHandle, PlaybackServiceStartError,
};
pub use snapshot::{
    ActiveSession, PlaybackChannelConversion, PlaybackFailureCode, PlaybackQueueItem,
    PlaybackQueueSnapshot, PlaybackSnapshot, SnapshotBase,
};

#[cfg(test)]
mod tests;
