//! The Backend's states: one value per topic, each with its version. Services set their values
//! here and read them back; the Host reads the latest messages here.

use parking_lot::Mutex;

use crate::library::LibraryStatus;
use crate::library::models::LibraryState;
use crate::messages::{
    BackendMessage, Notification, Notifier, StateMessage, StateTopic, StateValue, Versioned,
};
use crate::player::waveform::PlaybackWaveform;
use crate::player::{PlayerState, QueueState};
use crate::settings::{Appearance, SettingsFile};

/// The current value of every state topic, each with its version.
#[derive(Clone)]
struct States {
    playback: Versioned<PlayerState>,
    queue: Versioned<QueueState>,
    library: Versioned<LibraryState>,
    waveform: Versioned<Option<PlaybackWaveform>>,
    appearance: Versioned<Appearance>,
}

impl States {
    /// The values before any service has set one: the saved playback and appearance, an empty
    /// Library, and no waveform.
    fn new(settings: &SettingsFile) -> Self {
        let preferences = &settings.player;
        Self {
            playback: Versioned::new(PlayerState::stopped(preferences)),
            queue: Versioned::new(QueueState::empty(
                preferences.repeat_mode,
                preferences.shuffle_enabled,
            )),
            library: Versioned::new(LibraryState::empty(LibraryStatus::Ready)),
            waveform: Versioned::new(None),
            appearance: Versioned::new(settings.appearance.clone()),
        }
    }

    fn message(&self, topic: StateTopic) -> BackendMessage {
        let (version, state) = match topic {
            StateTopic::Playback => (
                self.playback.version,
                StateValue::Playback(Box::new(self.playback.value.clone())),
            ),
            StateTopic::Queue => (
                self.queue.version,
                StateValue::Queue(self.queue.value.clone()),
            ),
            StateTopic::Library => (
                self.library.version,
                StateValue::Library(self.library.value.clone()),
            ),
            StateTopic::Waveform => (
                self.waveform.version,
                StateValue::Waveform(self.waveform.value.clone()),
            ),
            StateTopic::Appearance => (
                self.appearance.version,
                StateValue::Appearance(self.appearance.value.clone()),
            ),
        };
        BackendMessage::State(Box::new(StateMessage { version, state }))
    }
}

pub struct StateStore {
    states: Mutex<States>,
    notifier: Notifier,
}

impl StateStore {
    pub fn new(settings: &SettingsFile, notifier: Notifier) -> Self {
        Self {
            states: Mutex::new(States::new(settings)),
            notifier,
        }
    }

    /// Tells the Host of something that is not a state value: a skipped track, a new position.
    pub(crate) fn notify(&self, notification: Notification) {
        self.notifier.send(notification);
    }

    pub fn playback(&self) -> Versioned<PlayerState> {
        self.states.lock().playback.clone()
    }

    pub fn queue(&self) -> Versioned<QueueState> {
        self.states.lock().queue.clone()
    }

    #[cfg(test)]
    pub fn library(&self) -> Versioned<LibraryState> {
        self.states.lock().library.clone()
    }

    #[cfg(test)]
    pub fn waveform(&self) -> Versioned<Option<PlaybackWaveform>> {
        self.states.lock().waveform.clone()
    }

    /// Sets the value, adds one to that topic's version, and notifies that the topic changed.
    /// Returns the topic's version after the call. A value equal to the held one does nothing.
    pub fn set_playback(&self, value: PlayerState) -> u64 {
        self.set(StateTopic::Playback, |states| &mut states.playback, value)
    }

    /// Like `set_playback`, for the queue.
    pub fn set_queue(&self, value: QueueState) -> u64 {
        self.set(StateTopic::Queue, |states| &mut states.queue, value)
    }

    /// Like `set_playback`, for the Library state.
    pub fn set_library(&self, value: LibraryState) -> u64 {
        self.set(StateTopic::Library, |states| &mut states.library, value)
    }

    /// Like `set_playback`, for the Waveform.
    pub fn set_waveform(&self, value: Option<PlaybackWaveform>) -> u64 {
        self.set(StateTopic::Waveform, |states| &mut states.waveform, value)
    }

    /// Like `set_playback`, for the Appearance.
    pub fn set_appearance(&self, value: Appearance) -> u64 {
        self.set(
            StateTopic::Appearance,
            |states| &mut states.appearance,
            value,
        )
    }

    /// The message that carries the current value of `topic`.
    pub fn message(&self, topic: StateTopic) -> BackendMessage {
        self.states.lock().message(topic)
    }

    /// Every topic as a message, for the connect command.
    pub fn messages(&self) -> Vec<BackendMessage> {
        let states = self.states.lock();
        StateTopic::ALL
            .into_iter()
            .map(|topic| states.message(topic))
            .collect()
    }

    fn set<T: PartialEq>(
        &self,
        topic: StateTopic,
        slot: impl FnOnce(&mut States) -> &mut Versioned<T>,
        value: T,
    ) -> u64 {
        let (version, changed) = {
            let mut states = self.states.lock();
            let slot = slot(&mut states);
            let changed = slot.set(value);
            (slot.version, changed)
        };
        if changed {
            self.notifier.send(Notification::StateChanged(topic));
        }
        version
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::NotificationLog;
    use std::sync::Arc;

    fn state_store() -> (StateStore, Arc<NotificationLog>) {
        let (log, notifier) = NotificationLog::shared();
        (StateStore::new(&SettingsFile::default(), notifier), log)
    }

    #[test]
    fn setting_a_changed_value_adds_one_to_only_its_topic_and_notifies_once() {
        let (state_store, log) = state_store();
        let version = state_store.set_waveform(None);
        assert_eq!(version, 0, "an equal value is not a change");

        let version = state_store.set_appearance(Appearance {
            calm_motion: !Appearance::default().calm_motion,
            ..Appearance::default()
        });
        assert_eq!(version, 1);
        assert_eq!(log.state_topics(), [StateTopic::Appearance]);
        assert!(matches!(
            state_store.message(StateTopic::Waveform),
            BackendMessage::State(message) if message.version == 0
        ));
    }

    #[test]
    fn setting_an_equal_value_does_nothing() {
        let (state_store, log) = state_store();
        let version = state_store.set_appearance(Appearance::default());
        assert_eq!(version, 0);
        assert_eq!(log.state_topics(), []);
    }

    #[test]
    fn messages_carries_every_topic() {
        let (state_store, _) = state_store();
        assert_eq!(state_store.messages().len(), StateTopic::ALL.len());
    }
}
