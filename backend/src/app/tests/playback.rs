use super::fixture;
use crate::app::{BackendApp, PlaybackContext};
use crate::errors::CommandError;
use crate::ids::TrackId;
use crate::library::models::{ListRequest, SortDirection, TrackSortKey};
use crate::messages::{BackendMessage, Notification, StateTopic, StateValue};
use crate::player::RepeatMode;
use crate::player::fake_output::FakeOutput;
use crate::player::waveform::PlaybackWaveform;
use crate::test_support::{NotificationLog, TestDirectory, write_pcm_i16_wav};
use std::time::{Duration, Instant};

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
        let page = backend.list_tracks(&title_order()).expect("track list");
        let ids: Vec<TrackId> = page.items.iter().map(|item| item.core.id).collect();
        if ids.len() == count || Instant::now() > deadline {
            return ids;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// How many times the Waveform topic was announced to the host.
fn waveform_announcements(recorded: &NotificationLog) -> usize {
    recorded
        .sent()
        .iter()
        .filter(|sent| **sent == Notification::StateChanged(StateTopic::Waveform))
        .count()
}

fn waveform_version(backend: &BackendApp) -> u64 {
    match backend.message(StateTopic::Waveform) {
        BackendMessage::State(message) => message.version,
        other => panic!("the Waveform is not a state message: {other:?}"),
    }
}

/// The Waveform topic's value, as the Host reads it.
fn shown_waveform(backend: &BackendApp) -> Option<PlaybackWaveform> {
    match backend.message(StateTopic::Waveform) {
        BackendMessage::State(message) => match message.state {
            StateValue::Waveform(waveform) => waveform,
            other => panic!("the Waveform topic holds {other:?}"),
        },
        other => panic!("the Waveform is not a state message: {other:?}"),
    }
}

#[test]
fn with_nothing_playing_there_is_no_waveform_and_no_queue() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(shown_waveform(backend).is_none());
    let window = backend.queue_window(0, 10);
    assert_eq!(window.items.len(), 0);
    assert_eq!(window.offset, 0);
}

#[test]
fn pause_needs_a_loaded_track() {
    let fixture = fixture();

    assert_eq!(
        fixture.backend.pause().err(),
        Some(CommandError::InvalidPlaybackState)
    );
}

#[test]
fn seeking_needs_a_loaded_track_whatever_the_position() {
    let fixture = fixture();

    assert_eq!(
        fixture.backend.seek(u64::MAX).err(),
        Some(CommandError::InvalidPlaybackState)
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
        .set_repeat_mode(RepeatMode::All)
        .expect("repeat mode");

    assert_eq!(queue.value.repeat_mode, RepeatMode::All);
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
    let (recorded, sink) = NotificationLog::shared();
    let backend = BackendApp::initialize(data_dir, sink, Box::new(FakeOutput::new()))
        .expect("the test backend starts");
    backend
        .add_directory(music)
        .expect("register the music directory");
    let ids = wait_for_tracks(&backend, 2);
    let context = PlaybackContext::Tracks {
        search: None,
        sort: TrackSortKey::Title,
        direction: SortDirection::Ascending,
    };
    backend.play(&context, Some(ids[0])).expect("play a");
    let deadline = Instant::now() + Duration::from_secs(60);
    while shown_waveform(&backend).is_none() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(10));
    }
    backend.next().expect("next");
    let before = waveform_version(&backend);
    let announced = waveform_announcements(&recorded);

    let back = backend.previous().expect("previous");

    let session = back.value.session().expect("a track is playing");
    let BackendMessage::State(message) = backend.message(StateTopic::Waveform) else {
        panic!("the Waveform is not a state message");
    };
    assert!(message.version > before);
    assert!(waveform_announcements(&recorded) > announced);
    let StateValue::Waveform(Some(waveform)) = message.state else {
        panic!("the waveform of a was not shown after Previous");
    };
    assert_eq!(waveform.playback_id, session.playback_id);
    assert_eq!(waveform_version(&backend), message.version);
    assert_eq!(shown_waveform(&backend), Some(waveform));
}
