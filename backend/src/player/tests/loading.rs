//! Commands are answered while a load runs: a slow file does not hold up the worker, and a start
//! shows its track as loading until the track plays.

use super::*;

use crate::player::pipeline::gate::RELEASED;
use std::sync::atomic::Ordering;

fn is_loading(state: &PlayerState, title: &str) -> bool {
    matches!(state, PlayerState::Loading { item, .. } if item.track.core.title == title)
}

#[test]
fn a_start_is_answered_before_its_track_loads() {
    let fixture = Fixture::with(&clips(&["gated"]));

    fixture
        .player
        .play_queue(fixture.ids(&["gated"]), 0)
        .expect("the start is answered while its file is held");

    fixture.wait_for(|state| is_loading(state, "gated"));
    RELEASED.store(true, Ordering::Release);
    fixture.wait_for(|state| is_playing(state, "gated"));
}

#[test]
fn pause_and_next_are_answered_while_a_load_runs() {
    let fixture = Fixture::with(&clips(&["gated", "a"]));
    let ids = fixture.ids(&["gated", "a"]);

    fixture
        .player
        .play_queue(ids, 0)
        .expect("the start is answered");
    fixture.wait_for(|state| is_loading(state, "gated"));

    fixture
        .player
        .pause()
        .expect("pause is answered during the load");
    fixture
        .player
        .next()
        .expect("next is answered during the load");

    RELEASED.store(true, Ordering::Release);
    fixture.wait_for(|state| is_playing(state, "a"));
}
