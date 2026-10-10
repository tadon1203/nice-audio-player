use super::*;

#[test]
fn a_file_that_cannot_be_read_is_skipped_to_the_next_one() {
    let mut harness = Harness::new();
    let mut tracks = missing(1);
    tracks.push(harness.track("b", 1));
    tracks.extend(missing(1));

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn when_every_file_fails_each_is_tried_once_and_the_queue_survives() {
    let mut harness = Harness::new();

    let result = harness.start(missing(3), 0);

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    assert_eq!(harness.queue_snapshot().upcoming_count, 0);
    assert_eq!(harness.queue_snapshot().history_count, 2);
    assert_eq!(
        harness.queue_snapshot().current.unwrap().title,
        "track-2.flac"
    );
    let current = harness.snapshot();
    assert!(matches!(
        current,
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
    assert!(current.base().can_go_previous);
    assert!(!current.base().can_go_next);
}

#[test]
fn skipping_failed_files_is_bounded_even_when_the_queue_repeats() {
    let mut harness = Harness::new();
    harness
        .call(|reply| PlaybackCommand::SetRepeatMode {
            mode: PlaybackRepeatMode::All,
            reply,
        })
        .unwrap();

    let result = harness.start(missing(4), 1);

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.history_count + 1 + queue.upcoming_count, 4);
}

#[test]
fn navigating_onto_a_broken_file_reports_the_failure_and_keeps_the_queue() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("a", 1)];
    tracks.extend(missing(1));
    harness.start(tracks, 0).unwrap();

    let result = harness.next();

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.history_count + 1 + queue.upcoming_count, 2);
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
}

#[test]
fn an_output_that_cannot_be_prepared_fails_without_skipping() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness
        .output
        .fail_next_prepare(AudioOutputError::UnsupportedConfiguration);

    let result = harness.start(tracks, 0);

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::UnsupportedOutputConfiguration
        ))
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::UnsupportedOutputConfiguration,
            ..
        }
    ));
}

#[test]
fn a_missing_output_device_is_reported_as_such() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness
        .output
        .fail_next_prepare(AudioOutputError::NoOutputDevice);

    assert_eq!(
        harness.start(tracks, 0),
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::NoOutputDevice
        ))
    );
}

#[test]
fn a_stream_that_will_not_start_fails_the_start_without_skipping() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness
        .output
        .fail_next_start(AudioOutputError::StreamStartFailed);

    let result = harness.start(tracks, 0);

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputStreamStartFailed
        ))
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn events_from_a_stream_the_worker_let_go_of_are_ignored() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let playing = harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::FinalFrames {
        pipeline: PipelineId(99),
        end_time: StreamInstant::new(0, 0),
    });
    harness.event(WorkerEvent::StreamFailed {
        stream: OutputStreamId(99),
        kind: StreamFailureKind::RuntimeFailed,
    });
    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(99),
    });
    harness.tick();

    assert_eq!(harness.snapshot(), playing);
}

#[test]
fn a_stream_failure_stops_with_the_queue_intact() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::RuntimeFailed);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::OutputStreamRuntimeFailed,
            ..
        }
    ));
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn resume_after_an_output_failure_retries_the_current_item_with_the_queue_intact() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.output.fail_stream(StreamFailureKind::RuntimeFailed);
    harness.deliver_pending();
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            skipping: false,
            ..
        }
    ));

    let snapshot = harness.resume().unwrap();

    assert!(is_playing(&snapshot, "a"));
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn a_failure_of_the_last_item_is_not_a_skip() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            skipping: false,
            ..
        }
    ));
}

#[test]
fn a_decode_failure_while_playing_moves_on_to_the_next_track() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));
}

#[test]
fn a_decode_failure_on_the_last_track_leaves_a_failed_player() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
}

#[test]
fn a_conversion_failure_while_playing_is_reported_with_its_own_code() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::ConversionFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::SampleRateConversionFailed,
            ..
        }
    ));
}

#[test]
fn a_failed_pause_fails_the_player() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness
        .output
        .fail_next_pause(AudioOutputError::StreamPauseFailed);

    let result = harness.pause();

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputStreamPauseFailed
        ))
    );
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::OutputStreamPauseFailed,
            ..
        }
    ));
}
