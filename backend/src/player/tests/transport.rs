//! Transport through `Player`: start, pause, navigation, position and the end of a track.

use super::*;

use crate::player::volume::NormalizedVolume;
use crate::test_support::CommandCode;

#[test]
fn a_start_plays_the_track_at_the_start_index() {
    let fixture = Fixture::with(&clips(&["a", "b"]));

    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 1)
        .unwrap();

    fixture.wait_for(|state| is_playing(state, "b"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Jump);
    assert!(fixture.output.is_running());
}

#[test]
fn navigating_while_paused_starts_the_next_track_paused() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.pause().unwrap();

    fixture.player.next().unwrap();

    fixture.wait_for(|state| is_paused(state, "b"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Next);
}

#[test]
fn pause_keeps_the_position_and_resume_continues_from_it() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) / 2);
    fixture.wait_for_position(500);

    fixture.player.pause().unwrap();
    assert!(is_paused(&fixture.state(), "a"));
    assert!(session(&fixture.state()).position_ms >= 500);

    fixture.player.resume().unwrap();

    fixture.wait_for(|state| is_playing(state, "a"));
    assert!(fixture.output.is_running());
}

#[test]
fn pause_and_resume_need_a_loaded_track() {
    let fixture = Fixture::with(&[]);

    assert_eq!(fixture.player.pause().code_of(), None);
    assert_eq!(fixture.player.resume().code_of(), None);
}

#[test]
fn pause_with_nothing_loaded_publishes_nothing() {
    let fixture = Fixture::with(&[]);
    let sent_before = fixture.messages.sent().len();

    assert_eq!(fixture.player.pause().code_of(), None);

    assert_eq!(fixture.messages.sent().len(), sent_before);
}

#[test]
fn a_tick_publishes_the_position_the_speakers_reached() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.output.set_played_frames(u64::from(SAMPLE_RATE));

    fixture.wait_for_position(1_000);
    assert_eq!(
        fixture.position().map(|position| position.playback_id),
        Some(session(&fixture.state()).playback_id)
    );
}

#[test]
fn a_finished_track_moves_on_to_the_next_one() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.finish();

    fixture.wait_for(|state| is_playing(state, "b"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Auto);
    assert_eq!(
        fixture.queue().current.map(|item| item.track.core.title),
        Some("b".into())
    );
}

#[test]
fn the_last_track_finishing_stops_and_clears_the_queue() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.finish();

    fixture.wait_for(|state| matches!(state, PlayerState::Stopped { .. }));
    let PlayerState::Stopped { item, .. } = fixture.state() else {
        panic!("the player stops");
    };
    assert_eq!(item.map(|item| item.track.core.title), Some("a".into()));
    assert!(fixture.queue().current.is_none());
}

#[test]
fn a_paused_track_does_not_finish_naturally() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.pause().unwrap();

    fixture.finish();
    fixture.settle();

    assert!(is_paused(&fixture.state(), "a"));
}

#[test]
fn previous_restarts_a_track_that_has_played_for_a_while() {
    let fixture = Fixture::with(&[Clip::new("a", 2), Clip::new("b", 5)]);
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.next().unwrap();
    fixture.wait_for(|state| is_playing(state, "b"));
    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) * 3);
    fixture.wait_for_position(3_000);

    fixture.player.previous().unwrap();

    fixture.wait_for(|state| is_playing(state, "b") && session(state).seek_count == 1);
    assert_eq!(
        fixture.queue().current.map(|item| item.track.core.title),
        Some("b".into()),
        "b restarts instead of going back to a"
    );
}

#[test]
fn previous_goes_back_to_the_last_track_when_it_has_just_started() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.next().unwrap();
    fixture.wait_for(|state| is_playing(state, "b"));

    fixture.player.previous().unwrap();

    fixture.wait_for(|state| is_playing(state, "a"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Previous);
}

#[test]
fn each_load_is_a_new_playback() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let first = session(&fixture.state()).playback_id;
    fixture.player.next().unwrap();
    fixture.wait_for(|state| is_playing(state, "b"));
    let next = session(&fixture.state()).playback_id;
    fixture.player.previous().unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let back = session(&fixture.state()).playback_id;

    assert_ne!(first, next);
    assert_ne!(first, back);
}

#[test]
fn a_seek_moves_the_position_and_keeps_the_session() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let playback_id = session(&fixture.state()).playback_id;

    fixture.player.seek(1_000).unwrap();

    fixture.wait_for(|state| is_playing(state, "a") && session(state).seek_count == 1);
    let sought = fixture.state();
    assert_eq!(session(&sought).playback_id, playback_id);
    assert_eq!(session(&sought).position_ms, 1_000);
}

#[test]
fn a_seek_while_paused_stays_paused() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.pause().unwrap();

    fixture.player.seek(500).unwrap();

    fixture.wait_for(|state| is_paused(state, "a") && session(state).seek_count == 1);
    assert!(!fixture.output.is_running());
}

#[test]
fn a_seek_replaces_a_seek_that_is_still_reading() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.player.seek(500).unwrap();
    fixture.player.seek(1_000).unwrap();

    fixture.wait_for(|state| is_playing(state, "a") && session(state).position_ms == 1_000);
}

#[test]
fn seeking_past_the_end_plays_the_next_track_like_a_natural_finish() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    // The position is clamped to the duration, which is where the track ends.
    fixture.player.seek(u64::MAX).unwrap();

    fixture.wait_for(|state| is_playing(state, "b"));
}

#[test]
fn seeking_to_the_end_of_the_last_track_stops() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.player.seek(u64::MAX).unwrap();

    fixture.wait_for(|state| matches!(state, PlayerState::Stopped { .. }));
}

#[test]
fn seeks_reuse_the_one_output_stream_of_the_session() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.player.seek(500).unwrap();
    fixture.wait_for(|state| session(state).seek_count == 1);
    fixture.player.seek(1_000).unwrap();
    fixture.wait_for(|state| session(state).seek_count == 2);

    assert_eq!(fixture.output.streams_opened(), 1);
}

#[test]
fn commands_after_shutdown_report_an_internal_failure() {
    let fixture = Fixture::with(&[]);

    fixture.player.shutdown();

    assert_eq!(
        fixture
            .player
            .set_volume(NormalizedVolume::try_from(0.5).unwrap())
            .code_of(),
        Some(CommandError::Internal)
    );
}
