//! The Host's side of the Backend's messages: the one channel to the Renderer. A dispatcher thread
//! takes what the Backend sends in batches and keeps the newest value of each state, so a Renderer
//! that connects gets the current state before anything else. The Backend never waits on the
//! webview: its messages queue until the dispatcher sends them.

use parking_lot::Mutex;
use std::{
    sync::{Arc, mpsc::Receiver},
    thread,
};

use backend::messages::BackendMessage;
use tauri::ipc::Channel;

/// The newest message of each kind a connecting Renderer needs. A track skip is not kept: each
/// one is news when it arrives.
#[derive(Default)]
struct Latest {
    player: Option<BackendMessage>,
    queue: Option<BackendMessage>,
    library: Option<BackendMessage>,
    waveform: Option<BackendMessage>,
    appearance: Option<BackendMessage>,
    position: Option<BackendMessage>,
}

impl Latest {
    /// Keeps `message` as the newest of its kind.
    fn keep(&mut self, message: &BackendMessage) {
        let slot = match message {
            BackendMessage::Player(_) => &mut self.player,
            BackendMessage::Queue(_) => &mut self.queue,
            BackendMessage::Library(_) => &mut self.library,
            BackendMessage::Waveform(_) => &mut self.waveform,
            BackendMessage::Appearance(_) => &mut self.appearance,
            BackendMessage::Position(_) => &mut self.position,
            BackendMessage::TrackSkipped { .. } => return,
        };
        *slot = Some(message.clone());
    }

    /// The kept messages in the order a connect sends them: the states, then the position.
    fn messages(&self) -> impl Iterator<Item = &BackendMessage> {
        [
            &self.player,
            &self.queue,
            &self.library,
            &self.waveform,
            &self.appearance,
            &self.position,
        ]
        .into_iter()
        .flatten()
    }
}

/// The one channel to the Renderer and the latest messages. A new channel replaces the old one.
#[derive(Default)]
pub struct Delivery {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    channel: Option<Channel<BackendMessage>>,
    latest: Latest,
}

impl Delivery {
    /// Replaces the channel and sends the latest message of each kind on it, in one lock, so nothing
    /// sent meanwhile lands before them.
    pub fn connect(&self, channel: Channel<BackendMessage>) {
        let mut inner = self.inner.lock();
        for message in inner.latest.messages() {
            send(&channel, message.clone());
        }
        inner.channel = Some(channel);
    }

    /// Keeps the newest of each kind in the batch and sends the batch on the channel, in one lock.
    fn deliver(&self, batch: Vec<BackendMessage>) {
        let mut inner = self.inner.lock();
        let messages = batch_messages(batch, &mut inner.latest);
        if let Some(channel) = inner.channel.as_ref() {
            for message in messages {
                send(channel, message);
            }
        }
    }
}

/// Starts the thread that takes the Backend's messages in batches and delivers each batch.
pub(crate) fn start_dispatcher(delivery: Arc<Delivery>, messages: Receiver<BackendMessage>) {
    thread::Builder::new()
        .name("message-dispatcher".into())
        .spawn(move || {
            while let Ok(first) = messages.recv() {
                let mut batch = vec![first];
                batch.extend(messages.try_iter());
                delivery.deliver(batch);
            }
        })
        .expect("the OS starts a thread unless it is out of resources");
}

/// The messages one batch sends, in order: its track skips as they arrived, then the newest message
/// of each other kind the batch changed. Every message in the batch becomes the latest of its kind.
fn batch_messages(batch: Vec<BackendMessage>, latest: &mut Latest) -> Vec<BackendMessage> {
    let mut messages = Vec::new();
    let mut changed = Latest::default();
    for message in batch {
        latest.keep(&message);
        if let BackendMessage::TrackSkipped { .. } = message {
            messages.push(message);
        } else {
            changed.keep(&message);
        }
    }
    messages.extend(changed.messages().cloned());
    messages
}

/// Without a Renderer on the channel the message is dropped, which is not an error: the next
/// `app_connect` replaces the channel.
fn send(channel: &Channel<BackendMessage>, message: BackendMessage) {
    if let Err(error) = channel.send(message) {
        log::debug!("ipc.channel_send_skipped error={error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use backend::app::{Appearance, QueueState, RepeatMode};
    use tauri::ipc::InvokeResponseBody;

    fn skip(title: &str) -> BackendMessage {
        BackendMessage::TrackSkipped {
            title: Some(title.to_owned()),
        }
    }

    fn waveform() -> BackendMessage {
        BackendMessage::Waveform(None)
    }

    fn appearance(calm_motion: bool) -> BackendMessage {
        BackendMessage::Appearance(Appearance {
            calm_motion,
            ..Appearance::default()
        })
    }

    fn queue() -> BackendMessage {
        BackendMessage::Queue(QueueState::empty(RepeatMode::Off, false))
    }

    /// A channel that records the kind of every message it is sent, in order.
    fn recording_channel() -> (Channel<BackendMessage>, Arc<Mutex<Vec<String>>>) {
        let kinds = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&kinds);
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                let message: serde_json::Value =
                    serde_json::from_str(&json).expect("a message is JSON");
                sink.lock()
                    .push(message["kind"].as_str().unwrap_or_default().to_owned());
            }
            Ok(())
        });
        (channel, kinds)
    }

    #[test]
    fn a_batch_keeps_track_skips_in_order_and_the_newest_of_each_other_kind() {
        let mut latest = Latest::default();
        let batch = vec![
            skip("First"),
            waveform(),
            skip("Second"),
            appearance(true),
            skip("Third"),
            appearance(false),
        ];

        let sent = batch_messages(batch, &mut latest);

        assert_eq!(
            sent,
            [
                skip("First"),
                skip("Second"),
                skip("Third"),
                waveform(),
                appearance(false),
            ]
        );
    }

    #[test]
    fn connect_sends_the_latest_values_before_anything_else() {
        let delivery = Delivery::default();
        delivery.deliver(vec![appearance(true), queue(), skip("Gone")]);
        let (channel, kinds) = recording_channel();

        delivery.connect(channel);
        assert_eq!(*kinds.lock(), ["queue", "appearance"]);

        delivery.deliver(vec![appearance(false)]);
        assert_eq!(*kinds.lock(), ["queue", "appearance", "appearance"]);
    }

    #[test]
    fn a_second_connect_replaces_the_first_channel() {
        let delivery = Delivery::default();
        let (first, first_kinds) = recording_channel();
        let (second, second_kinds) = recording_channel();
        delivery.connect(first);
        delivery.deliver(vec![waveform()]);

        delivery.connect(second);
        delivery.deliver(vec![appearance(true)]);

        assert_eq!(*first_kinds.lock(), ["waveform"]);
        assert_eq!(*second_kinds.lock(), ["waveform", "appearance"]);
    }
}
