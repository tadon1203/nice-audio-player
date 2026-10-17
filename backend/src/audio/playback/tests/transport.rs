use super::*;
use crate::ids::PlaybackId;

#[test]
fn a_start_plays_as_soon_as_the_prebuffer_is_ready() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "a"));
    assert_eq!(session(&snapshot).playback_id, PlaybackId::first());
    assert_eq!(session(&snapshot).duration_ms, Some(1_000));
    assert_eq!(session(&snapshot).output_device.name, "Fake speakers");
    assert!(harness.output.is_running());
    assert_eq!(harness.snapshot(), snapshot);
}

#[test]
fn the_worker_has_a_deadline_only_while_a_track_is_playing() {
    let mut harness = Harness::new();
    assert!(harness.worker.next_deadline().is_none(), "idle");

    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();
    assert!(harness.worker.next_deadline().is_some(), "playing");

    harness.pause().unwrap();
    assert!(harness.worker.next_deadline().is_none(), "paused");

    harness.start(missing(1), 0).unwrap_err();
    assert!(harness.worker.next_deadline().is_none(), "failed");
}

#[test]
fn a_playing_worker_wakes_only_a_few_times_per_second() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 60)];
    harness.start(tracks, 0).unwrap();
    harness.tick();

    let end = Instant::now() + Duration::from_secs(2);
    let mut wakes = 0;
    while let Some(deadline) = harness.worker.next_deadline() {
        if deadline >= end {
            break;
        }
        std::thread::sleep(deadline.saturating_duration_since(Instant::now()));
        harness.tick();
        wakes += 1;
    }

    assert!(wakes <= 4, "woke {wakes} times in 2 s");
}

#[test]
fn a_start_through_a_service_thread_needs_no_poll() {
    let output = FakeOutput::new();
    let library = Arc::new(FakeTracks::default());
    let directory = TestDirectory::new();
    let path = directory.file("a.wav");
    write_pcm_i16_wav(&path, SAMPLE_RATE, 1, &vec![0; SAMPLE_RATE as usize]);
    library.add(library_track(
        track_id_of("a"),
        ValidatedAudioFile {
            path,
            file_name: "a.wav".into(),
            extension: "wav".into(),
        },
    ));
    let service = PlaybackService::start_with_backend(
        crate::messages::null_message_sink(),
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
        resolver_of(&library),
        Arc::new(|_| {}),
        Box::new(output.clone()),
    )
    .expect("worker should start");

    // The worker sleeps in a blocking receive while idle; only an event can wake it for this.
    let snapshot = service
        .handle()
        .start(vec![track_id_of("a")], 0)
        .unwrap()
        .value;

    assert!(matches!(snapshot, PlaybackSnapshot::Playing { .. }));
    assert!(output.is_running());
    service.shutdown();
}

#[test]
fn navigating_while_paused_starts_the_next_track_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    let snapshot = harness.next().unwrap();

    assert!(
        matches!(&snapshot, PlaybackSnapshot::Paused { session, .. } if session.item.track.core.title == "b")
    );
    assert!(!harness.output.is_running());
}

#[test]
fn volume_and_next_are_answered_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    let volume = harness.call(|reply| PlaybackCommand::SetVolume {
        volume: 0.25,
        reply,
    });
    let next = harness.next();

    assert_eq!(volume.unwrap().value.base().volume, 0.25);
    assert!(is_playing(&next.unwrap(), "b"));
    assert_eq!(start.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
}

