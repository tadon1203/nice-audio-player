use super::{Fixture, fixture};
use crate::app::{BackendApp, PlaybackContext};
use crate::dto::{LibrarySortDirection, LibraryStatus, LibraryTrackSortKey};
use crate::errors::{LibraryCommandError, LyricsCommandError, PlaybackServiceError};
use crate::messages::testing::RecordingMessageSink;
use crate::test_support::TestDirectory;

/// A backend whose library database cannot be opened, so the Library is absent.
fn fixture_without_library() -> Fixture {
    let directory = TestDirectory::new();
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    std::fs::write(
        data_dir.join("library.sqlite3"),
        "this file is not a database, so the library cannot be opened from it",
    )
    .expect("a damaged database");
    let (recorded, sink) = RecordingMessageSink::shared();
    let backend = BackendApp::initialize_for_tests(data_dir, sink);
    Fixture {
        backend,
        recorded,
        _directory: directory,
    }
}

fn tracks_context() -> PlaybackContext {
    PlaybackContext::Tracks {
        search: None,
        sort_key: LibraryTrackSortKey::Title,
        sort_direction: LibrarySortDirection::Ascending,
    }
}

#[test]
fn without_a_library_the_library_commands_say_it_is_unavailable() {
    let fixture = fixture_without_library();
    let backend = &fixture.backend;

    assert!(matches!(
        backend.library_status(),
        LibraryStatus::Unavailable { .. }
    ));
    assert!(matches!(
        backend.library_roots(),
        Err(LibraryCommandError::LibraryUnavailable)
    ));
    assert!(matches!(
        backend.start_scan(),
        Err(LibraryCommandError::LibraryUnavailable)
    ));
    assert!(matches!(
        backend.track_file("1"),
        Err(LibraryCommandError::LibraryUnavailable)
    ));
    assert!(matches!(
        backend.track_lyrics("1"),
        Err(LyricsCommandError::LibraryUnavailable)
    ));
}

#[test]
fn without_a_library_playing_from_it_says_it_is_unavailable() {
    let fixture = fixture_without_library();
    let backend = &fixture.backend;

    assert_eq!(
        backend.start_playback(&tracks_context(), None).err(),
        Some(PlaybackServiceError::LibraryUnavailable)
    );
    assert_eq!(
        backend.enqueue_track("1", true).err(),
        Some(PlaybackServiceError::LibraryUnavailable)
    );
}

#[test]
fn with_a_library_the_library_commands_answer() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(matches!(backend.library_status(), LibraryStatus::Ready));
    assert!(backend.library_roots().expect("roots").is_empty());
}
