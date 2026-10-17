use super::{Fixture, fixture};
use crate::app::{BackendApp, PlaybackContext};
use crate::dto::{AlbumTracksRequest, LibrarySortDirection, LibraryStatus, LibraryTrackSortKey};
use crate::errors::{LibraryCommandError, LyricsCommandError, PlaybackServiceError};
use crate::ids::{AlbumId, ArtistId, TrackId};
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
        backend.track_file(TrackId::try_from_rowid(1).unwrap()),
        Err(LibraryCommandError::LibraryUnavailable)
    ));
    assert!(matches!(
        backend.track_lyrics(TrackId::try_from_rowid(1).unwrap()),
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
        backend
            .enqueue_track(TrackId::try_from_rowid(1).unwrap(), true)
            .err(),
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

#[test]
fn an_album_by_id_that_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));

    let error = fixture.backend.album_by_id(album_id).err();

    assert!(matches!(error, Some(LibraryCommandError::AlbumNotFound)));
}

#[test]
fn an_album_by_id_that_the_library_does_not_hold_has_no_tracks_and_does_not_play() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));
    let request = AlbumTracksRequest {
        album_id,
        cursor: None,
    };

    assert!(matches!(
        fixture.backend.album_tracks_by_id(request).err(),
        Some(LibraryCommandError::AlbumNotFound)
    ));
    assert_eq!(
        fixture
            .backend
            .start_playback(&PlaybackContext::Album { album_id }, None)
            .err(),
        Some(PlaybackServiceError::AlbumNotFound)
    );
}

#[test]
fn an_album_artist_by_id_that_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();

    let error = fixture.backend.artist(ArtistId::of("Nobody")).err();

    assert!(matches!(
        error,
        Some(LibraryCommandError::AlbumArtistNotFound)
    ));
}
