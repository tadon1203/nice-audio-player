use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};

pub mod event;
pub mod output;
pub mod request;
pub mod response;
pub use response::{ProtocolError, Response};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireRequest {
    pub id: u64,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", untagged)]
pub enum Message {
    Ready { event: &'static str },
    Response(response::Response),
    Event(event::BackendEvent),
}

pub fn write_message<T: Serialize>(writer: &mut impl Write, message: &T) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, message)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

pub fn read_requests(reader: impl BufRead) -> impl Iterator<Item = io::Result<request::Envelope>> {
    reader.lines().map(|line| {
        let line = line?;
        let wire: WireRequest = serde_json::from_str(&line)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        request::parse(wire.id, &wire.method, wire.params)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trips_newline_delimited_requests() {
        let requests: Vec<_> = read_requests(Cursor::new(
            br#"{"id":7,"method":"ping"}
{"id":8,"method":"unknown","params":{}}"#,
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
