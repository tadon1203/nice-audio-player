//! What the Backend tells the host: a state topic changed, the playing position moved, or a track
//! was skipped. Every published state value lives in `StateHub`, which tells the listener which
//! topic changed. The host reads the latest value when it sends, so several changes can become
//! one message.

use std::sync::Arc;

use crate::audio::playback::{PlaybackPosition, PlaybackState, QueueState};
use crate::audio::waveform::PlaybackWaveform;
use crate::library::models::ScanState;
use crate::settings::Appearance;

/// A value with the version of its topic. Versions only grow, per topic.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
pub struct Versioned<T> {
    pub version: u64,
    pub value: T,
}

impl<T> Versioned<T> {
    /// A value that has not changed yet: version 0.
    pub fn new(value: T) -> Self {
        Self { version: 0, value }
    }
}

/// The Backend state topics. Declaration order is the order they are sent in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum StateTopic {
    Playback,
    Queue,
    Scan,
    Waveform,
    Appearance,
}

impl StateTopic {
    /// Every topic, in declaration order.
    pub const ALL: [StateTopic; 5] = [
        StateTopic::Playback,
        StateTopic::Queue,
        StateTopic::Scan,
        StateTopic::Waveform,
        StateTopic::Appearance,
    ];
}

/// What the Renderer receives on its channel.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackendMessage {
    /// The fields of the message merge into one object: { kind: "state", version, topic, value }.
    State(Box<StateMessage>),
    /// { kind: "position", playbackId, positionMs, seekCount }
    Position(PlaybackPosition),
    /// The player could not play a track and skipped it by itself. `title` is the track's title,
    /// when it has one.
    TrackSkipped { title: Option<String> },
}

/// One state topic's value with its version. A tuple variant around this struct is what specta
/// types as the merged object; a struct variant with a flattened field is not.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StateMessage {
    pub version: u64,
    #[serde(flatten)]
    pub state: StateValue,
}

/// The whole value of one state topic.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(tag = "topic", content = "value", rename_all = "camelCase")]
pub enum StateValue {
    Playback(Box<PlaybackState>),
    Queue(QueueState),
    Scan(ScanState),
    Waveform(Option<PlaybackWaveform>),
    Appearance(Appearance),
}

/// Receives messages on whichever thread produced them, so it must return quickly.
pub trait MessageListener: Send + Sync {
    /// A state topic has a new value. The host reads the latest value when it sends.
    fn state_changed(&self, topic: StateTopic);
    /// The playing position moved.
    fn position_changed(&self);
    /// The player skipped a track it could not play.
    fn track_skipped(&self, title: Option<String>);
}

pub type SharedMessageListener = Arc<dyn MessageListener>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_value_starts_at_version_zero() {
        let topic = Versioned::new(10);
        assert_eq!((topic.version, topic.value), (0, 10));
    }
}
