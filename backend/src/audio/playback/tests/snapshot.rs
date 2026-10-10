use super::*;

#[test]
fn the_initial_snapshot_is_stopped_with_the_saved_volume() {
    let service = start_service();

    assert_eq!(
        serde_json::to_value(service.snapshot()).unwrap(),
        serde_json::json!({"status": "stopped", "base": base_json(), "item": null})
    );
    service.shutdown();
}

fn test_item() -> PlaybackItem {
    PlaybackItem {
        queue_item_id: "queue-item-1".into(),
        track: library_track(
            "7",
            ValidatedAudioFile {
                path: "C:/test.flac".into(),
                file_name: "test.flac".into(),
                extension: "flac".into(),
            },
        ),
    }
}

fn base() -> SnapshotBase {
    SnapshotBase::new(VolumeState::default(), AudioOutputSelection::SystemDefault)
}

fn wire_session() -> ActiveSession {
    ActiveSession {
        item: test_item(),
        playback_id: "1".into(),
        position_ms: 1_000,
        seek_revision: 0,
        duration_ms: Some(60_000),
        output_device: crate::audio::devices::AudioOutputDeviceIdentity {
            id: "test-device".into(),
            name: "Test device".into(),
        },
        channel_conversion: PlaybackChannelConversion::None,
        source_format: "FLAC".into(),
        source_bit_depth: Some(24),
        source_bitrate_kbps: None,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
        resampling_active: false,
    }
}

fn item_json() -> serde_json::Value {
    serde_json::json!({
        "queueItemId": "queue-item-1",
        "trackId": "7",
        "trackNumber": null,
        "discNumber": null,
        "year": null,
        "albumKey": null,
        "albumTrackCount": null,
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
        "sourceFormat": "FLAC",
        "sourceBitDepth": 24,
        "sourceBitrateKbps": null,
        "sourceSampleRate": 44_100,
        "outputSampleRate": 44_100,
        "resamplingActive": false
    })
}

#[test]
fn serializes_playing_and_paused_snapshots_with_a_camel_case_playback_id() {
    let playing = PlaybackSnapshot::Playing {
        base: base(),
        session: wire_session(),
    };
    let paused = PlaybackSnapshot::Paused {
        base: base(),
        session: wire_session(),
    };

    assert_eq!(
        serde_json::to_value(playing).unwrap(),
        serde_json::json!({ "status": "playing", "base": base_json(), "session": session_json() })
    );
    assert_eq!(
        serde_json::to_value(paused).unwrap(),
        serde_json::json!({ "status": "paused", "base": base_json(), "session": session_json() })
    );
}

#[test]
fn serializes_a_missing_playback_id_as_null_in_a_failed_snapshot() {
    let snapshot = PlaybackSnapshot::Failed {
        base: base(),
        item: None,
        playback_id: None,
        error: PlaybackFailureCode::NoOutputDevice,
        skipping: false,
    };

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({
            "status": "failed",
            "base": base_json(),
            "item": null,
            "playbackId": null,
            "error": "noOutputDevice",
            "skipping": false
        })
    );
}
