//! What the Backend tells the Host, on one channel: each state value whole, the playing position,
//! and the events that are not state. Each state value has one owner thread that holds it and sends
//! it when it changes. The Host keeps the newest of each and sends it again when the Renderer connects.

use std::sync::mpsc::Sender;

use crate::library::sync::state::LibraryState;
use crate::player::waveform::PlaybackWaveform;
use crate::player::{PlaybackPosition, PlayerState, QueueState};
use crate::settings::Appearance;

/// What the Renderer receives on its channel.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum BackendMessage {
    Player(Box<PlayerState>),
    Queue(QueueState),
    Library(LibraryState),
    Waveform(Option<PlaybackWaveform>),
    Appearance(Appearance),
    /// The playing position. Sent once a second while a track plays, and after a seek or a start.
    Position(PlaybackPosition),
    /// The player could not play a track and skipped it by itself. `title` is the track's title,
    /// when it has one.
    TrackSkipped {
        title: Option<String>,
    },
}

/// Sends `message` to the Host. A Host that has gone away takes nothing, which is not an error.
pub(crate) fn send(messages: &Sender<BackendMessage>, message: BackendMessage) {
    let _ = messages.send(message);
}
