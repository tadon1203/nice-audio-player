use super::fixture;
use crate::dto::PlaybackRepeatMode;
use crate::errors::PlaybackServiceError;

#[test]
fn with_nothing_playing_there_is_no_waveform_and_no_queue() {
    let fixture = fixture();
    let backend = &fixture.backend;

    assert!(backend.playback_waveform().value.is_none());
    let window = backend.queue_window(0, 10);
    assert!(window.items.is_empty());
    assert_eq!(window.offset, 0);
}

#[test]
fn pause_needs_a_loaded_track() {
    let fixture = fixture();

    assert_eq!(
        fixture.backend.pause().err(),
        Some(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn volume_and_mute_are_reported_in_the_snapshot() {
    let fixture = fixture();
    let backend = &fixture.backend;

    let quiet = backend.set_volume(0.25).expect("volume");
    assert_eq!(quiet.value.base().volume, 0.25);

    let muted = backend.set_muted(true).expect("mute");
    assert!(muted.value.base().muted);
    assert_eq!(muted.value.base().volume, 0.25);
}

#[test]
fn repeat_mode_is_reported_in_the_queue_snapshot() {
    let fixture = fixture();

    let queue = fixture
        .backend
        .set_repeat_mode(PlaybackRepeatMode::All)
        .expect("repeat mode");

    assert_eq!(queue.value.repeat_mode, PlaybackRepeatMode::All);
}
