use super::item::{PlaybackItem, PlaybackItemSeed};
use super::preferences::PlaybackPreferences;
use super::queue::{AdvanceReason, PlaybackQueue, PlaybackRepeatMode};
use super::service::{PlaybackService, PlaybackServiceError};
use super::session::{
    duration_to_frames, frame_to_millis, millis_to_frame, should_publish_position,
    source_to_output_frame, PendingSourceLoad,
};
use super::snapshot::{
    ActiveSession, PlaybackChannelConversion, PlaybackFailureCode, PlaybackProcessingInfo,
    PlaybackQueueSnapshot, PlaybackSnapshot, SnapshotBase,
};
use super::source_loader::SourceLoadWorker;
use super::worker::{
    completion_time_reached, output_failure_code, pause_action, previous_restarts_track,
    resume_action, should_finish, signal_stream_id, stream_signal_action, FailureScope,
    PlaybackControlAction, PlaybackWorker, StartFailurePhase, StreamSignalAction, WorkerLinks,
};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::output::{AudioOutputError, OutputSignal, OutputStreamId, StreamFailureKind};
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::media::validation::ValidatedAudioFile;
use cpal::StreamInstant;
use rand::{rngs::StdRng, SeedableRng};
use std::sync::{mpsc, Arc, RwLock};

fn test_file() -> ValidatedAudioFile {
    ValidatedAudioFile {
        path: "C:/test.flac".into(),
        file_name: "test.flac".into(),
        extension: "flac".into(),
    }
}

fn test_item() -> PlaybackItem {
    PlaybackItem::from_seed(
        "queue-item-1".into(),
        PlaybackItemSeed::from_file(test_file()),
    )
}

fn base(volume: VolumeState) -> SnapshotBase {
    SnapshotBase::new(volume, AudioOutputSelection::SystemDefault)
}

fn session(
    playback_id: &str,
    position_ms: u64,
    duration_ms: Option<u64>,
    channel_conversion: PlaybackChannelConversion,
) -> ActiveSession {
    ActiveSession {
        item: test_item(),
        playback_id: playback_id.into(),
        position_ms,
        seek_revision: 0,
        duration_ms,
        output_device: crate::audio::devices::AudioOutputDeviceIdentity {
            id: "test-device".into(),
            name: "Test device".into(),
        },
        channel_conversion,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
        resampling_active: false,
    }
}

fn stopped(volume: VolumeState) -> PlaybackSnapshot {
    PlaybackSnapshot::Stopped {
        base: base(volume),
        item: None,
    }
}

fn playing(
    volume: VolumeState,
    playback_id: &str,
    position_ms: u64,
    duration_ms: Option<u64>,
) -> PlaybackSnapshot {
    PlaybackSnapshot::Playing {
        base: base(volume),
        session: session(
            playback_id,
            position_ms,
            duration_ms,
            PlaybackChannelConversion::None,
        ),
    }
}

fn paused(
    volume: VolumeState,
    playback_id: &str,
    position_ms: u64,
    duration_ms: Option<u64>,
) -> PlaybackSnapshot {
    PlaybackSnapshot::Paused {
        base: base(volume),
        session: session(
            playback_id,
            position_ms,
            duration_ms,
            PlaybackChannelConversion::None,
        ),
    }
}

fn failed(
    volume: VolumeState,
    playback_id: Option<String>,
    error: PlaybackFailureCode,
) -> PlaybackSnapshot {
    PlaybackSnapshot::Failed {
        base: base(volume),
        item: None,
        playback_id,
        error,
    }
}

fn failed_snapshot(id: OutputStreamId, error: PlaybackFailureCode) -> PlaybackSnapshot {
    failed(VolumeState::default(), Some(id.0.to_string()), error)
}

fn duration_ms(total_frame_count: u64, sample_rate: u32) -> u64 {
    frame_to_millis(total_frame_count, sample_rate)
}

