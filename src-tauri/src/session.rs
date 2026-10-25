//! The Host's side of the Backend's messages: the one channel to the Renderer that a dispatcher
//! thread sends through. The Backend only queues its notifications, so a service never waits on
//! the webview.

use parking_lot::Mutex;
use std::{
    collections::BTreeSet,
    sync::{Arc, mpsc::Receiver},
    thread,
};

use backend::{
    app::BackendApp,
    messages::{BackendMessage, Notification, StateTopic},
};
use tauri::ipc::Channel;

/// The one channel to the Renderer. A new channel replaces the old one.
#[derive(Default)]
pub struct Subscriber {
    channel: Mutex<Option<Channel<BackendMessage>>>,
}

impl Subscriber {
    pub fn replace(&self, channel: Channel<BackendMessage>) {
        *self.channel.lock() = Some(channel);
    }

    /// Without a Renderer on the channel the message is dropped, which is not an error: the next
    /// `app_connect` replaces the channel.
    fn send(&self, message: BackendMessage) {
        let channel = self.channel.lock();
        if let Some(channel) = channel.as_ref()
            && let Err(error) = channel.send(message)
        {
            log::debug!("ipc.channel_send_skipped error={error}");
        }
    }

    #[cfg(test)]
    fn channel_id(&self) -> Option<u32> {
        self.channel.lock().as_ref().map(Channel::id)
    }
}

/// Delivers queued messages in three steps. First the track skips, in arrival order. Then each
/// changed state topic once, with its latest value. Then the position.
pub(crate) fn start_dispatcher(
    backend: Arc<BackendApp>,
    subscriber: Arc<Subscriber>,
    notifications: Receiver<Notification>,
) {
    thread::Builder::new()
        .name("message-dispatcher".into())
        .spawn(move || {
            while let Ok(first) = notifications.recv() {
                let mut batch = vec![first];
                batch.extend(notifications.try_iter());
                let messages = batch_messages(
                    batch,
                    |topic| backend.message(topic),
                    || backend.position_message(),
                );
                for message in messages {
                    subscriber.send(message);
                }
            }
        })
        .expect("the OS starts a thread unless it is out of resources");
}

/// The messages one batch sends, in order: its track skips as they arrived, then each changed
/// state topic once with its latest value, then the position.
fn batch_messages(
    batch: Vec<Notification>,
    state: impl Fn(StateTopic) -> BackendMessage,
    position: impl Fn() -> Option<BackendMessage>,
) -> Vec<BackendMessage> {
    let mut messages = Vec::new();
    let mut topics = BTreeSet::new();
    let mut position_changed = false;
    for notification in batch {
        match notification {
            Notification::StateChanged(topic) => {
                topics.insert(topic);
            }
            Notification::PositionChanged => position_changed = true,
            Notification::TrackSkipped(title) => {
                messages.push(BackendMessage::TrackSkipped { title });
            }
        }
    }
    messages.extend(topics.into_iter().map(state));
    if position_changed {
        messages.extend(position());
    }
    messages
}

#[cfg(test)]
mod tests {
    use super::*;
    use backend::messages::{StateMessage, StateValue};

    #[test]
    fn track_skips_are_sent_in_arrival_order_and_never_merged() {
        let first = Some("First".to_owned());
        let second = Some("Second".to_owned());
        let batch = vec![
            Notification::TrackSkipped(first.clone()),
            Notification::StateChanged(StateTopic::Playback),
            Notification::TrackSkipped(second.clone()),
            Notification::TrackSkipped(first.clone()),
        ];

        let state = |_| {
            BackendMessage::State(Box::new(StateMessage {
                version: 0,
                state: StateValue::Waveform(None),
            }))
        };

        let messages = batch_messages(batch, state, || None);

        let sent: Vec<Option<String>> = messages
            .into_iter()
            .filter_map(|message| match message {
                BackendMessage::TrackSkipped { title } => Some(title),
                _ => None,
            })
            .collect();
        assert_eq!(sent, [first.clone(), second, first]);
    }

    #[test]
    fn a_topic_changed_twice_in_one_batch_is_sent_once() {
        let batch = vec![
            Notification::StateChanged(StateTopic::Queue),
            Notification::StateChanged(StateTopic::Playback),
            Notification::StateChanged(StateTopic::Queue),
        ];
        let state = |_| {
            BackendMessage::State(Box::new(StateMessage {
                version: 0,
                state: StateValue::Waveform(None),
            }))
        };

        let messages = batch_messages(batch, state, || None);

        assert_eq!(messages.len(), 2);
    }

    #[test]
    fn a_second_replace_replaces_the_first_channel() {
        let subscriber = Subscriber::default();
        let first = Channel::new(|_| Ok(()));
        let second = Channel::new(|_| Ok(()));
        let second_id = second.id();
        subscriber.replace(first);
        assert_ne!(subscriber.channel_id(), Some(second_id));

        subscriber.replace(second);
        assert_eq!(subscriber.channel_id(), Some(second_id));
    }
}
