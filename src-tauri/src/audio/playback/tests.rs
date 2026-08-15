use super::super::devices::AudioOutputSelection;
use super::super::output::AudioOutputError;
use super::super::output::StreamFailureKind;
use super::super::volume::VolumeState;
use super::{
    completion_time_reached, duration_ms, duration_to_frames, failed_snapshot, frame_to_millis,
    millis_to_frame, output_failure_code, pause_action, resume_action, should_finish,
    should_publish_position, signal_stream_id, source_to_output_frame, start_failure_snapshot,
    stream_signal_action, OutputSignal, OutputStreamId, PlaybackControlAction, PlaybackFailureCode,
    PlaybackSequence, PlaybackService, PlaybackServiceError, PlaybackSnapshot, PlaybackWorker,
    StreamSignalAction,
};
use cpal::StreamInstant;
use std::sync::{mpsc, Arc, RwLock};

#[test]
fn processing_info_derives_resampling_from_rates() {
    let equal = super::PlaybackProcessingInfo {
        channel_conversion: super::PlaybackChannelConversion::None,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
    };
    let different = super::PlaybackProcessingInfo {
        source_sample_rate: 44_100,
        output_sample_rate: 48_000,
        ..equal
    };
    assert!(!equal.resampling_active());
    assert!(different.resampling_active());
}

#[test]
fn classifies_stream_signals_by_selection_and_failure_kind() {
    assert_eq!(
        stream_signal_action(
            &AudioOutputSelection::SystemDefault,
            StreamFailureKind::DeviceChanged
        ),
        StreamSignalAction::RefreshDefaultDevice
    );
    assert_eq!(
        stream_signal_action(
            &AudioOutputSelection::Device {
                device_id: "device".into()
            },
            StreamFailureKind::DeviceChanged
        ),
        StreamSignalAction::PreservePlayback
    );
    assert_eq!(
        stream_signal_action(
            &AudioOutputSelection::SystemDefault,
            StreamFailureKind::DeviceUnavailable
        ),
        StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
    );
    assert_eq!(
        stream_signal_action(
            &AudioOutputSelection::SystemDefault,
            StreamFailureKind::RuntimeFailed
        ),
        StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
    );
}

#[test]
fn serializes_playing_snapshot_with_camel_case_playback_id() {
    let snapshot =
        PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 1_000, Some(60_000));

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({ "status": "playing", "revision": 0, "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" }, "playbackId": "1", "positionMs": 1_000, "durationMs": 60_000, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }, "outputDevice": { "id": "test-device", "name": "Test device" }, "channelConversion": "none", "sourceSampleRate": 44_100, "outputSampleRate": 44_100, "resamplingActive": false, "canGoPrevious": false, "canGoNext": false })
    );
}

#[test]
fn serializes_paused_snapshot_with_camel_case_playback_id() {
    let snapshot =
        PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 1_000, Some(60_000));

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({ "status": "paused", "revision": 0, "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" }, "playbackId": "1", "positionMs": 1_000, "durationMs": 60_000, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }, "outputDevice": { "id": "test-device", "name": "Test device" }, "channelConversion": "none", "sourceSampleRate": 44_100, "outputSampleRate": 44_100, "resamplingActive": false, "canGoPrevious": false, "canGoNext": false })
    );
}

#[test]
fn omits_missing_playback_id_from_failed_snapshot() {
    let snapshot = PlaybackSnapshot::failed(
        VolumeState::default(),
        None,
        PlaybackFailureCode::NoOutputDevice,
    );

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({
            "status": "failed",
            "revision": 0,
            "file": null,
            "error": "noOutputDevice",
            "volume": 1.0,
            "muted": false,
            "outputSelection": { "kind": "systemDefault" },
            "canGoPrevious": false,
            "canGoNext": false
        })
    );
}

#[test]
fn stop_is_stopped_when_called_twice() {
    let mut worker = test_worker(PlaybackSnapshot::playing(
        VolumeState::default(),
        "1".into(),
        0,
        Some(60_000),
    ));

    let first = worker.stop();
    assert!(matches!(
        first,
        PlaybackSnapshot::Stopped { revision: 1, .. }
    ));
    assert_eq!(worker.stop(), first);
    assert_eq!(worker.current(), first);
    assert!(worker.active.is_none());
}

