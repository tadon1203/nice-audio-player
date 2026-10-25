use super::{Fixture, fixture};
use crate::app::{BackendApp, PlaybackContext};
use crate::audio::playback::PlaybackServiceError;
use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, TrackId};
use crate::library::LibraryCommandError;
use crate::library::LibraryStatus;
use crate::library::models::{
    AlbumTracksRequest, SortDirection, TrackListRequest, TrackQuery, TrackSortKey,
};
use crate::library::store::PlaybackSourceError;
use crate::lyrics::LyricsCommandError;

use crate::test_support::{RecordingMessageListener, TestDirectory};

/// A backend whose library database cannot be opened, so the Library is absent. A file where the
/// data directory should be stops the database from being created; a damaged database alone is
/// replaced at open and does not make the Library absent.
fn fixture_without_library() -> Fixture {
    let directory = TestDirectory::new();
    let data_dir = directory.file("data");
    std::fs::write(&data_dir, "a file, so the data directory cannot be created")
        .expect("a blocker");
    let (recorded, sink) = RecordingMessageListener::shared();
    let backend = BackendApp::initialize_for_tests(data_dir, sink);
    Fixture {
        backend,
        recorded,
        _directory: directory,
    }
}

fn tracks_context() -> PlaybackContext {
    PlaybackContext::Tracks(TrackQuery {
        search: None,
        sort_key: TrackSortKey::Title,
        sort_direction: SortDirection::Ascending,
    })
}

#[test]
fn the_tracks_context_is_a_track_query_beside_its_kind() {
    let context: PlaybackContext = serde_json::from_value(serde_json::json!({
        "kind": "tracks",
        "search": "alp",
        "sortKey": "title",
        "sortDirection": "ascending",
    }))
    .expect("a tracks context");

    let PlaybackContext::Tracks(query) = context else {
        panic!("not the tracks context");
    };
    assert_eq!(query.search.as_deref(), Some("alp"));
    assert_eq!(query.sort_key, TrackSortKey::Title);
    assert_eq!(query.sort_direction, SortDirection::Ascending);
}

#[test]
fn a_list_request_is_its_query_beside_the_cursor_and_skip() {
    let request: TrackListRequest = serde_json::from_value(serde_json::json!({
        "search": null,
        "sortKey": "title",
        "sortDirection": "descending",
        "cursor": null,
        "skip": 7,
    }))
    .expect("a list request");

    assert_eq!(request.query.sort_direction, SortDirection::Descending);
    assert_eq!(request.skip, 7);
    let fixture = fixture();
    let page = fixture.backend.list_tracks(&request).expect("the page");
    assert_eq!(page.items.len(), 0);
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
        backend.list_directories(),
        Err(CommandError::LibraryUnavailable)
    ));
    assert!(matches!(
        backend.start_scan(),
        Err(LibraryCommandError::Common {
            error: CommandError::LibraryUnavailable
        })
    ));
    assert!(matches!(
        backend.track_file(TrackId::try_from_rowid(1).unwrap()),
        Err(LibraryCommandError::Common {
            error: CommandError::LibraryUnavailable
        })
    ));
    assert!(matches!(
        backend.track_lyrics(TrackId::try_from_rowid(1).unwrap()),
        Err(LyricsCommandError::Common {
            error: CommandError::LibraryUnavailable
        })
    ));
}

#[test]
fn without_a_library_playing_from_it_says_it_is_unavailable() {
    let fixture = fixture_without_library();
    let backend = &fixture.backend;
    let unavailable = PlaybackServiceError::Common {
        error: CommandError::LibraryUnavailable,
    };

    assert_eq!(
        backend.play(&tracks_context(), None).err(),
        Some(unavailable.clone())
    );
    assert_eq!(
        backend
            .enqueue_track(TrackId::try_from_rowid(1).unwrap(), true)
            .err(),
        Some(unavailable)
    );
}

#[test]
fn with_a_library_the_library_commands_answer() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(matches!(backend.library_status(), LibraryStatus::Ready));
    assert_eq!(backend.list_directories().expect("directories"), []);
}

#[test]
fn track_properties_for_a_track_the_library_does_not_hold_are_not_found() {
    let fixture = fixture();

    assert!(matches!(
        fixture
            .backend
            .track_properties(TrackId::try_from_rowid(999).unwrap()),
        Err(LibraryCommandError::Common {
            error: CommandError::TrackNotFound
        })
    ));
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
        fixture.backend.album_tracks_by_id(&request).err(),
        Some(LibraryCommandError::AlbumNotFound)
    ));
    assert_eq!(
        fixture
            .backend
            .play(&PlaybackContext::Album { album_id }, None)
            .err(),
        Some(PlaybackServiceError::Source {
            error: PlaybackSourceError::AlbumNotFound,
        })
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
