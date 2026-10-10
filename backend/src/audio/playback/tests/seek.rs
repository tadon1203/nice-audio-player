use super::*;

#[test]
fn a_seek_moves_the_position_and_keeps_the_session() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let seeked = harness.seek(1_500).unwrap();

    assert!(matches!(seeked, PlaybackSnapshot::Playing { .. }));
    let position = session(&seeked).position_ms;
    assert!((1_450..=1_550).contains(&position), "position {position}");
    assert_eq!(session(&seeked).seek_revision, 1);
    assert_eq!(session(&seeked).playback_id, session(&started).playback_id);
    assert!(harness.output.is_running());
}

#[test]
fn a_seek_while_paused_stays_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    let seeked = harness.seek(1_000).unwrap();

    assert!(matches!(seeked, PlaybackSnapshot::Paused { .. }));
    assert!(!harness.output.is_running());
}

#[test]
fn a_newer_seek_supersedes_one_still_prebuffering() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    let first = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 500,
        reply,
    });
    let second = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 2_000,
        reply,
    });

    assert_eq!(first.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
    let position = session(&harness.wait_for(&second).unwrap()).position_ms;
    assert!((1_950..=2_050).contains(&position), "position {position}");
}

#[test]
fn other_commands_are_answered_while_a_seek_prebuffers() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    let seek = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 1_000,
        reply,
    });
    let volume = harness.call(|reply| PlaybackCommand::SetVolume {
        volume: 0.25,
        reply,
    });

    assert_eq!(volume.unwrap().base().volume, 0.25);
    harness.wait_for(&seek).unwrap();
}

#[test]
fn seeking_needs_a_loaded_track() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.seek(1_000),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn seeking_to_the_end_stops() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let snapshot = harness.seek(5_000).unwrap();

    assert!(matches!(snapshot, PlaybackSnapshot::Stopped { .. }));
}

#[test]
fn seeking_past_the_end_plays_the_next_track_like_a_natural_finish() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    let snapshot = harness.seek(5_000).unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn seeks_reuse_the_one_output_stream_of_the_session() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    harness.seek(1_000).unwrap();
    harness.seek(2_000).unwrap();

    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 2);
    assert!(harness.output.is_running(), "a seek never stops the output");
}

#[test]
fn a_seek_while_paused_hands_over_the_queue_without_starting_the_output() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    harness.seek(1_000).unwrap();

    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 1);
    assert!(!harness.output.is_running());
}

#[test]
fn the_position_after_a_seek_counts_from_the_target_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.seek(1_000).unwrap();

    // The speakers got 0.5 s into the new queue.
    harness.output.set_played_frames(u64::from(SAMPLE_RATE) / 2);
    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    let position = harness.position().unwrap().position_ms;
    assert!((1_450..=1_550).contains(&position), "position {position}");
}

#[test]
fn a_seek_whose_decode_fails_keeps_the_session_and_its_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let seek = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 1_000,
        reply,
    });
    // The seek's pipeline is the second one the worker opened.
    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(2),
    });

    assert_eq!(seek.try_recv(), Ok(Err(PlaybackServiceError::DecodeFailed)));
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Playing { .. }));
    assert_eq!(
        session(&snapshot).playback_id,
        session(&started).playback_id
    );
    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 0);
}
