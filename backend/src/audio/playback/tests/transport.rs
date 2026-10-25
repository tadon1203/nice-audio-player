//! Transport through `Player`: start, pause, navigation, position and the end of a track.

use super::*;

#[test]
fn a_start_plays_the_track_at_the_start_index() {
    let fixture = Fixture::with(&clips(&["a", "b"]));

    let started = fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 1)
        .unwrap()
        .value;

    assert!(is_playing(&started, "b"));
    assert_eq!(session(&started).started_by, StartedBy::Jump);
    assert!(fixture.output.is_running());
}

#[test]
fn navigating_while_paused_starts_the_next_track_paused() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.player.pause().unwrap();

    let next = fixture.player.next().unwrap().value;

    assert!(is_paused(&next, "b"));
    assert_eq!(session(&next).started_by, StartedBy::Next);
}

#[test]
fn pause_keeps_the_position_and_resume_continues_from_it() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) / 2);
    fixture.wait_for_position(500);

    let paused = fixture.player.pause().unwrap().value;
    assert!(is_paused(&paused, "a"));
    let position = fixture.player.position().expect("a position").position_ms;
    assert!(position >= 500);

    let resumed = fixture.player.resume().unwrap().value;

    assert!(is_playing(&resumed, "a"));
    assert!(fixture.output.is_running());
}

#[test]
fn pause_and_resume_need_a_loaded_track() {
    let fixture = Fixture::with(&[]);

    assert_eq!(
        fixture.player.pause().err(),
        Some(CommandError::InvalidPlaybackState)
    );
    assert_eq!(
        fixture.player.resume().err(),
        Some(CommandError::InvalidPlaybackState)
    );
}

#[test]
fn a_tick_publishes_the_position_the_speakers_reached() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();

    fixture.output.set_played_frames(u64::from(SAMPLE_RATE));

    fixture.wait_for_position(1_000);
    assert_eq!(
        fixture
            .player
            .position()
            .map(|position| position.playback_id),
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

    fixture.finish();

    fixture.wait_for(|state| matches!(state, PlaybackState::Stopped { .. }));
    let PlaybackState::Stopped { item, .. } = fixture.state() else {
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
    fixture.player.next().unwrap();
    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) * 3);
    fixture.wait_for_position(3_000);

    let restarted = fixture.player.previous().unwrap().value;

    assert!(
        is_playing(&restarted, "b"),
        "b restarts instead of going back to a"
    );
    assert_eq!(
        fixture.queue().current.map(|item| item.track.core.title),
        Some("b".into())
    );
}

#[test]
fn previous_goes_back_to_the_last_track_when_it_has_just_started() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.player.next().unwrap();

    let back = fixture.player.previous().unwrap().value;

    assert!(is_playing(&back, "a"));
    assert_eq!(session(&back).started_by, StartedBy::Previous);
}

#[test]
fn the_listener_hears_each_load_as_a_new_playback() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    let first = fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap()
        .value;
    fixture.player.next().unwrap();
    let back = fixture.player.previous().unwrap().value;

    let loaded: Vec<_> = fixture
        .heard()
        .into_iter()
        .filter_map(|heard| match heard {
            Heard::Loaded(id, title) => Some((id, title)),
            Heard::Upcoming(_) => None,
        })
        .collect();
    let titles: Vec<_> = loaded.iter().map(|(_, title)| title.as_str()).collect();
    assert_eq!(titles, ["a", "b", "a"]);
    assert_eq!(loaded[0].0, session(&first).playback_id);
    assert_eq!(loaded[2].0, session(&back).playback_id);
    assert_ne!(loaded[0].0, loaded[2].0, "a second load is a new playback");
}

#[test]
fn a_seek_moves_the_position_and_keeps_the_session() {
    let fixture = Fixture::with(&clips(&["a"]));
    let playing = fixture
        .player
        .play_queue(fixture.ids(&["a"]), 0)
        .unwrap()
        .value;

    let sought = fixture.player.seek(1_000).unwrap().value;

    assert!(is_playing(&sought, "a"));
    assert_eq!(session(&sought).playback_id, session(&playing).playback_id);
    assert_eq!(session(&sought).seek_count, 1);
    assert_eq!(session(&sought).position_ms, 1_000);
}

#[test]
fn a_seek_while_paused_stays_paused() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.player.pause().unwrap();

    let sought = fixture.player.seek(500).unwrap().value;

    assert!(is_paused(&sought, "a"));
    assert!(!fixture.output.is_running());
}

#[test]
fn seeking_past_the_end_plays_the_next_track_like_a_natural_finish() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();

    // The position is clamped to the duration, which is where the track ends.
    fixture.player.seek(u64::MAX).unwrap();

    fixture.wait_for(|state| is_playing(state, "b"));
}

#[test]
fn seeking_to_the_end_of_the_last_track_stops() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();

    fixture.player.seek(u64::MAX).unwrap();

    fixture.wait_for(|state| matches!(state, PlaybackState::Stopped { .. }));
}

#[test]
fn seeks_reuse_the_one_output_stream_of_the_session() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();

    fixture.player.seek(500).unwrap();
    fixture.player.seek(1_000).unwrap();

    assert_eq!(fixture.output.streams_opened(), 1);
}

#[test]
fn commands_after_shutdown_report_a_failed_task() {
    let fixture = Fixture::with(&[]);

    fixture.player.shutdown();

    assert_eq!(
        fixture.player.set_volume(0.5).err(),
        Some(CommandError::TaskFailed)
    );
}
