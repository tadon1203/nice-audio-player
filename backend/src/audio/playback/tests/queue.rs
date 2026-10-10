use super::*;

#[test]
fn queue_edits_are_rejected_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let extra = vec![harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    let extra_ids = harness.register(extra);
    let result = harness.call(|reply| PlaybackCommand::Enqueue {
        track_ids: extra_ids,
        next: false,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::QueueBusy));
    harness.wait_for(&start).unwrap();
}

#[test]
fn enqueueing_on_an_empty_queue_starts_playback_inside_the_worker() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let track_ids = harness.register(tracks);

    let queue = harness
        .call(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next: false,
            reply,
        })
        .unwrap();

    assert_eq!(queue.current.map(|item| item.title), Some("a".into()));
    assert_eq!(queue.upcoming_count, 1);
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "a"));
}

#[test]
fn enqueueing_nothing_on_an_empty_queue_is_refused() {
    let mut harness = Harness::new();

    let result = harness.call(|reply| PlaybackCommand::Enqueue {
        track_ids: Vec::new(),
        next: false,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::InvalidPlaybackState));
}

fn restore(harness: &mut Harness) -> Answer<PlaybackSnapshot> {
    harness.call(|reply| PlaybackCommand::RestorePreviousQueue { reply })
}

#[test]
fn replacing_the_queue_can_be_undone_in_one_step() {
    let mut harness = Harness::new();
    let first = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(first, 0).unwrap();
    assert!(!harness.queue_snapshot().can_restore_previous);

    let second = vec![harness.track("c", 1)];
    harness.start(second, 0).unwrap();
    assert!(harness.queue_snapshot().can_restore_previous);

    let restored = restore(&mut harness).unwrap();

    assert!(
        is_playing(&restored, "a"),
        "the item that was current plays again"
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
    assert!(
        !harness.queue_snapshot().can_restore_previous,
        "one step back, no further"
    );
    assert_eq!(
        restore(&mut harness),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn there_is_nothing_to_undo_after_starting_from_an_empty_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    assert!(!harness.queue_snapshot().can_restore_previous);
    assert_eq!(
        restore(&mut harness),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn clearing_upcoming_can_be_undone_without_restarting_the_track() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    let playing = harness.start(tracks, 0).unwrap();
    harness
        .call(|reply| PlaybackCommand::ClearQueue { reply })
        .unwrap();
    assert_eq!(harness.queue_titles(), ["a"]);
    assert!(harness.queue_snapshot().can_restore_previous);

    let restored = restore(&mut harness).unwrap();

    assert_eq!(harness.queue_titles(), ["a", "b", "c"]);
    assert_eq!(
        session(&restored).playback_id,
        session(&playing).playback_id,
        "the track that kept playing is not restarted"
    );
}

#[test]
fn an_undone_queue_follows_the_shuffle_chosen_since() {
    let mut harness = Harness::new();
    let first = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(first, 0).unwrap();
    let second = vec![harness.track("c", 1)];
    harness.start(second, 0).unwrap();
    harness
        .call(|reply| PlaybackCommand::SetShuffle {
            enabled: true,
            reply,
        })
        .unwrap();

    restore(&mut harness).unwrap();

    let queue = harness.queue_snapshot();
    assert!(queue.shuffle_enabled);
    assert_eq!(queue.current.map(|item| item.title), Some("a".into()));
    assert_eq!(queue.upcoming_count, 1);
}

// ---- lazy resolution ----

#[test]
fn starting_reads_only_the_part_of_a_huge_queue_that_is_shown() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("first", 1)];
    tracks.extend((0..4_999).map(|i| named_track(&format!("t{i}"))));

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "first"));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.upcoming_count, 4_999);
    assert_eq!(queue.upcoming.len(), UPCOMING_IN_SNAPSHOT);
    assert!(
        harness.library.reads() <= UPCOMING_IN_SNAPSHOT + 2,
        "read {} tracks for a queue of 5000",
        harness.library.reads()
    );
}

