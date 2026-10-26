//! What the Backend tells the Host: a state topic changed, the playing position moved, or a track
//! was skipped. Every state value lives in `StateStore`, which sends a `Notification` for the topic
//! that changed. The Host reads the latest value when it sends, so several changes can become one
//! message.

use std::sync::mpsc::{self, Receiver, Sender};

use log::debug;

use crate::library::models::ScanState;
use crate::player::waveform::PlaybackWaveform;
use crate::player::{PlaybackPosition, PlayerState, QueueState};
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

    /// Replaces the value and adds one to the version. An equal value changes nothing. Returns
    /// whether the value changed.
    pub fn set(&mut self, value: T) -> bool
    where
        T: PartialEq,
    {
        if self.value == value {
            return false;
        }
        self.value = value;
        self.version += 1;
        true
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
    Playback(Box<PlayerState>),
    Queue(QueueState),
    Scan(ScanState),
    Waveform(Option<PlaybackWaveform>),
    Appearance(Appearance),
}

/// What the Backend reports to the Host. Each one is sent on the thread that produced it.
#[derive(Debug, Clone, PartialEq)]
pub enum Notification {
    /// A state topic has a new value. The Host reads the latest value when it sends.
    StateChanged(StateTopic),
    /// The playing position moved.
    PositionChanged,
    /// The player skipped a track it could not play.
    TrackSkipped(Option<String>),
}

/// The sending end of the channel that carries `Notification`s to the Host. Every clone sends
/// into the same channel. A send never waits.
#[derive(Debug, Clone)]
pub struct Notifier {
    sender: Sender<Notification>,
}

impl Notifier {
    pub fn channel() -> (Self, Receiver<Notification>) {
        let (sender, receiver) = mpsc::channel();
        (Self { sender }, receiver)
    }

    pub fn send(&self, notification: Notification) {
        if let Err(cause) = self.sender.send(notification) {
            debug!("backend.notification.send_failed cause={cause}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_value_starts_at_version_zero() {
        let topic = Versioned::new(10);
        assert_eq!((topic.version, topic.value), (0, 10));
    }

    #[test]
    fn setting_a_different_value_adds_one_to_the_version() {
        let mut topic = Versioned::new(10);
        assert!(topic.set(11));
        assert_eq!((topic.version, topic.value), (1, 11));
    }

    #[test]
    fn setting_an_equal_value_changes_nothing() {
        let mut topic = Versioned::new(10);
        assert!(!topic.set(10));
        assert_eq!((topic.version, topic.value), (0, 10));
    }
}
