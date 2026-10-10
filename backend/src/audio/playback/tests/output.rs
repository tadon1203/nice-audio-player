use super::*;

#[test]
fn a_device_change_on_the_system_default_keeps_playing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::DeviceChanged);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Playing { .. }
    ));
}

#[test]
fn a_device_change_on_a_chosen_device_keeps_playing() {
    let mut harness = Harness::new();
    harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::DeviceChanged);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Playing { .. }
    ));
}

#[test]
fn a_device_switch_keeps_the_playback_id() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let switched = harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();

    assert_eq!(
        session(&switched).playback_id,
        session(&started).playback_id
    );
}

#[test]
fn a_failed_device_switch_keeps_the_saved_selection_and_the_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3), harness.track("b", 3)];
    harness.start(tracks, 0).unwrap();
    harness
        .output
        .fail_next_prepare(AudioOutputError::DeviceUnavailable);

    let result = harness.select_output(AudioOutputSelection::Device {
        device_id: "fake-other".into(),
    });

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputDeviceUnavailable
        ))
    );
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Failed { .. }));
    assert_eq!(
        snapshot.base().output_selection,
        AudioOutputSelection::SystemDefault
    );
    assert!(harness.preferences.lock().unwrap().is_empty());
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn the_output_can_be_chosen_while_stopped() {
    let mut harness = Harness::new();
    let selection = AudioOutputSelection::Device {
        device_id: "fake-other".into(),
    };

    let snapshot = harness.select_output(selection.clone()).unwrap();

    assert_eq!(snapshot.base().output_selection, selection);
    assert_eq!(harness.preferences.lock().unwrap().len(), 1);
    assert_eq!(harness.select_output(selection).unwrap(), snapshot);
    assert_eq!(harness.preferences.lock().unwrap().len(), 1, "no change");
}

#[test]
fn an_unusable_output_is_rejected() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.select_output(AudioOutputSelection::Device {
            device_id: String::new()
        }),
        Err(PlaybackServiceError::InvalidDeviceId)
    );
    assert_eq!(
        harness.select_output(AudioOutputSelection::Device {
            device_id: "unplugged".into()
        }),
        Err(PlaybackServiceError::OutputDeviceUnavailable)
    );
}

#[test]
fn the_output_cannot_be_chosen_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(
        harness.select_output(AudioOutputSelection::SystemDefault),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
    harness.wait_for(&start).unwrap();
}

#[test]
fn switching_the_output_while_paused_resumes_the_position_on_the_new_device() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(u64::from(SAMPLE_RATE));
    harness.pause().unwrap();

    let restarted = harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    harness.pump_until(|harness| {
        harness
            .snapshot()
            .session()
            .is_some_and(|session| session.seek_revision == 1)
    });

    assert!(matches!(restarted, PlaybackSnapshot::Paused { .. }));
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Paused { .. }));
    assert_eq!(session(&snapshot).output_device.name, "Other fake speakers");
    let position = session(&snapshot).position_ms;
    assert!((950..=1_050).contains(&position), "position {position}");
    assert_eq!(harness.preferences.lock().unwrap().len(), 1);
    assert_eq!(
        harness.output.prepared_selections().last(),
        Some(&AudioOutputSelection::Device {
            device_id: "fake-other".into()
        })
    );
}
