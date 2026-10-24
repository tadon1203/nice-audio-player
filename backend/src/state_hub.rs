//! The Backend's published state: one value per topic, each with its revision. Services publish
//! their values here and read their own values back; the host reads the latest messages here.

use parking_lot::Mutex;

use crate::audio::playback::{PlaybackState, QueueState, initial_playback};
use crate::audio::waveform::PlaybackWaveform;
use crate::library::models::ScanState;
use crate::messages::{
    BackendMessage, Revisioned, SharedMessageListener, StateMessage, StateTopic, StateValue,
};
use crate::settings::{Appearance, Settings};

/// The current value of every state topic, each with its revision.
#[derive(Clone)]
pub struct Published {
    pub playback: Revisioned<PlaybackState>,
    pub queue: Revisioned<QueueState>,
    pub scan: Revisioned<ScanState>,
    pub waveform: Revisioned<Option<PlaybackWaveform>>,
    pub appearance: Revisioned<Appearance>,
}

impl Published {
    /// The values before any service has published one: the saved playback and appearance, an
    /// idle scan, and no waveform.
    pub(crate) fn initial(settings: &Settings) -> Self {
        let (playback, queue) = initial_playback(&settings.playback);
        Self {
            playback,
            queue,
            scan: Revisioned::new(ScanState::idle()),
            waveform: Revisioned::new(None),
            appearance: Revisioned::new(settings.appearance.clone()),
        }
    }

    fn revision(&self, topic: StateTopic) -> u64 {
        match topic {
            StateTopic::Playback => self.playback.revision,
            StateTopic::Queue => self.queue.revision,
            StateTopic::Scan => self.scan.revision,
            StateTopic::Waveform => self.waveform.revision,
            StateTopic::Appearance => self.appearance.revision,
        }
    }

    fn message(&self, topic: StateTopic) -> BackendMessage {
        let revision = self.revision(topic);
        let value = match topic {
            StateTopic::Playback => StateValue::Playback(Box::new(self.playback.value.clone())),
            StateTopic::Queue => StateValue::Queue(self.queue.value.clone()),
            StateTopic::Scan => StateValue::Scan(self.scan.value.clone()),
            StateTopic::Waveform => StateValue::Waveform(self.waveform.value.clone()),
            StateTopic::Appearance => StateValue::Appearance(self.appearance.value.clone()),
        };
        BackendMessage::State(Box::new(StateMessage {
            revision,
            state: value,
        }))
    }
}

pub struct StateHub {
    published: Mutex<Published>,
    listener: SharedMessageListener,
}

impl StateHub {
    pub fn new(initial: Published, listener: SharedMessageListener) -> Self {
        Self {
            published: Mutex::new(initial),
            listener,
        }
    }

    /// Stores the value, increments that topic's revision, and tells the listener the topic
    /// changed. Returns the topic's revision after the call. A value equal to the held one does
    /// nothing.
    pub fn publish(&self, value: StateValue) -> u64 {
        let (topic, revision, changed) = {
            let mut published = self.published.lock();
            let (topic, changed) = match value {
                StateValue::Playback(value) => {
                    (StateTopic::Playback, store(&mut published.playback, *value))
                }
                StateValue::Queue(value) => (StateTopic::Queue, store(&mut published.queue, value)),
                StateValue::Scan(value) => (StateTopic::Scan, store(&mut published.scan, value)),
                StateValue::Waveform(value) => {
                    (StateTopic::Waveform, store(&mut published.waveform, value))
                }
                StateValue::Appearance(value) => (
                    StateTopic::Appearance,
                    store(&mut published.appearance, value),
                ),
            };
            (topic, published.revision(topic), changed)
        };
        if changed {
            self.listener.state_changed(topic);
        }
        revision
    }

    /// Reads the published values under the lock. Keep `f` short.
    pub fn read<R>(&self, f: impl FnOnce(&Published) -> R) -> R {
        f(&self.published.lock())
    }

    /// The message that carries the current value of `topic`.
    pub fn message(&self, topic: StateTopic) -> BackendMessage {
        self.published.lock().message(topic)
    }

    /// Every topic as a message, for the connect command.
    pub fn messages(&self) -> Vec<BackendMessage> {
        let published = self.published.lock();
        StateTopic::ALL
            .into_iter()
            .map(|topic| published.message(topic))
            .collect()
    }
}

/// Replaces the slot's value and counts the change. Returns whether the value changed.
fn store<T: PartialEq>(slot: &mut Revisioned<T>, value: T) -> bool {
    if slot.value == value {
        return false;
    }
    slot.value = value;
    slot.revision = slot.revision.saturating_add(1);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::RecordingMessageListener;
    use std::sync::Arc;

    fn hub() -> (StateHub, Arc<RecordingMessageListener>) {
        let (recorder, listener) = RecordingMessageListener::shared();
        let published = Published::initial(&Settings::default());
        (StateHub::new(published, listener), recorder)
    }

    #[test]
    fn publishing_a_changed_value_bumps_only_its_topic_and_notifies_once() {
        let (hub, recorder) = hub();
        let revision = hub.publish(StateValue::Waveform(None));
        assert_eq!(revision, 0, "an equal value is not a change");

        let revision = hub.publish(StateValue::Appearance(Appearance {
            calm_motion: !Appearance::default().calm_motion,
            ..Appearance::default()
        }));
        assert_eq!(revision, 1);
        assert_eq!(recorder.state_topics(), [StateTopic::Appearance]);
        assert!(matches!(
            hub.message(StateTopic::Waveform),
            BackendMessage::State(message) if message.revision == 0
        ));
    }

    #[test]
    fn publishing_an_equal_value_does_nothing() {
        let (hub, recorder) = hub();
        let revision = hub.publish(StateValue::Appearance(Appearance::default()));
        assert_eq!(revision, 0);
        assert_eq!(recorder.state_topics(), []);
    }

    #[test]
    fn messages_carries_every_topic() {
        let (hub, _) = hub();
        assert_eq!(hub.messages().len(), 5);
    }
}
