use super::*;

impl Harness {
    /// A WAV of `seconds` of silence in another format than `track` makes.
    fn track_in(&self, name: &str, rate: u32, channels: u16, seconds: usize) -> PlayableTrack {
        let path = self.files.file(&format!("{name}.wav"));
        write_pcm_i16_wav(
            &path,
            rate,
            channels,
            &vec![0; rate as usize * usize::from(channels) * seconds],
        );
        PlayableTrack {
            title: name.into(),
            ..library_track(
                name,
                ValidatedAudioFile {
                    path: path.to_string_lossy().into_owned(),
                    file_name: format!("{name}.wav"),
                    extension: "wav".into(),
                },
            )
        }
    }

    /// Ticks until the next track is chained to the stream.
    fn prefetch_next(&mut self) {
        self.tick();
        self.pump_until(|harness| harness.output.chained_pipeline().is_some());
    }

    /// Lets a prefetch that cannot be chained finish trying.
    fn settle_prefetch(&mut self) {
        self.tick();
        std::thread::sleep(Duration::from_millis(150));
        self.deliver_pending();
    }

    /// The stream heard the end of the playing track.
    fn hear_the_end(&mut self) {
        self.output.finish_playback();
        self.deliver_pending();
        self.tick();
    }
}

#[test]
fn a_track_of_the_same_format_follows_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let first = harness.start(tracks, 0).unwrap();

    harness.prefetch_next();
    harness.hear_the_end();

    let snapshot = harness.snapshot();
    assert!(is_playing(&snapshot, "b"));
    assert_ne!(
        session(&snapshot).playback_id,
        session(&first).playback_id,
        "each track is its own playback"
    );
    assert_eq!(session(&snapshot).position_ms, 0);
    assert_eq!(harness.output.streams_opened(), 1, "the stream is kept");
    assert_eq!(harness.output.adoptions(), 1);
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
    assert!(harness.output.is_running());
}

#[test]
fn a_track_of_another_sample_rate_reopens_the_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track_in("b", 48_000, 2, 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    assert_eq!(harness.output.chained_pipeline(), None);
    harness.hear_the_end();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(
        harness.output.streams_opened(),
        2,
        "a short gap is accepted"
    );
    assert_eq!(harness.output.adoptions(), 0);
    let snapshot = harness.snapshot();
    assert_eq!(session(&snapshot).source_sample_rate, 48_000);
}

#[test]
fn a_different_channel_count_reopens_the_stream_too() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track_in("b", SAMPLE_RATE, 2, 1),
    ];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    harness.hear_the_end();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(harness.output.streams_opened(), 2);
}

#[test]
fn a_long_track_is_not_prefetched_until_its_last_ten_seconds() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 30), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness
        .output
        .set_played_frames(21 * u64::from(SAMPLE_RATE));
    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.prefetch_next();
}

#[test]
fn putting_a_track_next_discards_the_prefetch_and_plays_it_next() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    let track_ids = harness.register(vec![harness.track("d", 1)]);
    harness
        .call(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next: true,
            reply,
        })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None, "b is not next now");

    harness.prefetch_next();
    harness.hear_the_end();

    assert!(is_playing(&harness.snapshot(), "d"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn repeat_one_discards_the_prefetch_and_repeats_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .call(|reply| PlaybackCommand::SetRepeatMode {
            mode: PlaybackRepeatMode::One,
            reply,
        })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None, "b is not next now");

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "a"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn turning_shuffle_on_discards_the_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
        harness.track("d", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .call(|reply| PlaybackCommand::SetShuffle {
            enabled: true,
            reply,
        })
        .unwrap();
    let next = harness.queue_snapshot().upcoming[0].title.clone();
    harness.prefetch_next();
    harness.hear_the_end();

    assert!(is_playing(&harness.snapshot(), &next), "{next} plays next");
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn removing_the_next_track_discards_the_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();
    let next = harness.queue_snapshot().upcoming[0].id.clone();

    harness
        .call(|reply| PlaybackCommand::RemoveQueueItem { id: next, reply })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "c"));
}

#[test]
fn a_seek_discards_the_prefetch_and_the_end_opens_it_again() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness.seek(500).unwrap();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn skipping_during_the_handover_window_plays_the_next_track() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness.next().unwrap();

    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn pausing_in_the_handover_window_holds_the_next_track_back() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();
    harness.output.finish_playback();
    harness.deliver_pending();
    harness.pause().unwrap();
    harness.tick();
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Paused { .. }
    ));

    harness.resume().unwrap();
    harness.tick();

    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn a_device_change_in_the_handover_window_prefetches_again_on_the_new_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    assert_eq!(harness.output.streams_opened(), 2);
    assert_eq!(harness.output.chained_pipeline(), None);
    // The restart seeks back to where it was before anything else follows.
    std::thread::sleep(Duration::from_millis(150));
    harness.deliver_pending();

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 2);
}

#[test]
fn the_last_track_of_the_queue_has_nothing_to_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();

    assert_eq!(harness.output.chained_pipeline(), None);
}
