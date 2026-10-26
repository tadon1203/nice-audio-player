use super::{Fixture, fixture};
use crate::app::{BackendApp, PlaybackContext};
use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, TrackId};
use crate::player::fake_output::FakeOutput;
use crate::test_support::CommandCode;

use crate::library::LibraryStatus;
use crate::library::models::{LibraryState, ListRequest, SortDirection, TrackSortKey};
use crate::messages::BackendMessage;

use crate::test_support::{MessageLog, TestDirectory};

/// A backend whose library database cannot be opened, so the Library is absent. A file where the
/// data directory should be stops the database from being created; a damaged database alone is
/// replaced at open and does not make the Library absent.
fn fixture_without_library() -> Fixture {
    let directory = TestDirectory::new();
    let data_dir = directory.file("data");
    std::fs::write(&data_dir, "a file, so the data directory cannot be created")
        .expect("a blocker");
    let (recorded, sink) = MessageLog::shared();
    let backend = BackendApp::new(data_dir, sink, Box::new(FakeOutput::new()));
    Fixture {
        backend,
        recorded,
        _directory: directory,
    }
}

fn tracks_context() -> PlaybackContext {
    PlaybackContext::Tracks {
        search: None,
        sort: TrackSortKey::Title,
        direction: SortDirection::Ascending,
    }
}

#[test]
fn the_tracks_context_is_the_list_s_search_and_sort() {
    let context: PlaybackContext = serde_json::from_value(serde_json::json!({
        "kind": "tracks",
        "search": "alp",
        "sort": "title",
        "direction": "ascending",
    }))
    .expect("a tracks context");

    let PlaybackContext::Tracks {
        search,
        sort,
        direction,
    } = context
    else {
        panic!("not the tracks context");
    };
    assert_eq!(search.as_deref(), Some("alp"));
    assert_eq!(sort, TrackSortKey::Title);
    assert_eq!(direction, SortDirection::Ascending);
}

#[test]
fn a_list_request_is_its_search_sort_direction_and_window() {
    let request: ListRequest<TrackSortKey> = serde_json::from_value(serde_json::json!({
        "search": null,
        "sort": "title",
        "direction": "descending",
        "offset": 7,
        "limit": 50,
    }))
    .expect("a list request");

    assert_eq!(request.direction, SortDirection::Descending);
    assert_eq!((request.offset, request.limit), (7, 50));
    let fixture = fixture();
    let page = fixture.backend.list_tracks(&request).expect("the page");
    assert_eq!(page.items.len(), 0);
    assert_eq!(page.total, 0);
}

#[test]
fn without_a_library_the_library_commands_say_it_is_unavailable() {
    let fixture = fixture_without_library();
    let backend = &fixture.backend;

    let state = library_state(&fixture.recorded);
    assert!(matches!(state.status, LibraryStatus::Unavailable));
    assert_eq!(state.directories, []);
    assert_eq!(
        backend.start_scan().code_of(),
        Some(CommandError::LibraryUnavailable)
    );
    assert_eq!(
        backend
            .track_file(TrackId::try_from_rowid(1).unwrap())
            .code_of(),
        Some(CommandError::LibraryUnavailable)
    );
    assert_eq!(
        backend
            .track_lyrics(TrackId::try_from_rowid(1).unwrap())
            .code_of(),
        Some(CommandError::LibraryUnavailable)
    );
}

#[test]
fn without_a_library_playing_from_it_says_it_is_unavailable() {
    let fixture = fixture_without_library();
    let backend = &fixture.backend;
    let unavailable = CommandError::LibraryUnavailable;

    assert_eq!(
        backend.play(&tracks_context(), None).code_of(),
        Some(unavailable)
    );
    assert_eq!(
        backend
            .enqueue_track(TrackId::try_from_rowid(1).unwrap(), true)
            .code_of(),
        Some(unavailable)
    );
}

#[test]
fn with_a_library_the_library_commands_answer() {
    let fixture = fixture();

    let state = library_state(&fixture.recorded);
    assert!(matches!(state.status, LibraryStatus::Ready));
    assert_eq!(state.directories, []);
}

/// The newest Library state the Backend has sent.
fn library_state(recorded: &MessageLog) -> LibraryState {
    assert!(
        recorded.wait_for(|message| matches!(message, BackendMessage::Library(_))),
        "the Library sends its state"
    );
    recorded.library().expect("the Library sends its state")
}

#[test]
fn track_properties_for_a_track_the_library_does_not_hold_are_not_found() {
    let fixture = fixture();

    assert_eq!(
        fixture
            .backend
            .track_properties(TrackId::try_from_rowid(999).unwrap())
            .code_of(),
        Some(CommandError::NotFound)
    );
}

#[test]
fn an_album_by_id_that_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));

    let error = fixture.backend.album_by_id(album_id).code_of();

    assert_eq!(error, Some(CommandError::NotFound));
}

#[test]
fn an_album_by_id_that_the_library_does_not_hold_has_no_tracks_and_does_not_play() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));

    assert_eq!(
        fixture.backend.album_tracks(album_id).code_of(),
        Some(CommandError::NotFound)
    );
    assert_eq!(
        fixture
            .backend
            .play(&PlaybackContext::Album { album_id }, None)
            .code_of(),
        Some(CommandError::NotFound)
    );
}

#[test]
fn an_album_artist_by_id_that_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();

    let error = fixture.backend.artist(ArtistId::of("Nobody")).code_of();

    assert_eq!(error, Some(CommandError::NotFound));
}
