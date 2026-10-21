use super::fixture;
use crate::app::{BackendApp, PlaybackContext};
use crate::dto::{
    LibrarySortDirection, LibraryTrackSortKey, PlaybackRepeatMode, TrackListRequest, TrackQuery,
};
use crate::errors::PlaybackServiceError;
use crate::ids::TrackId;
use crate::messages::testing::{RecordingMessageSink, Sent};
use crate::messages::{BackendMessage, StateTopic, StateValue};
use crate::test_support::{TestDirectory, write_pcm_i16_wav};
use std::time::{Duration, Instant};

fn title_order() -> TrackQuery {
    TrackQuery {
        search: None,
        sort_key: LibraryTrackSortKey::Title,
        sort_direction: LibrarySortDirection::Ascending,
    }
}

/// The ids of the Library's tracks by title, once the scan has found `count` of them.
fn wait_for_tracks(backend: &BackendApp, count: usize) -> Vec<TrackId> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let page = backend
            .list_tracks(&TrackListRequest {
                query: title_order(),
                cursor: None,
                skip: 0,
            })
            .expect("track list");
        let ids: Vec<TrackId> = page.items.iter().map(|item| item.core.id).collect();
        if ids.len() == count || Instant::now() > deadline {
            return ids;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// How many times the Waveform topic was announced to the host.
fn waveform_announcements(recorded: &RecordingMessageSink) -> usize {
    recorded
        .sent()
        .iter()
        .filter(|sent| **sent == Sent::State(StateTopic::Waveform))
        .count()
}

fn waveform_revision(backend: &BackendApp) -> u64 {
    match backend.state_message(StateTopic::Waveform) {
        Some(BackendMessage::State(message)) => message.revision,
        other => panic!("the Waveform is not a state message: {other:?}"),
    }
}

#[test]
fn with_nothing_playing_there_is_no_waveform_and_no_queue() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(backend.initial_state().waveform.value.is_none());
    let window = backend.queue_window(0, 10);
    assert!(window.items.is_empty());
    assert_eq!(window.offset, 0);
}

#[test]
fn pause_needs_a_loaded_track() {
    let fixture = fixture();

    assert_eq!(
        fixture.backend.pause().err(),
        Some(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn seeking_needs_a_loaded_track_whatever_the_position() {
    let fixture = fixture();

    assert_eq!(
        fixture.backend.seek(u64::MAX).err(),
        Some(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn volume_and_mute_are_reported_in_the_snapshot() {
    let fixture = fixture();
    let backend = &fixture.backend;

    let quiet = backend.set_volume(0.25).expect("volume");
    assert_eq!(quiet.value.base().volume, 0.25);

    let muted = backend.set_muted(true).expect("mute");
    assert!(muted.value.base().muted);
    assert_eq!(muted.value.base().volume, 0.25);
}

#[test]
fn repeat_mode_is_reported_in_the_queue_snapshot() {
    let fixture = fixture();

    let queue = fixture
        .backend
        .set_repeat_mode(PlaybackRepeatMode::All)
        .expect("repeat mode");

    assert_eq!(queue.value.repeat_mode, PlaybackRepeatMode::All);
}

#[test]
fn previous_back_to_a_track_that_played_before_shows_its_waveform() {
    // The directory is declared first, so the backend shuts down before its files are removed.
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).expect("music folder");
    write_pcm_i16_wav(&music.join("a.wav"), 8_000, 1, &[4_000i16; 8_000]);
    write_pcm_i16_wav(&music.join("b.wav"), 8_000, 1, &[8_000i16; 8_000]);
    let data_dir = directory.file("data");
    std::fs::create_dir_all(&data_dir).expect("data directory");
    let (recorded, sink) = RecordingMessageSink::shared();
    let backend = BackendApp::initialize_for_tests(data_dir, sink);
    backend
        .register_library_root(music)
        .expect("register the music folder");
    let ids = wait_for_tracks(&backend, 2);
    let context = PlaybackContext::Tracks(title_order());
    backend
        .start_playback(&context, Some(ids[0]))
        .expect("play a");
    let deadline = Instant::now() + Duration::from_secs(60);
    while backend.initial_state().waveform.value.is_none() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    backend.next().expect("next");
    let before = waveform_revision(&backend);
    let announced = waveform_announcements(&recorded);

    let back = backend.previous().expect("previous");

    let session = back.value.session().expect("a track is playing");
    let Some(BackendMessage::State(message)) = backend.state_message(StateTopic::Waveform) else {
        panic!("the Waveform is not a state message");
    };
    assert!(message.revision > before);
    assert!(waveform_announcements(&recorded) > announced);
    let StateValue::Waveform(Some(waveform)) = message.state.clone() else {
        panic!("the waveform of a was not shown after Previous");
    };
    assert_eq!(waveform.playback_id, session.playback_id);
    let initial = backend.initial_state().waveform;
    assert_eq!(initial.revision, message.revision);
    assert_eq!(initial.value, Some(waveform));
}
