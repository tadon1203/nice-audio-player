use backend::{
    audio::{
        playback::{PlaybackPosition, PlaybackQueueSnapshot, PlaybackSnapshot},
        waveform::PlaybackWaveform,
    },
    messages::{BackendMessage, StateMessage, StateValue},
    settings::Appearance,
};
use serde::Serialize;

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    #[serde(rename = "playbackStateChanged")]
    Playback(Box<PlaybackSnapshot>),
    #[serde(rename = "playbackPositionChanged")]
    PlaybackPosition(PlaybackPosition),
    #[serde(rename = "playbackQueueStateChanged")]
    PlaybackQueue(PlaybackQueueSnapshot),
    #[serde(rename = "libraryScanStateChanged")]
    LibraryScan(backend::library::models::LibraryScanSnapshot),
    /// The loaded track's waveform, whenever a better one is ready.
    #[serde(rename = "waveformChanged")]
    Waveform(PlaybackWaveform),
    #[serde(rename = "settingsChanged")]
    Settings(Appearance),
}

/// The `app:event` a message stands for, until the Renderer reads the channel. `None` when the
/// old events had nothing to say: an occurrence, or a waveform that is not ready.
pub fn app_event(message: &BackendMessage) -> Option<AppEvent> {
    Some(match message {
        BackendMessage::State(StateMessage { state, .. }) => match state {
            StateValue::Playback(snapshot) => AppEvent::Playback(snapshot.clone()),
            StateValue::Queue(queue) => AppEvent::PlaybackQueue(queue.clone()),
            StateValue::LibraryScan(scan) => AppEvent::LibraryScan(scan.clone()),
            StateValue::Waveform(waveform) => AppEvent::Waveform(waveform.clone()?),
            StateValue::Appearance(appearance) => AppEvent::Settings(appearance.clone()),
        },
        BackendMessage::Position(position) => AppEvent::PlaybackPosition(position.clone()),
        BackendMessage::Occurrence(_) => return None,
    })
}
