use super::*;

#[test]
fn volume_commands_update_the_snapshot_and_the_gain() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let changed = harness
        .call(|reply| PlaybackCommand::SetVolume { volume: 0.5, reply })
        .unwrap();
    assert_eq!(
        (changed.value.base().volume, changed.value.base().muted),
        (0.5, false)
    );
    assert_eq!(harness.gain.load(), 0.5);

    let before_invalid = harness.snapshot();
    assert_eq!(
        harness.call(|reply| PlaybackCommand::SetVolume {
            volume: f32::NAN,
            reply
        }),
        Err(PlaybackServiceError::InvalidVolume)
    );
    assert_eq!(harness.snapshot(), before_invalid);

    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();
    assert_eq!(
        (muted.value.base().volume, muted.value.base().muted),
        (0.5, true)
    );
    assert_eq!(harness.gain.load(), 0.0);
    let unmuted = harness
        .call(|reply| PlaybackCommand::Unmute { reply })
        .unwrap();
    assert_eq!(
        (unmuted.value.base().volume, unmuted.value.base().muted),
        (0.5, false)
    );
    assert_eq!(harness.gain.load(), 0.5);
}
