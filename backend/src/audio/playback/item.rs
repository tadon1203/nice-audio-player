use std::ops::Deref;

use crate::ids::QueueItemId;
use crate::library::models::NowPlayingTrack;
use crate::library::tracks::PlayableTrack;

/// One entry of the playback queue and the identity of the loaded track, as the renderer sees
/// it: the queue's id for the entry and the track's metadata. It carries no file path.
///
/// Everything a listener-facing feature needs about "what is playing" lives here, so history
/// and the UI can show it without reading the library again.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackItem {
    pub queue_item_id: QueueItemId,
    #[serde(flatten)]
    pub track: NowPlayingTrack,
}

/// The queue entry the playback worker plays: the entry's id and the playable track, file
/// included. Internal to the backend and never serialized; `to_playback_item` gives the renderer's view.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PlayableItem {
    pub queue_item_id: QueueItemId,
    pub track: PlayableTrack,
}

impl PlayableItem {
    pub(super) fn to_playback_item(&self) -> PlaybackItem {
        PlaybackItem {
            queue_item_id: self.queue_item_id,
            track: self.track.track.clone(),
        }
    }
}

impl Deref for PlayableItem {
    type Target = PlayableTrack;

    fn deref(&self) -> &PlayableTrack {
        &self.track
    }
}