#[test]
fn the_rows_further_down_a_long_queue_are_read_when_asked_for() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("first", 1)];
    tracks.extend((0..999).map(|i| named_track(&format!("t{i}"))));
    harness.start(tracks, 0).unwrap();
    let before = harness.library.reads();

    let window = harness.queue_snapshot().window(500, 50);

    assert_eq!(window.offset, 500);
    assert_eq!(window.items.len(), 50);
    assert_eq!(window.items[0].title, "t500.flac");
    assert_eq!(harness.library.reads() - before, 50);
}

#[test]
fn a_track_that_left_the_library_after_the_start_is_dropped_where_it_is_read() {
    let mut harness = Harness::new();
    let first = harness.track("first", 1);
    let mut tracks = vec![first];
    tracks.extend(["x", "gone", "y"].map(named_track));
    let track_ids = harness.register(tracks);
    harness.library.remove("gone");

    harness
        .call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index: 0,
            reply,
        })
        .unwrap();

    let queue = harness.queue_snapshot();
    assert_eq!(queue.upcoming_count, 2, "the missing item is not counted");
    assert_eq!(
        harness.queue_titles(),
        ["first", "x.flac", "y.flac"],
        "nor shown"
    );
}

#[test]
fn a_current_track_that_left_the_library_is_skipped() {
    let mut harness = Harness::new();
    let tracks = vec![named_track("gone"), harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    harness.library.remove("gone");

    let snapshot = harness
        .call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index: 0,
            reply,
        })
        .unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().history_count, 0);
}

#[test]
fn when_every_track_has_left_the_library_the_start_is_refused() {
    let mut harness = Harness::new();
    let track_ids = harness.register(vec![named_track("gone")]);
    harness.library.remove("gone");

    let result = harness.call(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::TrackUnavailable));
    assert!(harness.queue_snapshot().current.is_none());
}

#[test]
fn a_window_leaves_out_a_track_that_has_left_the_library_since() {
    let library = Arc::new(FakeTracks::default());
    let tracks = resolver_of(&library);
    let ids: Vec<String> = (0..10).map(|i| format!("t{i}")).collect();
    for id in &ids {
        library.add(named_track(id));
    }
    let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
    queue
        .replace(ids, 0, &mut StdRng::seed_from_u64(1))
        .unwrap();
    let snapshot = PlaybackQueueSnapshot::of(1, &queue, &tracks, false);
    tracks.forget();
    library.remove("t4");

    let window = snapshot.window(0, 20);

    assert_eq!(window.items.len(), 8, "nine upcoming, one of them gone");
    assert!(window.items.iter().all(|item| item.track_id != "t4"));
}

#[test]
fn a_long_queue_snapshot_carries_a_prefix_and_serves_the_rest_in_windows() {
    let library = Arc::new(FakeTracks::default());
    let tracks = resolver_of(&library);
    let total = UPCOMING_IN_SNAPSHOT + 150;
    let ids: Vec<String> = (0..total + 61).map(|i| format!("t{i}")).collect();
    for id in &ids {
        library.add(named_track(id));
    }
    let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
    queue
        .replace(ids, 60, &mut StdRng::seed_from_u64(1))
        .unwrap();

    let snapshot = PlaybackQueueSnapshot::of(7, &queue, &tracks, false);

    assert_eq!(snapshot.history.len(), 50);
    assert_eq!(snapshot.history_count, 60);
    assert_eq!(
        snapshot.history.last().map(|i| i.title.as_str()),
        Some("t59.flac")
    );
    assert_eq!(snapshot.upcoming.len(), UPCOMING_IN_SNAPSHOT);
    assert_eq!(snapshot.upcoming_count as usize, total);
    assert_eq!(library.reads(), 50 + 1 + UPCOMING_IN_SNAPSHOT);
    let window = snapshot.window(UPCOMING_IN_SNAPSHOT, 500);
    assert_eq!(window.revision, 7);
    assert_eq!(window.offset as usize, UPCOMING_IN_SNAPSHOT);
    assert_eq!(window.items.len(), 150);
    assert_eq!(window.items[0].title, "t261.flac");
    assert!(snapshot.window(total + 10, 5).items.is_empty());
}

/// A track whose file does not exist: fine to queue and show, unplayable.
fn named_track(name: &str) -> PlayableTrack {
    library_track(
        name,
        ValidatedAudioFile {
            path: format!("C:/music/{name}.flac"),
            file_name: format!("{name}.flac"),
            extension: "flac".into(),
        },
    )
}
