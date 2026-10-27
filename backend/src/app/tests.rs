//! Tests of `BackendApp` and the area objects it hands out. They drive the use cases the Host
//! calls, and they read results through the same methods the Host calls.

use super::{BackendApp, PlaybackContext};
use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, PlaybackId, TrackId};
use crate::library::read::lists::{ListRequest, SortDirection};
use crate::library::read::tracks::TrackSortKey;
use crate::library::sync::state::LibraryState;
use crate::library::{Library, LibraryStatus};
use crate::messages::BackendMessage;
use crate::player::RepeatMode;
use crate::player::audio::fake_output::FakeOutput;
use crate::player::audio::waveform::PlaybackWaveform;
use crate::player::playback::volume::NormalizedVolume;
use crate::settings::AppearancePatch;
use crate::test_support::{CommandCode, MessageLog, TestDirectory, wait_until, write_pcm_i16_wav};
use std::sync::Arc;
use std::time::{Duration, Instant};

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

/// A backend whose library database cannot be opened, so the Library is unavailable. A file where
/// the data directory should be stops the database from being created; a damaged database alone is
/// replaced at open and does not make the Library unavailable.
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

/// The Library of a backend that has one.
fn library_of(backend: &BackendApp) -> &Library {
    backend.library().expect("a backend with a Library")
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

/// The newest Library state the Backend has sent.
fn library_state(recorded: &MessageLog) -> LibraryState {
    assert!(
        recorded.wait_for(|message| matches!(message, BackendMessage::Library(_))),
        "the Library sends its state"
    );
    recorded.library().expect("the Library sends its state")
}

fn appearance_backdrop(enabled: bool) -> AppearancePatch {
    AppearancePatch {
        artwork_backdrop: Some(enabled),
        calm_motion: None,
    }
}

fn appearances_sent(recorded: &MessageLog) -> usize {
    recorded
        .sent()
        .iter()
        .filter(|message| matches!(message, BackendMessage::Appearance(_)))
        .count()
}

fn tracks_context() -> PlaybackContext {
    PlaybackContext::Tracks {
        search: None,
        sort: TrackSortKey::Title,
        direction: SortDirection::Ascending,
    }
}

fn title_order() -> ListRequest<TrackSortKey> {
    ListRequest {
        search: None,
        sort: TrackSortKey::Title,
        direction: SortDirection::Ascending,
        offset: 0,
        limit: 500,
    }
}

/// The ids of the Library's tracks by title, once the scan has found `count` of them.
fn wait_for_tracks(backend: &BackendApp, count: usize) -> Vec<TrackId> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let page = library_of(backend)
            .list_tracks(&title_order())
            .expect("track list");
        let ids: Vec<TrackId> = page.items.iter().map(|item| item.core.id).collect();
        if ids.len() == count || Instant::now() > deadline {
            return ids;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// The id of the playback the Host was last sent a Player state for, when a track is loaded.
fn loaded_playback(recorded: &MessageLog) -> Option<PlaybackId> {
    recorded
        .player()
        .and_then(|state| state.session().map(|session| session.playback_id))
}

// ---- messages ----

#[test]
fn the_first_message_of_each_state_kind_arrives_after_start() {
    let fixture = fixture();
    let recorded = &fixture.recorded;

    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Player(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Queue(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Library(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Waveform(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Appearance(_))));
}

#[test]
fn an_appearance_change_that_changes_nothing_is_not_sent() {
    let fixture = fixture();
    let settings = fixture.backend.settings();

    settings.update_appearance(&appearance_backdrop(false));
    let after_change = appearances_sent(&fixture.recorded);
    settings.update_appearance(&appearance_backdrop(false));

    assert_eq!(appearances_sent(&fixture.recorded), after_change);
}

#[test]
fn changes_reach_the_listener_in_the_order_they_are_made() {
    let fixture = fixture();

    fixture
        .backend
        .settings()
        .update_appearance(&appearance_backdrop(false));
    fixture
        .backend
        .player()
        .set_volume(NormalizedVolume::try_from(0.5).unwrap())
        .expect("volume");

    let sent = fixture.recorded.sent();
    let last_appearance = sent
        .iter()
        .rposition(|message| matches!(message, BackendMessage::Appearance(_)));
    let last_player = sent
        .iter()
        .rposition(|message| matches!(message, BackendMessage::Player(_)));
    assert!(
        last_appearance < last_player,
        "the appearance change is sent before the volume change"
    );
}

// ---- library ----

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
    let page = library_of(&fixture.backend)
        .list_tracks(&request)
        .expect("the page");
    assert_eq!(page.items.len(), 0);
    assert_eq!(page.total, 0);
}

#[test]
fn without_a_library_the_library_is_unavailable() {
    let fixture = fixture_without_library();

    let state = library_state(&fixture.recorded);
    assert!(matches!(state.status, LibraryStatus::Unavailable));
    assert_eq!(state.directories, []);
    assert_eq!(
        fixture.backend.library().code_of(),
        Some(CommandError::LibraryUnavailable)
    );
    assert_eq!(
        fixture
            .backend
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

#[test]
fn a_library_reset_leaves_an_empty_library_after_restart() {
    // The directory is declared first, so the backends shut down before their files are removed.
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).expect("music directory");
    write_pcm_i16_wav(&music.join("a.wav"), 8_000, 1, &[4_000i16; 8_000]);
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (_recorded, sink) = MessageLog::shared();
    let backend = BackendApp::new(data_dir.clone(), sink, Box::new(FakeOutput::new()));
    library_of(&backend)
        .add_directory(music)
        .expect("register the music directory");
    assert_eq!(wait_for_tracks(&backend, 1).len(), 1);

    backend.reset_library().expect("reset the library");
    backend.shutdown();
    drop(backend);

    let (_recorded, sink) = MessageLog::shared();
    let restarted = BackendApp::new(data_dir, sink, Box::new(FakeOutput::new()));
    let page = library_of(&restarted)
        .list_tracks(&title_order())
        .expect("track list");
    assert_eq!(page.total, 0);
}

#[test]
fn track_data_updates_after_a_rescan_finds_a_new_file() {
    // The directory is declared first, so the backend shuts down before its files are removed.
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).expect("music directory");
    write_pcm_i16_wav(&music.join("a.wav"), 8_000, 1, &[4_000i16; 8_000]);
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (_recorded, sink) = MessageLog::shared();
    let backend = BackendApp::new(data_dir, sink, Box::new(FakeOutput::new()));
    library_of(&backend)
        .add_directory(music.clone())
        .expect("register the music directory");
    assert_eq!(wait_for_tracks(&backend, 1).len(), 1);

    write_pcm_i16_wav(&music.join("b.wav"), 8_000, 1, &[8_000i16; 8_000]);
    library_of(&backend).start_scan().expect("start a scan");

    assert_eq!(wait_for_tracks(&backend, 2).len(), 2);
}

#[test]
fn track_properties_for_a_track_the_library_does_not_hold_are_not_found() {
    let fixture = fixture();

    assert_eq!(
        library_of(&fixture.backend)
            .track_properties(TrackId::try_from_rowid(999).unwrap())
            .code_of(),
        Some(CommandError::NotFound)
    );
}

#[test]
fn a_track_file_for_a_track_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();

    assert_eq!(
        library_of(&fixture.backend)
            .track_file(TrackId::try_from_rowid(999).unwrap())
            .code_of(),
        Some(CommandError::NotFound)
    );
}

#[test]
fn an_album_by_id_that_the_library_does_not_hold_is_not_found() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));

    let error = library_of(&fixture.backend).album(album_id).code_of();

    assert_eq!(error, Some(CommandError::NotFound));
}