#[test]
fn stop_from_paused_is_stopped() {
    let mut worker = test_worker(PlaybackSnapshot::paused(
        VolumeState::default(),
        "1".into(),
        10_000,
        Some(60_000),
    ));

    let stopped = worker.stop();
    assert!(matches!(
        stopped,
        PlaybackSnapshot::Stopped { revision: 1, .. }
    ));
    assert_eq!(worker.current(), stopped);
}

#[test]
fn volume_commands_update_snapshot_without_rebuilding_playback() {
    let mut worker = test_worker(PlaybackSnapshot::playing(
        VolumeState::default(),
        "1".into(),
        250,
        Some(60_000),
    ));

    let changed = worker.set_volume(0.5).expect("valid volume must succeed");
    assert_eq!(changed_volume(&changed), (0.5, false));
    assert_eq!(worker.effective_gain.load(), 0.5);

    let before_invalid = worker.current();
    assert_eq!(
        worker.set_volume(f32::NAN),
        Err(PlaybackServiceError::InvalidVolume)
    );
    assert_eq!(worker.current(), before_invalid);
    assert_eq!(worker.effective_gain.load(), 0.5);

    let muted = worker.mute();
    assert_eq!(changed_volume(&muted), (0.5, true));
    assert_eq!(worker.effective_gain.load(), 0.0);
    assert_eq!(changed_volume(&worker.mute()), (0.5, true));
    assert_eq!(changed_volume(&worker.unmute()), (0.5, false));
    assert_eq!(worker.effective_gain.load(), 0.5);
}

#[test]
fn published_snapshots_are_monotonic_and_idempotent_commands_keep_revision() {
    let mut worker = test_worker(PlaybackSnapshot::stopped(VolumeState::default()));

    let changed = worker.set_volume(0.5).expect("valid volume must succeed");
    let muted = worker.mute();
    let muted_again = worker.mute();

    assert_eq!(snapshot_revision(&changed), 1);
    assert_eq!(snapshot_revision(&muted), 2);
    assert_eq!(snapshot_revision(&muted_again), 2);
}

#[test]
fn stopped_snapshot_retains_the_last_played_file_identity() {
    let mut worker = test_worker(PlaybackSnapshot::paused(
        VolumeState::default(),
        "1".into(),
        1_000,
        Some(60_000),
    ));
    worker.current_file = Some(super::test_file());

    let PlaybackSnapshot::Stopped {
        file: Some(file), ..
    } = worker.stop()
    else {
        panic!("stop must retain a file identity");
    };
    assert_eq!(file.file_name, "test.flac");
}

#[test]
fn volume_state_is_present_in_initial_stopped_snapshot() {
    let service = PlaybackService::start().expect("worker should start");
    assert_eq!(
        serde_json::to_value(service.snapshot()).unwrap(),
        serde_json::json!({"status": "stopped", "revision": 0, "file": null, "volume": 1.0, "muted": false, "outputSelection": { "kind": "systemDefault" }, "canGoPrevious": false, "canGoNext": false})
    );
    service.shutdown();
}

#[test]
fn ignores_final_frames_from_another_stream() {
    let signal = OutputSignal::FinalFramesSubmitted {
        stream_id: OutputStreamId(2),
        end_time: StreamInstant::new(10, 0),
    };

    assert_ne!(signal_stream_id(&signal), OutputStreamId(1));
}

#[test]
fn ignores_stream_failure_from_another_stream() {
    let signal = OutputSignal::StreamFailed {
        stream_id: OutputStreamId(2),
        kind: StreamFailureKind::RuntimeFailed,
    };
    assert_ne!(signal_stream_id(&signal), OutputStreamId(1));
}

#[test]
fn matching_stream_failure_is_failed() {
    assert_eq!(
        failed_snapshot(
            OutputStreamId(1),
            PlaybackFailureCode::OutputStreamRuntimeFailed
        ),
        PlaybackSnapshot::failed(
            VolumeState::default(),
            Some("1".into()),
            PlaybackFailureCode::OutputStreamRuntimeFailed
        )
    );
}

#[test]
fn matching_completion_timing_failure_is_failed() {
    assert_eq!(
        failed_snapshot(
            OutputStreamId(1),
            PlaybackFailureCode::CompletionTimingFailed
        ),
        PlaybackSnapshot::failed(
            VolumeState::default(),
            Some("1".into()),
            PlaybackFailureCode::CompletionTimingFailed
        )
    );
}

