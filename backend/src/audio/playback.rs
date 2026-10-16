//! Audio playback: one worker thread owns the queue and the output stream; the rest of the
//! application talks to it through `PlaybackService` and reads published snapshots.

mod decode_worker;
mod input;
mod item;
mod pipeline;
mod preferences;
mod queue;
mod resolver;
mod service;
mod session;
mod snapshot;
mod source_loader;
mod worker;

pub use item::PlaybackItem;
pub use preferences::PlaybackPreferences;
pub use queue::PlaybackRepeatMode;
pub use resolver::{NoTracks, TrackResolver, TrackSource};
pub use service::{PlaybackService, PlaybackServiceError};
pub use snapshot::{
    ActiveSession, PlaybackFailureCode, PlaybackPosition, PlaybackQueueItem, PlaybackQueueSnapshot,
    PlaybackQueueWindow, PlaybackSnapshot, SessionStartedBy,
};

#[cfg(test)]
mod tests;