#[test]
fn an_album_by_id_that_the_library_does_not_hold_has_no_tracks_and_does_not_play() {
    let fixture = fixture();
    let album_id = AlbumId::of("Nobody", "Nope", std::ffi::OsStr::new(""));

    assert_eq!(
        library_of(&fixture.backend)
            .list_album_tracks(album_id)
            .code_of(),
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

    let error = library_of(&fixture.backend)
        .artist(ArtistId::of("Nobody"))
        .code_of();

    assert_eq!(error, Some(CommandError::NotFound));
}

// ---- playback ----

#[test]
fn with_nothing_playing_there_is_no_waveform_and_no_queue() {
    let fixture = fixture();

    assert!(shown_waveform(&fixture.recorded).is_none());
    let window = fixture
        .backend
        .player()
        .queue_window(0, 10)
        .expect("the queue window");
    assert_eq!(window.items.len(), 0);
    assert_eq!(window.offset, 0);
}

#[test]
fn pause_needs_a_loaded_track() {
    let fixture = fixture();

    assert_eq!(fixture.backend.player().pause().code_of(), None);
}

#[test]
fn seeking_needs_a_loaded_track_whatever_the_position() {
    let fixture = fixture();

    assert_eq!(fixture.backend.player().seek(u64::MAX).code_of(), None);
}

#[test]
fn volume_and_mute_are_reported_in_the_player_state() {
    let fixture = fixture();
    let player = fixture.backend.player();

    player
        .set_volume(NormalizedVolume::try_from(0.25).unwrap())
        .expect("volume");
    let quiet = fixture.recorded.player().expect("a Player state");
    assert_eq!(quiet.base().volume, 0.25);

    player.set_muted(true).expect("mute");
    let muted = fixture.recorded.player().expect("a Player state");
    assert!(muted.base().muted);
    assert_eq!(muted.base().volume, 0.25);
}

#[test]
fn repeat_mode_is_reported_in_the_queue_state() {
    let fixture = fixture();

    fixture
        .backend
        .player()
        .set_repeat_mode(RepeatMode::All)
        .expect("repeat mode");

    let queue = fixture.recorded.queue().expect("a Queue state");
    assert_eq!(queue.repeat_mode, RepeatMode::All);
}

#[test]
fn previous_back_to_a_track_that_played_before_shows_its_waveform() {
    // The directory is declared first, so the backend shuts down before its files are removed.
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).expect("music directory");
    write_pcm_i16_wav(&music.join("a.wav"), 8_000, 1, &[4_000i16; 8_000]);
    write_pcm_i16_wav(&music.join("b.wav"), 8_000, 1, &[8_000i16; 8_000]);
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (recorded, sink) = MessageLog::shared();
    let backend = BackendApp::new(data_dir, sink, Box::new(FakeOutput::new()));
    library_of(&backend)
        .add_directory(music)
        .expect("register the music directory");
    let ids = wait_for_tracks(&backend, 2);
    backend
        .play(&tracks_context(), Some(ids[0]))
        .expect("play a");
    assert!(
        recorded.wait_for(|message| matches!(message, BackendMessage::Waveform(Some(_)))),
        "a is analyzed while it plays"
    );
    backend.player().next().expect("next");

    backend.player().previous().expect("previous");
    assert!(
        wait_until(
            || loaded_playback(&recorded).is_some(),
            Duration::from_secs(30)
        ),
        "the track before plays"
    );

    let playback_id = loaded_playback(&recorded).expect("a track is playing");
    assert!(
        recorded.wait_for(|message| matches!(
            message,
            BackendMessage::Waveform(Some(waveform)) if waveform.playback_id == playback_id
        )),
        "a's waveform is shown after Previous"
    );
    assert_eq!(
        shown_waveform(&recorded).map(|waveform| waveform.playback_id),
        Some(playback_id)
    );
}