#[test]
fn stops_when_completion_time_is_reached() {
    assert!(!completion_time_reached(
        StreamInstant::new(10, 0),
        StreamInstant::new(9, 999_999_999)
    ));
    assert!(completion_time_reached(
        StreamInstant::new(10, 0),
        StreamInstant::new(10, 0)
    ));
}

#[test]
fn pause_and_resume_actions_are_idempotent_or_invalid_by_snapshot() {
    let playing = PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 0, Some(60_000));
    let paused = PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 10_000, Some(60_000));
    let stopped = PlaybackSnapshot::stopped(VolumeState::default());
    let failed = failed_snapshot(
        OutputStreamId(1),
        PlaybackFailureCode::OutputStreamRuntimeFailed,
    );

    assert_eq!(pause_action(&playing), PlaybackControlAction::Change);
    assert_eq!(pause_action(&paused), PlaybackControlAction::Idempotent);
    assert_eq!(pause_action(&stopped), PlaybackControlAction::Invalid);
    assert_eq!(pause_action(&failed), PlaybackControlAction::Invalid);
    assert_eq!(resume_action(&paused), PlaybackControlAction::Change);
    assert_eq!(resume_action(&playing), PlaybackControlAction::Idempotent);
    assert_eq!(resume_action(&stopped), PlaybackControlAction::Invalid);
    assert_eq!(resume_action(&failed), PlaybackControlAction::Invalid);
}

#[test]
fn paused_playback_does_not_finish_naturally() {
    let paused = PlaybackSnapshot::paused(VolumeState::default(), "1".into(), 10_000, Some(60_000));
    let end = StreamInstant::new(10, 0);

    assert!(!should_finish(&paused, Some(end), end));
    assert!(should_finish(
        &PlaybackSnapshot::playing(VolumeState::default(), "1".into(), 0, Some(60_000)),
        Some(end),
        end
    ));
}

#[test]
fn maps_pause_and_resume_output_failures() {
    assert_eq!(
        output_failure_code(AudioOutputError::StreamPauseFailed),
        PlaybackFailureCode::OutputStreamPauseFailed
    );
    assert_eq!(
        output_failure_code(AudioOutputError::StreamResumeFailed),
        PlaybackFailureCode::OutputStreamResumeFailed
    );
}

#[test]
fn preserves_frontend_mapping_for_output_configuration_errors() {
    assert_eq!(
        output_failure_code(AudioOutputError::UnsupportedConfiguration),
        PlaybackFailureCode::UnsupportedOutputConfiguration
    );
    assert_eq!(
        output_failure_code(AudioOutputError::StreamConfigurationUnsupported),
        PlaybackFailureCode::UnsupportedOutputConfiguration
    );
    assert_eq!(
        output_failure_code(AudioOutputError::StreamBuildFailed),
        PlaybackFailureCode::OutputStreamBuildFailed
    );
}

#[test]
fn start_failure_preserves_existing_playback() {
    assert_eq!(
        start_failure_snapshot(
            true,
            OutputStreamId(2),
            PlaybackFailureCode::OutputStreamBuildFailed,
            VolumeState::default(),
            AudioOutputSelection::SystemDefault,
            None,
        ),
        None
    );
}

#[test]
fn start_failure_without_playback_is_failed() {
    assert_eq!(
        start_failure_snapshot(
            false,
            OutputStreamId(1),
            PlaybackFailureCode::OutputStreamStartFailed,
            VolumeState::default(),
            AudioOutputSelection::SystemDefault,
            None,
        ),
        Some(PlaybackSnapshot::failed(
            VolumeState::default(),
            Some("1".into()),
            PlaybackFailureCode::OutputStreamStartFailed
        ))
    );
}

#[test]
fn navigation_decoder_failure_clears_the_sequence_and_publishes_failed_state() {
    let mut worker = test_worker(PlaybackSnapshot::playing(
        VolumeState::default(),
        "1".into(),
        0,
        Some(60_000),
    ));
    worker.sequence = PlaybackSequence::new(vec![super::test_file(), super::test_file()]);
    let (reply, receiver) = mpsc::sync_channel(1);

    worker.navigate(true, reply);

    assert_eq!(receiver.recv().unwrap(), Err(PlaybackServiceError::Decode));
    assert!(worker.sequence.is_none());
    assert!(matches!(
        worker.current(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            can_go_previous: false,
            can_go_next: false,
            ..
        }
    ));
}