#[test]
fn a_superseded_start_is_answered_instead_of_dropped() {
    let mut harness = Harness::new();
    let first_tracks = vec![harness.track("a", 1)];
    let second_tracks = vec![harness.track("b", 1)];

    let first_ids = harness.register(first_tracks);
    let second_ids = harness.register(second_tracks);
    let first = harness.send(|reply| PlaybackCommand::Start {
        track_ids: first_ids,
        start_index: 0,
        reply,
    });
    let second = harness.send(|reply| PlaybackCommand::Start {
        track_ids: second_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(first.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
    assert!(is_playing(&harness.wait_for(&second).unwrap().value, "b"));
}

#[test]
fn pause_reads_the_newest_position_and_resume_continues() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(22_050);

    let paused = harness.pause().unwrap();

    assert!(matches!(paused, PlaybackSnapshot::Paused { .. }));
    assert_eq!(session(&paused).position_ms, 500);
    assert!(!harness.output.is_running());

    let resumed = harness.resume().unwrap();
    assert!(matches!(resumed, PlaybackSnapshot::Playing { .. }));
    assert_eq!(session(&resumed).position_ms, 500);
    assert!(harness.output.is_running());
}

#[test]
fn pausing_a_paused_track_changes_nothing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let paused = harness.pause().unwrap();

    assert_eq!(harness.pause().unwrap(), paused);
}

#[test]
fn pause_and_resume_need_a_loaded_track() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.pause(),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
    assert_eq!(
        harness.resume(),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn a_tick_publishes_the_position_the_speakers_reached_without_a_new_snapshot() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    let started = harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(44_100);
    let sent = harness.sent().len();

    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    assert_eq!(harness.position().unwrap().position_ms, 1_000);
    assert_eq!(
        harness.position().unwrap().playback_id,
        session(&started).playback_id
    );
    assert_eq!(harness.sent()[sent..], [Sent::Position]);
    assert_eq!(harness.snapshot(), started);
}

#[test]
fn a_tick_inside_the_publish_interval_publishes_nothing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    let started = harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(44_100);
    let sent = harness.sent().len();

    harness.tick();

    assert_eq!(harness.snapshot(), started);
    assert_eq!(harness.sent().len(), sent);
}

#[test]
fn a_state_change_carries_the_newest_position() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(22_050);

    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap()
        .value;

    assert_eq!(session(&muted).position_ms, 500);
    assert_eq!(harness.position().unwrap().position_ms, 500);
}

#[test]
fn previous_becomes_available_once_the_track_has_played_a_while() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 10)];
    let started = harness.start(tracks, 0).unwrap();
    assert!(!started.base().can_go_previous);
    harness.output.set_played_frames(SAMPLE_RATE as u64 * 5);

    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    assert!(harness.snapshot().base().can_go_previous);
    assert_eq!(
        harness.sent().last(),
        Some(&Sent::State(StateTopic::Playback))
    );
}

#[test]
fn a_finished_track_moves_on_to_the_next_one() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.finish_playback();
    harness.deliver_pending();
    harness.tick();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(harness.queue_snapshot().current.unwrap().core.title, "b");
}

#[test]
fn the_last_track_finishing_stops_and_clears_the_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.finish_playback();
    harness.deliver_pending();
    harness.tick();

    let PlaybackSnapshot::Stopped { item, .. } = harness.snapshot() else {
        panic!("the player must stop");
    };
    assert_eq!(item.unwrap().track.core.title, "a");
    assert!(harness.queue_snapshot().current.is_none());
}

#[test]
fn a_paused_track_does_not_finish_naturally() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.output.finish_playback();
    harness.deliver_pending();
    harness.pause().unwrap();

    harness.tick();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Paused { .. }
    ));
}

#[test]
fn the_session_carries_the_source_format_of_the_loaded_track() {
    let mut harness = Harness::new();
    let mut known = harness.track("known", 1);
    known.file_format = Some("FLAC".into());
    known.bit_depth = Some(24);
    known.bitrate_kbps = Some(1_411);
    let unknown = harness.track("unknown", 1);

    let snapshot = harness.start(vec![known, unknown], 0).unwrap();
    assert_eq!(session(&snapshot).source_format, "FLAC");
    assert_eq!(session(&snapshot).source_bit_depth, Some(24));
    assert_eq!(session(&snapshot).source_bitrate_kbps, Some(1_411));

    let snapshot = harness.next().unwrap();
    assert_eq!(
        session(&snapshot).source_format,
        "wav",
        "a file the library does not know is named by its extension"
    );
    assert_eq!(session(&snapshot).source_bit_depth, None);
}

