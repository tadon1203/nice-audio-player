use super::fixture;
use crate::app::BackendApp;
use crate::messages::Notification;
use crate::messages::{BackendMessage, StateTopic};
use crate::settings::AppearancePatch;

const TOPICS: [StateTopic; 5] = [
    StateTopic::Playback,
    StateTopic::Queue,
    StateTopic::Scan,
    StateTopic::Waveform,
    StateTopic::Appearance,
];

fn version_of(backend: &BackendApp, topic: StateTopic) -> u64 {
    match backend.message(topic) {
        BackendMessage::State(message) => message.version,
        other => panic!("{topic:?} is not a state message: {other:?}"),
    }
}

fn artwork_backdrop(enabled: bool) -> AppearancePatch {
    AppearancePatch {
        artwork_backdrop: Some(enabled),
        calm_motion: None,
    }
}

#[test]
fn messages_has_every_topic_at_its_starting_version() {
    let fixture = fixture();

    let messages = fixture.backend.messages();

    assert_eq!(messages.len(), TOPICS.len());
    for topic in TOPICS {
        assert_eq!(version_of(&fixture.backend, topic), 0, "{topic:?}");
    }
}

#[test]
fn each_topic_counts_only_its_own_changes() {
    let fixture = fixture();
    let backend = &fixture.backend;

    let changed = backend.appearance_update(&artwork_backdrop(false));
    assert_eq!(changed.version, 1);
    assert_eq!(version_of(backend, StateTopic::Appearance), 1);
    assert_eq!(version_of(backend, StateTopic::Playback), 0);

    let first_volume = backend.set_volume(0.5).expect("volume");
    let second_volume = backend.set_volume(0.25).expect("volume");
    assert!(first_volume.version < second_volume.version);
    assert_eq!(
        version_of(backend, StateTopic::Playback),
        second_volume.version
    );
    assert_eq!(version_of(backend, StateTopic::Appearance), 1);
}

#[test]
fn an_appearance_change_that_changes_nothing_keeps_its_version() {
    let fixture = fixture();
    let backend = &fixture.backend;

    backend.appearance_update(&artwork_backdrop(false));
    let again = backend.appearance_update(&artwork_backdrop(false));

    assert_eq!(again.version, 1);
    assert_eq!(version_of(backend, StateTopic::Appearance), 1);
}

#[test]
fn changes_reach_the_listener_in_the_order_they_are_made() {
    let fixture = fixture();

    fixture.backend.appearance_update(&artwork_backdrop(false));
    fixture.backend.set_volume(0.5).expect("volume");

    let topics: Vec<Notification> = fixture
        .recorded
        .sent()
        .into_iter()
        .filter(|sent| {
            matches!(
                sent,
                Notification::StateChanged(StateTopic::Appearance | StateTopic::Playback)
            )
        })
        .collect();
    assert_eq!(
        topics,
        [
            Notification::StateChanged(StateTopic::Appearance),
            Notification::StateChanged(StateTopic::Playback),
        ]
    );
}