fn item_json() -> serde_json::Value {
    serde_json::json!({
        "queueItemId": "queue-item-1",
        "trackId": null,
        "trackNumber": null,
        "discNumber": null,
        "year": null,
        "albumKey": null,
        "albumTrackCount": null,
        "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" },
        "title": "test.flac",
        "artist": null,
        "album": null,
        "albumArtist": null,
        "artwork": null,
        "durationMs": null
    })
}

fn base_json() -> serde_json::Value {
    serde_json::json!({
        "revision": 0,
        "volume": 1.0,
        "muted": false,
        "outputSelection": { "kind": "systemDefault" },
        "canGoPrevious": false,
        "canGoNext": false
    })
}

fn session_json() -> serde_json::Value {
    serde_json::json!({
        "item": item_json(),
        "playbackId": "1",
        "positionMs": 1_000,
        "seekRevision": 0,
        "durationMs": 60_000,
        "outputDevice": { "id": "test-device", "name": "Test device" },
        "channelConversion": "none",
        "sourceSampleRate": 44_100,
        "outputSampleRate": 44_100,
        "resamplingActive": false
    })
}

/// Files that do not exist, so loading them fails as an unreadable file.
fn seeds(count: usize) -> Vec<PlaybackItemSeed> {
    (0..count)
        .map(|i| {
            PlaybackItemSeed::from_file(ValidatedAudioFile {
                path: format!("C:/missing/track-{i}.flac"),
                file_name: format!("track-{i}.flac"),
                extension: "flac".into(),
            })
        })
        .collect()
}

/// Runs the worker's loading step until the pending start answers.
fn finish_start(
    worker: &mut PlaybackWorker,
    receiver: &mpsc::Receiver<Result<PlaybackSnapshot, PlaybackServiceError>>,
) -> Option<Result<PlaybackSnapshot, PlaybackServiceError>> {
    (0..2_000).find_map(|_| {
        worker.advance_pending_source_load();
        receiver
            .recv_timeout(std::time::Duration::from_millis(1))
            .ok()
    })
}

#[test]
fn processing_info_derives_resampling_from_rates() {
    let equal = PlaybackProcessingInfo {
        channel_conversion: PlaybackChannelConversion::None,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
    };
    let different = PlaybackProcessingInfo {
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
    let snapshot = playing(VolumeState::default(), "1", 1_000, Some(60_000));

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({ "status": "playing", "base": base_json(), "session": session_json() })
    );
}

#[test]
fn serializes_paused_snapshot_with_camel_case_playback_id() {
    let snapshot = paused(VolumeState::default(), "1", 1_000, Some(60_000));

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({ "status": "paused", "base": base_json(), "session": session_json() })
    );
}

#[test]
fn serializes_missing_playback_id_as_null_in_failed_snapshot() {
    let snapshot = failed(
        VolumeState::default(),
        None,
        PlaybackFailureCode::NoOutputDevice,
    );

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({
            "status": "failed",
            "base": base_json(),
            "item": null,
            "playbackId": null,
            "error": "noOutputDevice"
        })
    );
}

#[test]
fn stop_is_stopped_when_called_twice() {
    let mut worker = test_worker(playing(VolumeState::default(), "1", 0, Some(60_000)));

    let first = worker.stop();
    assert!(matches!(first, PlaybackSnapshot::Stopped { .. }));
    assert_eq!(first.revision(), 1);
    assert_eq!(worker.stop(), first);
    assert_eq!(worker.current(), first);
    assert!(worker.active.is_none());
}

#[test]
fn stop_from_paused_is_stopped() {
    let mut worker = test_worker(paused(VolumeState::default(), "1", 10_000, Some(60_000)));

    let stopped = worker.stop();
    assert!(matches!(stopped, PlaybackSnapshot::Stopped { .. }));
    assert_eq!(stopped.revision(), 1);
    assert_eq!(worker.current(), stopped);
}

#[test]
fn stop_clears_the_queue() {
    let mut worker = test_worker(stopped(VolumeState::default()));
    worker
        .queue
        .replace(seeds(3), 1, &mut StdRng::seed_from_u64(1))
        .unwrap();

    worker.stop();

    assert!(worker.queue.is_empty());
    assert!(worker.queue_snapshot().current.is_none());
}