#[test]
fn shutdown_joins_worker_thread() {
    let service = PlaybackService::start().expect("worker should start");
    service.shutdown();

    assert!(service.worker.lock().unwrap().is_none());
}

#[test]
fn runtime_failure_snapshot_has_active_id() {
    assert_eq!(
        failed_snapshot(
            OutputStreamId(1),
            PlaybackFailureCode::OutputStreamRuntimeFailed,
        ),
        PlaybackSnapshot::failed(
            VolumeState::default(),
            Some("1".into()),
            PlaybackFailureCode::OutputStreamRuntimeFailed
        )
    );
}

#[test]
fn completion_signal_id_is_read_from_each_signal_variant() {
    assert_eq!(
        signal_stream_id(&OutputSignal::CompletionTimingFailed {
            stream_id: OutputStreamId(3),
        }),
        OutputStreamId(3)
    );
}

#[test]
fn converts_frames_and_calculates_duration_in_milliseconds() {
    assert_eq!(frame_to_millis(22_050, 44_100), 500);
    assert_eq!(duration_ms(132_300, 44_100), 3_000);
    assert_eq!(frame_to_millis(96_000, 96_000), 1_000);
}

#[test]
fn position_publication_requires_interval_and_a_changed_position() {
    assert!(!should_publish_position(
        std::time::Duration::from_millis(249),
        true
    ));
    assert!(!should_publish_position(
        std::time::Duration::from_millis(250),
        false
    ));
    assert!(should_publish_position(
        std::time::Duration::from_millis(250),
        true
    ));
    assert!(should_publish_position(
        std::time::Duration::from_millis(500),
        true
    ));
}

fn test_worker(snapshot: PlaybackSnapshot) -> PlaybackWorker {
    let (_, command_receiver) = mpsc::sync_channel(1);
    let (state_changed_sender, _) = mpsc::sync_channel(1);
    let (output_sender, output_receiver) = mpsc::sync_channel(1);

    PlaybackWorker {
        active: None,
        pending: None,
        pending_seek: None,
        next_playback_session_id: 0,
        next_output_stream_id: 0,
        next_snapshot_revision: 0,
        current_file: None,
        sequence: None,
        volume_state: VolumeState::default(),
        effective_gain: super::super::volume::AtomicEffectiveGain::new(1.0),
        output_selection: AudioOutputSelection::SystemDefault,
        snapshot: Arc::new(RwLock::new(snapshot)),
        command_receiver,
        state_changed_sender,
        output_sender,
        output_receiver,
    }
}

fn changed_volume(snapshot: &PlaybackSnapshot) -> (f32, bool) {
    match snapshot {
        PlaybackSnapshot::Stopped { volume, muted, .. }
        | PlaybackSnapshot::Playing { volume, muted, .. }
        | PlaybackSnapshot::Paused { volume, muted, .. }
        | PlaybackSnapshot::Failed { volume, muted, .. } => (*volume, *muted),
    }
}

fn snapshot_revision(snapshot: &PlaybackSnapshot) -> u64 {
    match snapshot {
        PlaybackSnapshot::Stopped { revision, .. }
        | PlaybackSnapshot::Playing { revision, .. }
        | PlaybackSnapshot::Paused { revision, .. }
        | PlaybackSnapshot::Failed { revision, .. } => *revision,
    }
}

#[test]
fn seek_position_helpers_use_floor_alignment_and_output_rate() {
    assert_eq!(millis_to_frame(999, 44_100), 44_055);
    assert_eq!(frame_to_millis(44_055, 44_100), 998);
    assert_eq!(source_to_output_frame(44_100, 48_000, 44_100), 48_000);
    assert_eq!(duration_to_frames(2_001, 48_000), 96_048);
}

#[test]
fn seek_position_helpers_saturate_large_values() {
    assert_eq!(millis_to_frame(u64::MAX, u32::MAX), u64::MAX);
    assert_eq!(source_to_output_frame(u64::MAX, u32::MAX, 1), u64::MAX);
}
