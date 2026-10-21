//! How backend services tell the host that something changed, and what the host sends.
//!
//! Services hold a `SharedMessageSink`. They report a state topic, a position, or an occurrence.
//! They do not know about Tauri or about each other.
//!
//! A state topic carries its whole value. The host reads the value when it sends, so several
//! changes can become one message. An occurrence carries its value and is never merged. See ADR
//! 0008.

use std::sync::Arc;

use crate::audio::playback::{
    PlaybackFailureCode, PlaybackItem, PlaybackPosition, PlaybackQueueSnapshot, PlaybackSnapshot,
};
use crate::audio::waveform::PlaybackWaveform;
use crate::library::models::LibraryScanSnapshot;
use crate::settings::Appearance;

/// A value with the revision of its topic. Revisions only grow, per topic.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
pub struct Versioned<T> {
    pub revision: u64,
    pub value: T,
}

impl<T> Versioned<T> {
    /// A value that has not changed yet: revision 0.
    pub fn new(value: T) -> Self {
        Self { revision: 0, value }
    }

    /// Applies a change and counts it. Call it only when the value changes.
    pub fn update(&mut self, change: impl FnOnce(&mut T)) {
        change(&mut self.value);
        self.revision = self.revision.saturating_add(1);
    }
}

/// The Backend state topics. Declaration order is the order they are sent in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum StateTopic {
    Playback,
    Queue,
    LibraryScan,
    Waveform,
    Appearance,
}

/// What the Renderer receives on its channel.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackendMessage {
    /// The fields of the message merge into one object: { kind: "state", revision, topic, value }.
    State(Box<StateMessage>),
    /// { kind: "occurrence", type: "...", ... }
    Occurrence(Box<Occurrence>),
    /// { kind: "position", playbackId, positionMs, seekRevision }
    Position(PlaybackPosition),
}

/// One state topic's value with its revision.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StateMessage {
    pub revision: u64,
    #[serde(flatten)]
    pub state: StateValue,
}

/// The whole value of one state topic.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "topic", content = "value", rename_all = "camelCase")]
pub enum StateValue {
    Playback(Box<PlaybackSnapshot>),
    Queue(PlaybackQueueSnapshot),
    LibraryScan(LibraryScanSnapshot),
    Waveform(Option<PlaybackWaveform>),
    Appearance(Appearance),
}

/// A fact that happened, with its value.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Occurrence {
    /// The player could not play `item` and skipped it by itself.
    TrackSkipped {
        item: Option<PlaybackItem>,
        error: PlaybackFailureCode,
    },
}

/// The current value of every Backend state topic. `connect` returns it.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct InitialState {
    pub playback: Versioned<PlaybackSnapshot>,
    pub queue: Versioned<PlaybackQueueSnapshot>,
    pub library_scan: Versioned<LibraryScanSnapshot>,
    pub waveform: Versioned<Option<PlaybackWaveform>>,
    pub appearance: Versioned<Appearance>,
}

/// Receives messages on whichever thread produced them, so it must return quickly.
pub trait MessageSink: Send + Sync {
    /// A state topic has a new value. The host reads the latest value when it sends.
    fn state_changed(&self, topic: StateTopic);
    /// The playing position moved.
    fn position_changed(&self);
    /// A fact, with its value. The sink keeps every one, in order.
    fn occurred(&self, occurrence: Occurrence);
}

pub type SharedMessageSink = Arc<dyn MessageSink>;

/// Drops every message, for tests and headless use.
#[derive(Debug)]
pub struct NullMessageSink;

impl MessageSink for NullMessageSink {
    fn state_changed(&self, _topic: StateTopic) {}
    fn position_changed(&self) {}
    fn occurred(&self, _occurrence: Occurrence) {}
}

pub fn null_message_sink() -> SharedMessageSink {
    Arc::new(NullMessageSink)
}

/// A sink bound to one state topic, for code that only ever announces "it changed".
#[derive(Clone)]
pub struct Notifier {
    sink: SharedMessageSink,
    topic: StateTopic,
}

impl std::fmt::Debug for Notifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The sink is a trait object, so only the topic can be shown.
        f.debug_struct("Notifier")
            .field("topic", &self.topic)
            .finish_non_exhaustive()
    }
}

impl Notifier {
    pub fn new(sink: SharedMessageSink, topic: StateTopic) -> Self {
        Self { sink, topic }
    }

    pub fn notify(&self) {
        self.sink.state_changed(self.topic);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_update_applies_the_change_and_counts_it() {
        let mut topic = Versioned::new(10);
        assert_eq!(topic.revision, 0);
        topic.update(|value| *value += 5);
        topic.update(|value| *value += 1);
        assert_eq!((topic.revision, topic.value), (2, 16));
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use crate::sync;
    use std::sync::Mutex;

    /// One call to a sink, in the order it was made.
    #[derive(Debug, Clone, PartialEq)]
    pub(crate) enum Sent {
        State(StateTopic),
        Position,
        Occurrence(Box<Occurrence>),
    }

    /// Remembers every call, in order.
    #[derive(Default)]
    pub(crate) struct RecordingMessageSink {
        sent: Mutex<Vec<Sent>>,
    }

    impl RecordingMessageSink {
        pub(crate) fn shared() -> (Arc<Self>, SharedMessageSink) {
            let sink = Arc::new(Self::default());
            (Arc::clone(&sink), sink)
        }

        pub(crate) fn sent(&self) -> Vec<Sent> {
            sync::lock(&self.sent).clone()
        }
    }

    impl MessageSink for RecordingMessageSink {
        fn state_changed(&self, topic: StateTopic) {
            sync::lock(&self.sent).push(Sent::State(topic));
        }

        fn position_changed(&self) {
            sync::lock(&self.sent).push(Sent::Position);
        }

        fn occurred(&self, occurrence: Occurrence) {
            sync::lock(&self.sent).push(Sent::Occurrence(Box::new(occurrence)));
        }
    }
}
