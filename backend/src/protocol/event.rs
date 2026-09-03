use crate::audio::playback::{PlaybackQueueSnapshot, PlaybackSnapshot};
use serde::Serialize;

#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum BackendEvent {
    Ready,
    PlaybackStateChanged(PlaybackSnapshot),
    PlaybackQueueStateChanged(PlaybackQueueSnapshot),
}
