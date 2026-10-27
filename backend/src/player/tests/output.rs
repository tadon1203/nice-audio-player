//! Output devices through `Player`: choosing, switching and rejecting a device.

use super::*;

use crate::test_support::CommandCode;

#[test]
fn a_device_change_on_the_system_default_keeps_playing() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.output.fail_stream(StreamFailureKind::DeviceChanged);
    fixture.settle();

    assert!(is_playing(&fixture.state(), "a"));
}

#[test]
fn a_device_change_on_a_chosen_device_keeps_playing() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture
        .player
        .set_output_selection(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.output.fail_stream(StreamFailureKind::DeviceChanged);
    fixture.settle();

    assert!(is_playing(&fixture.state(), "a"));
}

#[test]
fn a_device_switch_keeps_the_playback_id() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let playback_id = session(&fixture.state()).playback_id;

    fixture
        .player
        .set_output_selection(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();

    fixture.wait_for(|state| is_playing(state, "a") && session(state).playback_id == playback_id);
    assert_eq!(
        fixture.output.opened_selections().last(),
        Some(&AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        }),
        "the new device is the one the stream was opened for"
    );
}

#[test]
fn a_failed_device_switch_keeps_the_saved_selection_and_the_queue() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    let result = fixture
        .player
        .set_output_selection(AudioOutputSelection::Device {
            device_id: "fake-missing".into(),
        });

    assert_eq!(result.code_of(), None);
    assert!(matches!(
        fixture.state(),
        PlayerState::Failed {
            error: PlaybackFailureCode::OutputDeviceUnavailable,
            ..
        }
    ));
    assert_eq!(
        fixture.state().base().output_selection,
        AudioOutputSelection::SystemDefault
    );
    assert_eq!(fixture.titles(), ["a", "b"]);
}

#[test]
fn the_output_can_be_chosen_while_stopped() {
    let fixture = Fixture::with(&[]);
    let selection = AudioOutputSelection::Device {
        device_id: "fake-other".into(),
    };

    fixture
        .player
        .set_output_selection(selection.clone())
        .unwrap();

    assert_eq!(fixture.state().base().output_selection, selection);
}

#[test]
fn an_unusable_output_fails_playback_with_the_device_reason() {
    let fixture = Fixture::with(&[]);

    assert_eq!(
        fixture
            .player
            .set_output_selection(AudioOutputSelection::Device {
                device_id: String::new(),
            })
            .code_of(),
        None
    );
    assert!(matches!(
        fixture.state(),
        PlayerState::Failed {
            error: PlaybackFailureCode::OutputDeviceUnavailable,
            ..
        }
    ));
}
