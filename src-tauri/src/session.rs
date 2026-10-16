//! The Host's side of the Backend's messages: a sink that only queues, and the one channel to the
//! Renderer that a dispatcher thread sends through.

use std::{
    collections::BTreeSet,
    sync::{
        Arc, Mutex,
        mpsc::{self, Receiver, Sender},
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
        if let Some(channel) = channel.as_ref()
            && let Err(error) = channel.send(message)
        {
            log::debug!("ipc.channel_send_skipped error={error}");
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
            let messages = batch_messages(
                batch,
                |topic| backend.state_message(topic),
                || backend.position_message(),
            );
            for message in messages {
                subscriber.send(message);
            }
        }
    });
}

/// The messages one batch sends, in order: its occurrences as they arrived, then each changed
/// state topic once with its latest value, then the position.
fn batch_messages(
    batch: Vec<Signal>,
    state: impl Fn(StateTopic) -> Option<BackendMessage>,
    position: impl Fn() -> Option<BackendMessage>,
) -> Vec<BackendMessage> {
    let mut messages = Vec::new();
    let mut topics = BTreeSet::new();
    let mut position_changed = false;
    for signal in batch {
        match signal {
            Signal::State(topic) => {
                topics.insert(topic);
            }
            Signal::Position => position_changed = true,
            Signal::Occurrence(occurrence) => {
                messages.push(BackendMessage::Occurrence(*occurrence));
            }
        }
    }
    messages.extend(topics.into_iter().filter_map(state));
    if position_changed {
        messages.extend(position());
    }
    messages
}

#[cfg(test)]
mod tests {
    use super::*;
    use backend::dto::PlaybackFailureCode;

    #[test]
    fn occurrences_are_sent_in_arrival_order_and_never_merged() {
        let skipped = |error| Occurrence::TrackSkipped { item: None, error };
        let first = skipped(PlaybackFailureCode::DecodeFailed);
        let second = skipped(PlaybackFailureCode::OutputStreamRuntimeFailed);
        let batch = vec![
            Signal::Occurrence(Box::new(first.clone())),
            Signal::State(StateTopic::Playback),
            Signal::Occurrence(Box::new(second.clone())),
            Signal::Occurrence(Box::new(first.clone())),
        ];

        let messages = batch_messages(batch, |_| None, || None);

        let sent: Vec<Occurrence> = messages
            .into_iter()
            .filter_map(|message| match message {
                BackendMessage::Occurrence(occurrence) => Some(occurrence),
                _ => None,
            })
            .collect();
        assert_eq!(sent, [first.clone(), second, first]);
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
