//! Volume, mute and the saved preferences through `Player`.

use super::*;

#[test]
fn volume_and_mute_are_reported_in_the_transport() {
    let fixture = Fixture::with(&[]);

    fixture.player.set_volume(0.25).unwrap();
    assert_eq!(fixture.state().base().volume, 0.25);

    fixture.player.set_muted(true).unwrap();
    assert!(fixture.state().base().muted);
    assert_eq!(fixture.state().base().volume, 0.25);

    fixture.player.set_muted(false).unwrap();
    assert!(!fixture.state().base().muted);
}

#[test]
fn a_volume_outside_the_range_is_refused_not_clamped() {
    let fixture = Fixture::with(&[]);
    let sent_before = fixture.transport_messages();

    assert_eq!(
        fixture.player.set_volume(1.5).err(),
        Some(CommandError::InvalidVolume)
    );
    assert_eq!(
        fixture.player.set_volume(f32::NAN).err(),
        Some(CommandError::InvalidVolume)
    );
    assert_eq!(fixture.transport_messages(), sent_before);
}

#[test]
fn volume_changes_are_saved_as_preferences() {
    let fixture = Fixture::with(&[]);

    fixture.player.set_volume(0.5).unwrap();
    fixture.player.set_muted(true).unwrap();

    let saved = fixture.settings.player_preferences();
    assert_eq!(saved.volume, 0.5);
    assert!(saved.muted);
}
