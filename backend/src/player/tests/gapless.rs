//! Gapless handover through `Player`: prefetch, the switch to the next track and the stream it plays on.

use super::*;

#[test]
fn a_track_of_the_same_format_follows_on_the_same_stream() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let first = session(&fixture.state()).playback_id;
    wait_until(|| fixture.output.chained_pipeline().is_some(), WAIT);

    fixture.finish();

    fixture.wait_for(|state| is_playing(state, "b"));
    let snapshot = fixture.state();
    assert_ne!(
        session(&snapshot).playback_id,
        first,
        "each track is its own playback"
    );
    assert_eq!(session(&snapshot).position_ms, 0);
    assert_eq!(fixture.output.streams_opened(), 1, "the stream is kept");
    assert_eq!(fixture.output.adoptions(), 1);
    assert!(fixture.output.is_running());
}

#[test]
fn a_long_track_is_not_prefetched_until_its_last_ten_seconds() {
    let fixture = Fixture::with(&[Clip::new("a", 15), Clip::new("b", 2)]);
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) * 4);
    fixture.wait_for_position(4_000);

    fixture.settle();
    assert!(
        fixture.output.chained_pipeline().is_none(),
        "11 seconds are left"
    );

    fixture.output.set_played_frames(u64::from(SAMPLE_RATE) * 6);
    fixture.wait_for_position(6_000);

    wait_until(|| fixture.output.chained_pipeline().is_some(), WAIT);
}

#[test]
fn skipping_during_the_handover_window_plays_the_next_track() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    wait_until(|| fixture.output.chained_pipeline().is_some(), WAIT);

    fixture.player.next().unwrap();

    fixture.wait_for(|state| is_playing(state, "b"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Next);
}

#[test]
fn the_session_carries_the_source_format_of_the_loaded_track() {
    let fixture = Fixture::with(&clips(&["a"]));

    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    let state = fixture.state();
    let current = session(&state);
    assert_eq!(current.source_sample_rate, SAMPLE_RATE);
    assert_eq!(current.output_sample_rate, SAMPLE_RATE);
    assert!(!current.resampling_active);
    assert_eq!(current.channel_conversion, PlaybackChannelConversion::None);
}

#[test]
fn a_track_of_another_format_reopens_the_stream() {
    for (rate, channels) in [(48_000, 1), (SAMPLE_RATE, 2)] {
        let fixture = Fixture::with(&[Clip::new("a", 2), Clip::new("b", 2).format(rate, channels)]);
        fixture
            .player
            .play_queue(fixture.ids(&["a", "b"]), 0)
            .unwrap();
        fixture.wait_for(|state| is_playing(state, "a"));
        wait_until(|| fixture.output.chained_pipeline().is_none(), WAIT);

        fixture.finish();

        fixture.wait_for(|state| is_playing(state, "b"));
        assert_eq!(session(&fixture.state()).source_sample_rate, rate);
        assert_eq!(fixture.output.streams_opened(), 2);
    }
}

#[test]
fn the_gapless_switch_is_a_new_playback_on_the_same_stream() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let first = session(&fixture.state()).playback_id;
    wait_until(|| fixture.output.chained_pipeline().is_some(), WAIT);

    fixture.finish();
    fixture.wait_for(|state| is_playing(state, "b"));

    assert_ne!(session(&fixture.state()).playback_id, first);
    assert_eq!(fixture.output.streams_opened(), 1);
    assert_eq!(fixture.output.adoptions(), 1);
}

#[test]
fn putting_a_track_next_discards_the_prefetch_and_plays_it_next() {
    let fixture = Fixture::with(&clips(&["a", "b", "c"]));
    let ids = fixture.ids(&["a", "b", "c"]);
    fixture.player.play_queue(vec![ids[0], ids[1]], 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    wait_until(|| fixture.output.chained_pipeline().is_some(), WAIT);

    fixture.player.enqueue(ids[2], true).unwrap();
    wait_until(|| fixture.output.chained_pipeline().is_none(), WAIT);
    fixture.finish();

    fixture.wait_for(|state| is_playing(state, "c"));
}

#[test]
fn the_last_track_of_the_queue_has_nothing_to_prefetch() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.settle();

    assert!(fixture.output.chained_pipeline().is_none());
}
