//! Audio playback: one worker thread owns the queue and the output stream; the rest of the
//! application talks to it through `PlaybackService` and reads published snapshots.

use std::sync::Arc;

use crate::ids::PlaybackId;
use crate::library::tracks::PlayableTrack;

mod decode_worker;
mod input;
mod item;
mod pipeline;
mod preferences;
mod queue;
mod resolver;
pub(crate) mod service;
mod session;
mod snapshot;
mod source_loader;
mod worker;

pub use item::PlaybackItem;
pub(crate) use preferences::PlaybackPreferences;
pub use queue::RepeatMode;
pub(crate) use resolver::{NoTracks, TrackResolver, TrackSource};
pub(crate) use service::{PlaybackService, PlaybackServiceError, initial_playback};
pub use snapshot::{
    CurrentPlayback, PlaybackFailureCode, PlaybackPosition, PlaybackQueueItem, PlaybackState,
    QueueState, QueueWindow, StartedBy,
};

/// Hears that a track was loaded as the Playback with this id.
pub(crate) type LoadObserver = Arc<dyn Fn(PlaybackId, &PlayableTrack) + Send + Sync>;

/// Hears that a track is about to play next.
pub(crate) type UpcomingObserver = Arc<dyn Fn(&PlayableTrack) + Send + Sync>;

/// Hears what the Player does with tracks, without knowing who listens.
pub(crate) struct TrackListener {
    pub loaded: LoadObserver,
    /// Its analysis may start now.
    pub upcoming: UpcomingObserver,
}

#[cfg(test)]
mod tests;
