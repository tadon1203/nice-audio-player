//! The Host's side of the Backend's messages: a listener that only queues, and the one channel to
//! the Renderer that a dispatcher thread sends through.

use parking_lot::Mutex;
use std::{
    collections::BTreeSet,
    sync::{
        Arc,
        mpsc::{self, Receiver, Sender},
    },
    thread,
};

use backend::{
    app::BackendApp,
    messages::{BackendMessage, MessageListener, StateTopic},
};
use tauri::ipc::Channel;

/// What the Backend reported, waiting for the dispatcher. A state topic is only named here; its
/// value is read when the dispatcher sends it.
pub(crate) enum Pending {
    StateChanged(StateTopic),
    Position,
    TrackSkipped(Option<String>),
}

/// The Backend's listener. It only queues; `start_dispatcher` delivers, so a service never waits
/// on the webview.
pub(crate) struct HostMessageListener {
    sender: Sender<Pending>,
}

impl HostMessageListener {
    fn send(&self, pending: Pending) {
        if let Err(cause) = self.sender.send(pending) {
            log::debug!("host.session.send_failed cause={cause}");
        }
    }
}

impl MessageListener for HostMessageListener {
    fn state_changed(&self, topic: StateTopic) {
        self.send(Pending::StateChanged(topic));
    }

    fn position_changed(&self) {
        self.send(Pending::Position);
    }

    fn track_skipped(&self, title: Option<String>) {
        self.send(Pending::TrackSkipped(title));
    }
}

pub(crate) fn message_channel() -> (Arc<HostMessageListener>, Receiver<Pending>) {
    let (sender, receiver) = mpsc::channel();
    (Arc::new(HostMessageListener { sender }), receiver)
}

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
    pending: Receiver<Pending>,
) {
    thread::Builder::new()
        .name("message-dispatcher".into())
        .spawn(move || {
            while let Ok(first) = pending.recv() {
                let mut batch = vec![first];
                batch.extend(pending.try_iter());
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
    batch: Vec<Pending>,
    state: impl Fn(StateTopic) -> BackendMessage,
    position: impl Fn() -> Option<BackendMessage>,
) -> Vec<BackendMessage> {
    let mut messages = Vec::new();
    let mut topics = BTreeSet::new();
    let mut position_changed = false;
    for pending in batch {
        match pending {
            Pending::StateChanged(topic) => {
                topics.insert(topic);
            }
            Pending::Position => position_changed = true,
            Pending::TrackSkipped(title) => {
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
            Pending::TrackSkipped(first.clone()),
            Pending::StateChanged(StateTopic::Playback),
            Pending::TrackSkipped(second.clone()),
            Pending::TrackSkipped(first.clone()),
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
            Pending::StateChanged(StateTopic::Queue),
            Pending::StateChanged(StateTopic::Playback),
            Pending::StateChanged(StateTopic::Queue),
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
