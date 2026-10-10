//! The Host's side of the Backend's messages: a sink that only queues, and the one channel to the
//! Renderer that a dispatcher thread sends through.

use std::{
    collections::BTreeSet,
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc, Mutex,
    },
    thread,
};

use backend::{
    app::BackendApp,
    messages::{BackendMessage, MessageSink, Occurrence, StateTopic},
};
use tauri::ipc::Channel;

/// What a service reported, waiting for the dispatcher. A state topic is only named here; its
/// value is read when the dispatcher sends it.
pub(crate) enum Signal {
    State(StateTopic),
    Position,
    Occurrence(Box<Occurrence>),
}

/// The Backend's message sink. It only queues; `start_dispatcher` delivers, so a service never
/// waits on the webview.
pub struct HostMessageSink {
    sender: Sender<Signal>,
}

impl MessageSink for HostMessageSink {
    fn state_changed(&self, topic: StateTopic) {
        let _ = self.sender.send(Signal::State(topic));
    }

    fn position_changed(&self) {
        let _ = self.sender.send(Signal::Position);
    }

    fn occurred(&self, occurrence: Occurrence) {
        let _ = self.sender.send(Signal::Occurrence(Box::new(occurrence)));
    }
}

pub fn message_channel() -> (Arc<HostMessageSink>, Receiver<Signal>) {
    let (sender, receiver) = mpsc::channel();
    (Arc::new(HostMessageSink { sender }), receiver)
}

/// The one channel to the Renderer. A new channel replaces the old one.
#[derive(Default)]
pub struct Subscriber {
    channel: Mutex<Option<Channel<BackendMessage>>>,
}

impl Subscriber {
    pub fn replace(&self, channel: Channel<BackendMessage>) {
        *self.channel.lock().expect("subscriber lock") = Some(channel);
    }

    /// Without a Renderer on the channel the message is dropped, which is not an error: the next
    /// `connect` replaces the channel.
    fn send(&self, message: BackendMessage) {
        let channel = self.channel.lock().expect("subscriber lock");
        if let Some(channel) = channel.as_ref() {
            if let Err(error) = channel.send(message) {
                log::debug!("ipc.channel_send_skipped error={error}");
            }
        }
    }

    #[cfg(test)]
    fn channel_id(&self) -> Option<u32> {
        self.channel
            .lock()
            .expect("subscriber lock")
            .as_ref()
            .map(Channel::id)
    }
}

/// Delivers queued messages in three steps. First the occurrences, in arrival order. Then each
/// changed state topic once, with its latest value. Then the position.
pub fn start_dispatcher(
    backend: Arc<BackendApp>,
    subscriber: Arc<Subscriber>,
    signals: Receiver<Signal>,
) {
    thread::spawn(move || {
        while let Ok(first) = signals.recv() {
            let mut batch = vec![first];
            batch.extend(signals.try_iter());
            let mut topics = BTreeSet::new();
            let mut position = false;
            for signal in batch {
                match signal {
                    Signal::State(topic) => {
                        topics.insert(topic);
                    }
                    Signal::Position => position = true,
                    Signal::Occurrence(occurrence) => {
                        subscriber.send(BackendMessage::Occurrence(*occurrence));
                    }
                }
            }
            for topic in topics {
                if let Some(message) = backend.state_message(topic) {
                    subscriber.send(message);
                }
            }
            if position {
                if let Some(message) = backend.position_message() {
                    subscriber.send(message);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
