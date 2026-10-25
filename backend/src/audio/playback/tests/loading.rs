//! Commands are answered while a load runs: a slow file does not hold up the worker.

use super::*;
use crate::audio::playback::pipeline::gate::RELEASED;
use std::sync::atomic::Ordering;

#[test]
fn pause_and_next_are_answered_while_a_load_runs() {
    let fixture = Fixture::with(&clips(&["gated", "a"]));
    let ids = fixture.ids(&["gated", "a"]);

    std::thread::scope(|scope| {
        // A start answers only when its track plays, so it waits on its own thread.
        let starting = scope.spawn(|| fixture.player.play_queue(ids.clone(), 0));
        assert!(
            wait_until(|| fixture.queue().current.is_some(), WAIT),
            "the gated start has begun"
        );

        fixture
            .player
            .pause()
            .expect("pause is answered during the load");
        let next = fixture
            .player
            .next()
            .expect("next is answered during the load")
            .value;
        assert!(is_playing(&next, "a"));

        RELEASED.store(true, Ordering::Release);
        let superseded = starting.join().expect("the start thread ends");
        assert!(matches!(superseded, Err(CommandError::Superseded)));
    });
    fixture.wait_for(|state| is_playing(state, "a"));
}
