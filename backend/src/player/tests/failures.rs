//! Failures through `Player`: the output and the stream fail, and the queue stays intact. A failure
//! after the start is answered is the transport's: it arrives as a Failed state.

use super::*;

#[test]
fn an_output_that_cannot_be_prepared_fails_the_start_with_its_code() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .output
        .fail_next_open(OutputError::StreamBuildFailed);

    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .expect("the start is answered");

    fixture.wait_for(|state| {
        matches!(
            state,
            PlayerState::Failed {
                error: PlaybackFailureCode::OutputStreamBuildFailed,
                ..
            }
        )
    });
    assert_eq!(fixture.titles(), ["a", "b"], "the queue is kept");
}

#[test]
fn a_stream_that_will_not_start_fails_the_start() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture
        .output
        .fail_next_start(OutputError::StreamStartFailed);

    fixture
        .player
        .play_queue(fixture.ids(&["a"]), 0)
        .expect("the start is answered");

    fixture.wait_for(|state| {
        matches!(
            state,
            PlayerState::Failed {
                error: PlaybackFailureCode::OutputStreamStartFailed,
                ..
            }
        )
    });
}

#[test]
fn a_stream_failure_stops_with_the_queue_intact() {
    let fixture = Fixture::with(&clips(&["a", "b"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.output.fail_stream(StreamFailureKind::RuntimeFailed);

    fixture.wait_for(|state| {
        matches!(
            state,
            PlayerState::Failed {
                error: PlaybackFailureCode::OutputStreamRuntimeFailed,
                ..
            }
        )
    });
    assert_eq!(fixture.titles(), ["a", "b"]);
}

#[test]
fn a_failed_pause_fails_the_call_with_its_code() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture
        .output
        .fail_next_pause(OutputError::StreamPauseFailed);

    assert_eq!(
        fixture.player.pause().err(),
        Some(CommandError::Output {
            failure: PlaybackFailureCode::OutputStreamPauseFailed,
        })
    );
}
