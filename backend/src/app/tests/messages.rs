use super::fixture;
use crate::app::BackendApp;
use crate::dto::{Appearance, AppearancePatch};
use crate::messages::{BackendMessage, StateTopic, testing::Sent};

const TOPICS: [StateTopic; 5] = [
    StateTopic::Playback,
    StateTopic::Queue,
    StateTopic::LibraryScan,
    StateTopic::Waveform,
    StateTopic::Appearance,
];

fn revision_of(backend: &BackendApp, topic: StateTopic) -> u64 {
    match backend.state_message(topic) {
        Some(BackendMessage::State(message)) => message.revision,
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
fn initial_state_has_every_topic_at_its_starting_revision() {
    let fixture = fixture();
    let initial = fixture.backend.initial_state();

    assert_eq!(initial.playback.revision, 0);
    assert_eq!(initial.queue.revision, 0);
    assert_eq!(initial.library_scan.revision, 0);
    assert_eq!(initial.waveform.revision, 0);
    assert_eq!(initial.appearance.revision, 0);
    assert_eq!(initial.appearance.value, Appearance::default());
    for topic in TOPICS {
        assert!(fixture.backend.state_message(topic).is_some(), "{topic:?}");
    }
}

#[test]
fn each_topic_counts_only_its_own_changes() {
    let fixture = fixture();
    let backend = &fixture.backend;

    let changed = backend.update_appearance(&artwork_backdrop(false));
    assert_eq!(changed.revision, 1);
    assert_eq!(revision_of(backend, StateTopic::Appearance), 1);
    assert_eq!(revision_of(backend, StateTopic::Playback), 0);

    let first_volume = backend.set_volume(0.5).expect("volume");
    let second_volume = backend.set_volume(0.25).expect("volume");
    assert!(first_volume.revision < second_volume.revision);
    assert_eq!(
        revision_of(backend, StateTopic::Playback),
        second_volume.revision
    );
    assert_eq!(revision_of(backend, StateTopic::Appearance), 1);
}

#[test]
fn an_appearance_change_that_changes_nothing_keeps_its_revision() {
    let fixture = fixture();
    let backend = &fixture.backend;

    backend.update_appearance(&artwork_backdrop(false));
    let again = backend.update_appearance(&artwork_backdrop(false));

    assert_eq!(again.revision, 1);
    assert_eq!(revision_of(backend, StateTopic::Appearance), 1);
}

#[test]
fn changes_reach_the_sink_in_the_order_they_are_made() {
    let fixture = fixture();

    fixture.backend.update_appearance(&artwork_backdrop(false));
    fixture.backend.set_volume(0.5).expect("volume");

    let topics: Vec<Sent> = fixture
        .recorded
        .sent()
        .into_iter()
        .filter(|sent| {
            matches!(
                sent,
                Sent::State(StateTopic::Appearance | StateTopic::Playback)
            )
        })
        .collect();
    assert_eq!(
        topics,
        [
            Sent::State(StateTopic::Appearance),
            Sent::State(StateTopic::Playback),
        ]
    );
}
