//! Tests of `BackendApp`'s public surface. They use the methods the Host uses and nothing inside
//! the crate, so a test here cannot pass by reaching past the boundary.

mod library;
mod messages;
mod playback;

use crate::app::BackendApp;
use crate::audio::fake_output::FakeOutput;
use crate::test_support::{NotificationLog, TestDirectory};
use std::sync::Arc;

/// A backend with a fake output device, in an empty data directory, and what it reported. The
/// backend is declared first so it shuts down before the directory it writes to is removed.
struct Fixture {
    backend: BackendApp,
    recorded: Arc<NotificationLog>,
    _directory: TestDirectory,
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (recorded, sink) = NotificationLog::shared();
    let backend = BackendApp::initialize(data_dir, sink, Box::new(FakeOutput::new()))
        .expect("the test backend starts");
    Fixture {
        backend,
        recorded,
        _directory: directory,
    }
}