#[test]
fn volume_commands_update_snapshot_without_rebuilding_playback() {
    let mut worker = test_worker(playing(VolumeState::default(), "1", 250, Some(60_000)));

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
    let mut worker = test_worker(stopped(VolumeState::default()));

    let changed = worker.set_volume(0.5).expect("valid volume must succeed");
    let muted = worker.mute();
    let muted_again = worker.mute();

    assert_eq!(changed.revision(), 1);
    assert_eq!(muted.revision(), 2);
    assert_eq!(muted_again.revision(), 2);
}

#[test]
fn stopped_snapshot_retains_the_last_played_item_identity() {
    let mut worker = test_worker(paused(VolumeState::default(), "1", 1_000, Some(60_000)));
    worker.loaded_item = Some(test_item());

    let PlaybackSnapshot::Stopped {
        item: Some(item), ..
    } = worker.stop()
    else {
        panic!("stop must retain an item identity");
    };
    assert_eq!(item.file.file_name, "test.flac");
}

#[test]
fn volume_state_is_present_in_initial_stopped_snapshot() {
    let service = start_service();
    assert_eq!(
        serde_json::to_value(service.snapshot()).unwrap(),
        serde_json::json!({"status": "stopped", "base": base_json(), "item": null})
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
    let playing = playing(VolumeState::default(), "1", 0, Some(60_000));
    let paused = paused(VolumeState::default(), "1", 10_000, Some(60_000));
    let stopped = stopped(VolumeState::default());
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
    let paused = paused(VolumeState::default(), "1", 10_000, Some(60_000));
    let end = StreamInstant::new(10, 0);

    assert!(!should_finish(&paused, Some(end), end));
    assert!(should_finish(
        &playing(VolumeState::default(), "1", 0, Some(60_000)),
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
fn start_failure_scope_separates_file_problems_from_output_problems() {
    for phase in [
        StartFailurePhase::SourceOpen,
        StartFailurePhase::SourceMetadata,
        StartFailurePhase::SourceRead,
        StartFailurePhase::SourceChanged,
        StartFailurePhase::DecoderOpen,
        StartFailurePhase::FirstPacketDecode,
        StartFailurePhase::ProcessorCreate,
        StartFailurePhase::PrebufferDecode,
        StartFailurePhase::PrebufferConversion,
    ] {
        assert_eq!(phase.scope(), FailureScope::Item, "{phase:?}");
    }
    for phase in [
        StartFailurePhase::SourceWorker,
        StartFailurePhase::OutputDeviceResolution,
        StartFailurePhase::OutputPrepare,
        StartFailurePhase::DecodeWorkerSpawn,
        StartFailurePhase::StreamStart,
    ] {
        assert_eq!(phase.scope(), FailureScope::Output, "{phase:?}");
    }
}

#[test]
fn a_file_that_cannot_be_read_is_skipped_and_the_queue_survives() {
    let mut worker = test_worker(stopped(VolumeState::default()));
    let (reply, receiver) = mpsc::sync_channel(1);

    worker.start_queue(seeds(3), 0, reply);
    let result = finish_start(&mut worker, &receiver);

    // Every file is missing, so the pass ends after trying each one exactly once.
    assert_eq!(result, Some(Err(PlaybackServiceError::Decode)));
    assert_eq!(worker.queue.len(), 3);
    assert_eq!(
        worker.queue_snapshot().current.unwrap().title,
        "track-2.flac"
    );
    let current = worker.current();
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
    let mut worker = test_worker(stopped(VolumeState::default()));
    worker.queue.set_repeat(PlaybackRepeatMode::All);
    let (reply, receiver) = mpsc::sync_channel(1);

    worker.start_queue(seeds(4), 1, reply);

    assert_eq!(
        finish_start(&mut worker, &receiver),
        Some(Err(PlaybackServiceError::Decode))
    );
    assert_eq!(worker.queue.len(), 4);
}

#[test]
fn navigation_over_a_broken_file_reports_the_failure_and_keeps_the_queue() {
    let mut worker = test_worker(playing(VolumeState::default(), "1", 0, Some(60_000)));
    worker
        .queue
        .replace(seeds(2), 0, &mut StdRng::seed_from_u64(1))
        .unwrap();
    let (reply, receiver) = mpsc::sync_channel(1);

    worker.navigate(AdvanceReason::UserNext, reply);

    assert_eq!(
        finish_start(&mut worker, &receiver),
        Some(Err(PlaybackServiceError::Decode))
    );
    assert_eq!(worker.queue.len(), 2);
    assert!(matches!(
        worker.current(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
}

#[test]
fn a_superseded_start_is_answered_instead_of_dropped() {
    let mut worker = test_worker(stopped(VolumeState::default()));
    let (first, first_receiver) = mpsc::sync_channel(1);
    let (second, _second_receiver) = mpsc::sync_channel(1);

    worker.start_queue(seeds(1), 0, first);
    worker.start_queue(seeds(1), 0, second);

    assert_eq!(
        first_receiver.recv_timeout(std::time::Duration::from_secs(1)),
        Ok(Err(PlaybackServiceError::Superseded))
    );
    worker.discard_pending_source();
}

#[test]
fn previous_restarts_a_track_that_has_played_for_a_while() {
    assert!(!previous_restarts_track(2_999, Some(60_000)));
    assert!(previous_restarts_track(3_000, Some(60_000)));
    assert!(!previous_restarts_track(30_000, None));
}

#[test]
fn navigation_availability_follows_the_queue_and_the_restart_rule() {
    let mut worker = test_worker(stopped(VolumeState::default()));
    worker
        .queue
        .replace(seeds(2), 0, &mut StdRng::seed_from_u64(1))
        .unwrap();

    let early = worker.publish(playing(VolumeState::default(), "1", 500, Some(60_000)));
    assert!(!early.base().can_go_previous);
    assert!(early.base().can_go_next);

    let late = worker.publish(playing(VolumeState::default(), "1", 5_000, Some(60_000)));
    assert!(late.base().can_go_previous, "previous restarts the track");

    let idle = worker.publish(stopped(VolumeState::default()));
    assert!(!idle.base().can_go_previous && !idle.base().can_go_next);
}

#[test]
fn shutdown_joins_worker_thread() {
    let service = start_service();
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
        failed(
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

#[test]
fn output_selection_is_rejected_during_source_loading() {
    let mut worker = test_worker(stopped(VolumeState::default()));
    let (reply, _receiver) = mpsc::sync_channel(1);
    worker.pending_source = Some(PendingSourceLoad {
        item: test_item(),
        worker: SourceLoadWorker::spawn(test_file()).unwrap(),
        reply,
        start_paused: false,
    });

    assert_eq!(
        worker.set_output_selection(AudioOutputSelection::SystemDefault),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
    assert_eq!(worker.output_selection, AudioOutputSelection::SystemDefault);
    worker.discard_pending_source();
}

fn start_service() -> PlaybackService {
    PlaybackService::start(
        crate::events::null_event_sink(),
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
    )
    .expect("worker should start")
}

fn test_worker(snapshot: PlaybackSnapshot) -> PlaybackWorker {
    let (_, command_receiver) = mpsc::sync_channel(1);
    let (output_sender, _output_receiver) = mpsc::sync_channel(1);
    let queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);

    PlaybackWorker::new(
        WorkerLinks {
            snapshot: Arc::new(RwLock::new(snapshot)),
            queue_snapshot: Arc::new(RwLock::new(PlaybackQueueSnapshot::of(0, &queue))),
            effective_gain: AtomicEffectiveGain::new(1.0),
            command_receiver,
            output_sender,
            events: crate::events::null_event_sink(),
            observer: Arc::new(|_| {}),
        },
        queue,
        VolumeState::default(),
        AudioOutputSelection::SystemDefault,
    )
}

fn changed_volume(snapshot: &PlaybackSnapshot) -> (f32, bool) {
    (snapshot.base().volume, snapshot.base().muted)
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
