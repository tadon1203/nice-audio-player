use super::fixture;
use crate::messages::BackendMessage;
use crate::player::playback::volume::NormalizedVolume;
use crate::settings::AppearancePatch;

fn artwork_backdrop(enabled: bool) -> AppearancePatch {
    AppearancePatch {
        artwork_backdrop: Some(enabled),
        calm_motion: None,
    }
}

fn appearances_sent(recorded: &crate::test_support::MessageLog) -> usize {
    recorded
        .sent()
        .iter()
        .filter(|message| matches!(message, BackendMessage::Appearance(_)))
        .count()
}

#[test]
fn the_first_message_of_each_state_kind_arrives_after_start() {
    let fixture = fixture();
    let recorded = &fixture.recorded;

    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Player(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Queue(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Library(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Waveform(_))));
    assert!(recorded.wait_for(|message| matches!(message, BackendMessage::Appearance(_))));
}

#[test]
fn an_appearance_change_that_changes_nothing_is_not_sent() {
    let fixture = fixture();
    let backend = &fixture.backend;

    backend.appearance_update(&artwork_backdrop(false));
    let after_change = appearances_sent(&fixture.recorded);
    backend.appearance_update(&artwork_backdrop(false));

    assert_eq!(appearances_sent(&fixture.recorded), after_change);
}

#[test]
fn changes_reach_the_listener_in_the_order_they_are_made() {
    let fixture = fixture();

    fixture.backend.appearance_update(&artwork_backdrop(false));
    fixture
        .backend
        .set_volume(NormalizedVolume::try_from(0.5).unwrap())
        .expect("volume");

    let sent = fixture.recorded.sent();
    let last_appearance = sent
        .iter()
        .rposition(|message| matches!(message, BackendMessage::Appearance(_)));
    let last_player = sent
        .iter()
        .rposition(|message| matches!(message, BackendMessage::Player(_)));
    assert!(
        last_appearance < last_player,
        "the appearance change is sent before the volume change"
    );
}
