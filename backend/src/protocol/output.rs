use super::{write_message, Message};
use std::io::{self, Write};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

pub struct ProtocolOutput {
    sender: Sender<Message>,
    receiver: Receiver<Message>,
}

impl ProtocolOutput {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        Self { sender, receiver }
    }

    pub fn sender(&self) -> Sender<Message> {
        self.sender.clone()
    }

    pub fn send(&self, message: Message) -> bool {
        self.sender.send(message).is_ok()
    }

    pub fn write_until(
        &self,
        writer: &mut impl Write,
        finished: impl Fn() -> bool,
    ) -> io::Result<()> {
        loop {
            match self.receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(message) => write_message(writer, &message)?,
                Err(mpsc::RecvTimeoutError::Timeout) if finished() => return Ok(()),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            }
        }
    }
}

impl Default for ProtocolOutput {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Response;

    #[test]
    fn serializes_all_messages_through_one_writer() {
        let output = ProtocolOutput::new();
        assert!(output.send(Message::Ready { event: "ready" }));
        assert!(output.send(Message::Response(Response {
            id: 3,
            result: Some(serde_json::json!({ "ok": true })),
            error: None,
        })));

        let mut bytes = Vec::new();
        output
            .write_until(&mut bytes, || true)
            .expect("messages should be serialized");

        let text = String::from_utf8(bytes).expect("protocol output is utf8");
        assert!(text.contains("\"event\":\"ready\""));
        assert!(text.contains("\"id\":3"));
    }

    #[test]
    fn keeps_concurrent_events_and_responses_as_complete_json_lines() {
        let output = ProtocolOutput::new();
        let event_sender = output.sender();
        let response_sender = output.sender();
        let event_thread = std::thread::spawn(move || {
            for _ in 0..16 {
                assert!(event_sender
                    .send(Message::Event(crate::protocol::event::BackendEvent::Ready))
                    .is_ok());
            }
        });
        let response_thread = std::thread::spawn(move || {
            for id in 0..16 {
                assert!(response_sender
                    .send(Message::Response(Response {
                        id,
                        result: Some(serde_json::json!({ "ok": true })),
                        error: None,
                    }))
                    .is_ok());
            }
        });
        event_thread.join().expect("event sender should finish");
        response_thread
            .join()
            .expect("response sender should finish");

        let mut bytes = Vec::new();
        output
            .write_until(&mut bytes, || true)
            .expect("output should flush");
        let lines: Vec<_> = String::from_utf8(bytes)
            .expect("protocol output is utf8")
            .lines()
            .map(|line| {
                serde_json::from_str::<serde_json::Value>(line).expect("complete JSON line")
            })
            .collect();
        assert_eq!(lines.len(), 32);
    }
}