#[test]
fn started_by_names_what_started_each_session() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 5),
        harness.track("b", 5),
        harness.track("c", 5),
    ];
    let jumped = harness.start(tracks, 0).unwrap();
    assert_eq!(session(&jumped).started_by, SessionStartedBy::Jump);

    let next = harness.next().unwrap();
    assert_eq!(session(&next).started_by, SessionStartedBy::Next);

    let previous = harness
        .call(|reply| PlaybackCommand::Previous { reply })
        .unwrap()
        .value;
    assert_eq!(session(&previous).started_by, SessionStartedBy::Previous);
}

#[test]
fn an_automatic_advance_is_auto_and_a_seek_keeps_the_start() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 5)];
    harness.start(tracks, 0).unwrap();

    harness.output.finish_playback();
    harness.deliver_pending();
    harness.tick();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));
    assert_eq!(
        session(&harness.snapshot()).started_by,
        SessionStartedBy::Auto
    );

    let sought = harness.seek(2_000).unwrap();
    assert_eq!(session(&sought).started_by, SessionStartedBy::Auto);
}

#[test]
fn pausing_while_a_track_loads_starts_it_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    harness.pause().unwrap();
    let loaded = harness.wait_for(&start).unwrap().value;

    assert!(matches!(loaded, PlaybackSnapshot::Paused { .. }));
    assert!(!harness.output.is_running());
}

#[test]
fn resuming_while_a_paused_start_loads_plays_it() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();
    let start = harness.send(|reply| PlaybackCommand::Next { reply });

    harness.resume().unwrap();

    assert!(is_playing(&harness.wait_for(&start).unwrap().value, "b"));
}

#[test]
fn previous_restarts_a_track_that_has_played_for_a_while() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 5), harness.track("b", 5)];
    harness.start(tracks, 1).unwrap();
    harness.output.set_played_frames(4 * u64::from(SAMPLE_RATE));
    harness.pause().unwrap();

    let restarted = harness
        .call(|reply| PlaybackCommand::Previous { reply })
        .unwrap()
        .value;

    assert!(
        matches!(&restarted, PlaybackSnapshot::Paused { session, .. } if session.item.track.core.title == "b")
    );
    assert!(session(&restarted).position_ms < 100);
}

#[test]
fn navigation_availability_follows_the_queue_and_the_restart_rule() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 5), harness.track("b", 5)];
    let early = harness.start(tracks, 0).unwrap();
    assert!(!early.base().can_go_previous);
    assert!(early.base().can_go_next);

    harness.output.set_played_frames(4 * u64::from(SAMPLE_RATE));
    let late = harness.pause().unwrap();
    assert!(late.base().can_go_previous, "previous restarts the track");
}

/// A file whose name holds an unpaired UTF-16 surrogate: Windows allows it, UTF-8 cannot hold it.
/// Its path must reach the file system as it is, or the file cannot be opened.
#[cfg(windows)]
#[test]
fn a_file_whose_name_is_not_unicode_plays() {
    use std::os::windows::ffi::OsStringExt;

    let mut harness = Harness::new();
    let name = std::ffi::OsString::from_wide(&[0x61, 0xD800, 0x2E, 0x77, 0x61, 0x76]);
    let mut path = harness.files.file("placeholder.wav");
    path.set_file_name(&name);
    write_pcm_i16_wav(&path, SAMPLE_RATE, 1, &vec![0; SAMPLE_RATE as usize]);
    let mut track = library_track(
        track_id_of("odd"),
        ValidatedAudioFile {
            path,
            file_name: name.to_string_lossy().into_owned(),
            extension: "wav".into(),
        },
    );
    track.track.core.title = "odd".into();

    let snapshot = harness.start(vec![track], 0).unwrap();

    assert!(is_playing(&snapshot, "odd"));
}

#[test]
fn published_revisions_grow_and_commands_that_change_nothing_keep_theirs() {
    let mut harness = Harness::new();

    let changed = harness
        .call(|reply| PlaybackCommand::SetVolume { volume: 0.5, reply })
        .unwrap();
    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();
    let muted_again = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();

    assert_eq!(changed.revision, 1);
    assert_eq!(muted.revision, 2);
    assert_eq!(muted_again.revision, 2);
    assert_eq!(harness.versioned_snapshot().revision, 2);
}
