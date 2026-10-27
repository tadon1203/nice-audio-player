//! Volume, mute and the saved preferences through `Player`.

use super::*;

use crate::player::playback::volume::NormalizedVolume;

#[test]
fn volume_and_mute_are_reported_in_the_transport() {
    let fixture = Fixture::with(&[]);

    fixture
        .player
        .set_volume(NormalizedVolume::try_from(0.25).unwrap())
        .unwrap();
    assert_eq!(fixture.state().base().volume, 0.25);

    fixture.player.set_muted(true).unwrap();
    assert!(fixture.state().base().muted);
    assert_eq!(fixture.state().base().volume, 0.25);

    fixture.player.set_muted(false).unwrap();
    assert!(!fixture.state().base().muted);
}

#[test]
fn a_volume_outside_the_range_is_refused_not_clamped() {
    assert!(NormalizedVolume::try_from(1.5).is_err());
    assert!(NormalizedVolume::try_from(-0.5).is_err());
    assert!(NormalizedVolume::try_from(f32::NAN).is_err());
}

#[test]
fn volume_changes_are_saved_as_preferences() {
    let fixture = Fixture::with(&[]);

    fixture
        .player
        .set_volume(NormalizedVolume::try_from(0.5).unwrap())
        .unwrap();
    fixture.player.set_muted(true).unwrap();

    let saved = fixture.settings.player_preferences();
    assert_eq!(saved.volume, 0.5);
    assert!(saved.muted);
}
