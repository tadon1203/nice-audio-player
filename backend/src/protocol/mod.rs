use serde::Serialize;
use std::io::{self, BufRead, Write};

pub mod event;
pub mod request;
pub mod response;
pub use response::{ProtocolError, Response};

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum BackendWireMessage {
    Response(response::BackendWireResponse),
    Event(event::BackendEvent),
}

pub type Message = BackendWireMessage;

pub fn write_message<T: Serialize>(writer: &mut impl Write, message: &T) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, message)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

pub fn read_requests(reader: impl BufRead) -> impl Iterator<Item = io::Result<request::Envelope>> {
    reader.lines().map(|line| {
        let line = line?;
        let wire: request::Envelope = serde_json::from_str(&line)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        Ok(wire)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trips_newline_delimited_requests() {
        let requests: Vec<_> = read_requests(Cursor::new(
            br#"{"id":7,"request":{"method":"ping"}}
{"id":8,"request":{"method":"unknown","params":{}}}"#,
        ))
        .collect();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].as_ref().unwrap().id, 7);
        assert!(requests[1].as_ref().is_err());
    }

    #[test]
    fn rejects_malformed_messages_without_panicking() {
        let mut requests = read_requests(Cursor::new(br#"not-json"#));
        assert!(requests.next().unwrap().is_err());
    }
}
