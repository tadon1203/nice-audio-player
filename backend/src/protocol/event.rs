use crate::audio::playback::{PlaybackQueueSnapshot, PlaybackSnapshot};
use crate::{activity::ApplicationActivity, library::models::LibraryScanSnapshot};
use serde::Serialize;

#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum BackendEvent {
    Ready,
    PlaybackStateChanged(PlaybackSnapshot),
    PlaybackQueueStateChanged(PlaybackQueueSnapshot),
    ApplicationActivitiesChanged(Vec<ApplicationActivity>),
    LibraryScanStateChanged(LibraryScanSnapshot),
}
