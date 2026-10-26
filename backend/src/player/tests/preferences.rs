//! Volume, mute and the saved preferences through `Player`.

use super::*;

#[test]
fn volume_and_mute_are_reported_in_the_snapshot() {
    let fixture = Fixture::with(&[]);

    let quiet = fixture.player.set_volume(0.25).unwrap().value;
    assert_eq!(quiet.base().volume, 0.25);

    let muted = fixture.player.set_muted(true).unwrap().value;
    assert!(muted.base().muted);
    assert_eq!(muted.base().volume, 0.25);

    let unmuted = fixture.player.set_muted(false).unwrap().value;
    assert!(!unmuted.base().muted);
}

#[test]
fn a_volume_outside_the_range_is_refused_not_clamped() {
    let fixture = Fixture::with(&[]);
    let before = fixture.state_store.playback().version;

    assert_eq!(
        fixture.player.set_volume(1.5).err(),
        Some(CommandError::InvalidVolume)
    );
    assert_eq!(
        fixture.player.set_volume(f32::NAN).err(),
        Some(CommandError::InvalidVolume)
    );
    assert_eq!(fixture.state_store.playback().version, before);
}

#[test]
fn volume_changes_are_saved_as_preferences() {
    let fixture = Fixture::with(&[]);

    fixture.player.set_volume(0.5).unwrap();
    fixture.player.set_muted(true).unwrap();

    let last = fixture
        .preferences
        .lock()
        .last()
        .cloned()
        .expect("a preference was saved");
    assert_eq!(last.volume, 0.5);
    assert!(last.muted);
}
