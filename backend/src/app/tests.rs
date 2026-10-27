//! Tests of `BackendApp`'s public surface. They use the methods the Host uses and nothing inside
//! the crate, so a test here cannot pass by reaching past the boundary.

use crate::app::BackendApp;
use crate::messages::BackendMessage;
use crate::player::audio::fake_output::FakeOutput;
use crate::player::audio::waveform::PlaybackWaveform;
use crate::test_support::{MessageLog, TestDirectory};
use std::sync::Arc;

/// A backend with a fake output device, in an empty data directory, and what it sent the Host. The
/// backend is declared first so it shuts down before the directory it writes to is removed.
struct Fixture {
    backend: BackendApp,
    recorded: Arc<MessageLog>,
    _directory: TestDirectory,
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (recorded, sink) = MessageLog::shared();
    let backend = BackendApp::new(data_dir, sink, Box::new(FakeOutput::new()));
    Fixture {
        backend,
        recorded,
        _directory: directory,
    }
}

/// The Waveform as the Host last received it.
fn shown_waveform(recorded: &MessageLog) -> Option<PlaybackWaveform> {
    recorded
        .latest(|message| match message {
            BackendMessage::Waveform(waveform) => Some(waveform.clone()),
            _ => None,
        })
        .flatten()
}
mod library;
mod messages;
mod playback;
