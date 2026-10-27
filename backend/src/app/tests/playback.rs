use super::{fixture, shown_waveform};
use crate::app::{BackendApp, PlaybackContext};
use crate::ids::TrackId;
use crate::library::read::lists::{ListRequest, SortDirection};
use crate::library::read::tracks::TrackSortKey;
use crate::messages::BackendMessage;
use crate::player::RepeatMode;
use crate::player::audio::fake_output::FakeOutput;
use crate::player::playback::volume::NormalizedVolume;
use crate::test_support::CommandCode;
use crate::test_support::{MessageLog, TestDirectory, wait_until, write_pcm_i16_wav};
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

/// The id of the playback the Host was last sent a Player state for, when a track is loaded.
fn loaded_playback(recorded: &MessageLog) -> Option<crate::ids::PlaybackId> {
    recorded
        .player()
        .and_then(|state| state.session().map(|session| session.playback_id))
}

#[test]
fn with_nothing_playing_there_is_no_waveform_and_no_queue() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(shown_waveform(&fixture.recorded).is_none());
    let window = backend.queue_window(0, 10).expect("the queue window");
    assert_eq!(window.items.len(), 0);
    assert_eq!(window.offset, 0);
}

#[test]
fn pause_needs_a_loaded_track() {
    let fixture = fixture();

    assert_eq!(fixture.backend.pause().code_of(), None);
}

#[test]
fn seeking_needs_a_loaded_track_whatever_the_position() {
    let fixture = fixture();

    assert_eq!(fixture.backend.seek(u64::MAX).code_of(), None);
}

#[test]
fn volume_and_mute_are_reported_in_the_player_state() {
    let fixture = fixture();
    let backend = &fixture.backend;

    backend
        .set_volume(NormalizedVolume::try_from(0.25).unwrap())
        .expect("volume");
    let quiet = fixture.recorded.player().expect("a Player state");
    assert_eq!(quiet.base().volume, 0.25);

    backend.set_muted(true).expect("mute");
    let muted = fixture.recorded.player().expect("a Player state");
    assert!(muted.base().muted);
    assert_eq!(muted.base().volume, 0.25);
}

#[test]
fn repeat_mode_is_reported_in_the_queue_state() {
    let fixture = fixture();

    fixture
        .backend
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
    assert!(
        recorded.wait_for(|message| matches!(message, BackendMessage::Waveform(Some(_)))),
        "a is analyzed while it plays"
    );
    backend.next().expect("next");

    backend.previous().expect("previous");
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
