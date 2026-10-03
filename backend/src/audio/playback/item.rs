use std::ops::Deref;

use crate::library::store::PlayableTrack;

/// One entry of the playback queue and the identity of the loaded track: the queue's id for the
/// entry and the track's metadata, shared with every other layer as one type.
///
/// Everything a listener-facing feature needs about "what is playing" lives here, so history,
/// system media controls, and the UI never have to look the track up again by path.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackItem {
    pub queue_item_id: String,
    #[serde(flatten)]
    pub track: PlayableTrack,
}

impl Deref for PlaybackItem {
    type Target = PlayableTrack;

    fn deref(&self) -> &PlayableTrack {
        &self.track
    }
}
