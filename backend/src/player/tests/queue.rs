//! Queue behavior through `Player`: the queue by id, undo, windows, repeat and shuffle.

use super::*;
use crate::test_support::CommandCode;

/// How many queue states have been sent.
fn queue_messages(fixture: &Fixture) -> usize {
    fixture
        .messages
        .sent()
        .iter()
        .filter(|message| matches!(message, BackendMessage::Queue(_)))
        .count()
}

#[test]
fn the_queue_version_moves_on_each_queue_change() {
    let fixture = Fixture::with(&[]);
    let player = &fixture.player;
    let start = fixture.queue().version;

    player.set_repeat_mode(RepeatMode::All).unwrap();
    assert_eq!(fixture.queue().version, start + 1);
    assert_eq!(fixture.queue().repeat_mode, RepeatMode::All);

    player.set_shuffle(true).unwrap();
    assert_eq!(fixture.queue().version, start + 2);

    let sent = queue_messages(&fixture);
    player.set_shuffle(true).unwrap();
    assert_eq!(
        fixture.queue().version,
        start + 2,
        "a change that changes nothing keeps the version"
    );
    assert_eq!(queue_messages(&fixture), sent, "and is not sent again");
}

#[test]
fn enqueueing_on_an_empty_queue_starts_playback() {
    let fixture = Fixture::with(&clips(&["a", "b"]));

    fixture.player.enqueue(fixture.id("a"), false).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.enqueue(fixture.id("b"), false).unwrap();

    let queue = fixture.queue();
    assert_eq!(
        queue.current.map(|item| item.track.core.title),
        Some("a".into())
    );
    assert_eq!(queue.upcoming_count, 1);
}

#[test]
fn enqueue_next_puts_the_track_after_the_current_one() {
    let fixture = Fixture::with(&clips(&["a", "b", "c"]));
    let ids = fixture.ids(&["a", "b", "c"]);
    fixture.player.play_queue(ids[..2].to_vec(), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));

    fixture.player.enqueue(ids[2], true).unwrap();

    assert_eq!(fixture.titles(), ["a", "c", "b"]);
}

#[test]
fn replacing_the_queue_can_be_undone_in_one_step() {
    let fixture = Fixture::with(&clips(&["a", "b", "c"]));
    let ids = fixture.ids(&["a", "b", "c"]);
    fixture.player.play_queue(ids[..2].to_vec(), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.play_queue(vec![ids[2]], 0).unwrap();

    fixture.player.restore_previous_queue().unwrap();

    fixture.wait_for(|state| is_playing(state, "a"));
    assert_eq!(
        fixture.titles(),
        ["a", "b"],
        "the item that was current plays again"
    );
    // One step back, no further.
    assert_eq!(fixture.player.restore_previous_queue().code_of(), None);
}

#[test]
fn there_is_nothing_to_undo_after_starting_from_an_empty_queue() {
    let fixture = Fixture::with(&clips(&["a"]));
    fixture.player.play_queue(fixture.ids(&["a"]), 0).unwrap();

    assert_eq!(fixture.player.restore_previous_queue().code_of(), None);
}

#[test]
fn clearing_upcoming_can_be_undone_without_restarting_the_track() {
    let fixture = Fixture::with(&clips(&["a", "b", "c"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b", "c"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let playback_id = session(&fixture.state()).playback_id;
    fixture.player.clear_queue().unwrap();
    assert_eq!(fixture.titles(), ["a"]);

    fixture.player.restore_previous_queue().unwrap();

    assert_eq!(fixture.titles(), ["a", "b", "c"]);
    assert_eq!(
        session(&fixture.state()).playback_id,
        playback_id,
        "the track that kept playing is not restarted"
    );
}

#[test]
fn an_undone_queue_follows_the_shuffle_chosen_since() {
    let fixture = Fixture::with(&clips(&["a", "b", "c"]));
    let ids = fixture.ids(&["a", "b", "c"]);
    fixture.player.play_queue(ids[..2].to_vec(), 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    fixture.player.play_queue(vec![ids[2]], 0).unwrap();
    fixture.wait_for(|state| is_playing(state, "c"));
    fixture.player.set_shuffle(true).unwrap();

    fixture.player.restore_previous_queue().unwrap();

    let queue = fixture.queue();
    assert!(queue.shuffle_enabled);
    assert_eq!(
        queue.current.map(|item| item.track.core.title),
        Some("a".into())
    );
    assert_eq!(queue.upcoming_count, 1);
}

#[test]
fn queue_items_can_be_removed_moved_and_played_by_id() {
    let fixture = Fixture::with(&clips(&["a", "b", "c", "d"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b", "c", "d"]), 0)
        .unwrap();
    fixture.wait_for(|state| is_playing(state, "a"));
    let upcoming = fixture.queue().upcoming;
    let (b, c, d) = (
        upcoming[0].queue_item_id,
        upcoming[1].queue_item_id,
        upcoming[2].queue_item_id,
    );

    fixture.player.remove_queue_item(b).unwrap();
    assert_eq!(fixture.titles(), ["a", "c", "d"]);

    fixture.player.move_queue_item(d, 0).unwrap();
    assert_eq!(fixture.titles(), ["a", "d", "c"]);

    fixture.player.play_queue_item(c).unwrap();
    fixture.wait_for(|state| is_playing(state, "c"));
    assert_eq!(session(&fixture.state()).started_by, StartedBy::Jump);
}

#[test]
fn the_queue_window_serves_the_upcoming_rows_from_an_offset_with_the_queue_version() {
    let fixture = Fixture::with(&clips(&["a", "b", "c", "d", "e"]));
    fixture
        .player
        .play_queue(fixture.ids(&["a", "b", "c", "d", "e"]), 0)
        .unwrap();

    let window = fixture.player.queue_window(1, 2).expect("the window");

    let titles: Vec<_> = window
        .items
        .iter()
        .map(|item| item.track.core.title.as_str())
        .collect();
    assert_eq!(titles, ["c", "d"]);
    assert_eq!(window.offset, 1);
    assert_eq!(window.version, fixture.queue().version);
}

#[test]
fn a_removed_track_cannot_start() {
    let fixture = Fixture::with(&clips(&["a"]));
    let a = fixture.id("a");
    let directory = fixture
        .library
        .directories()
        .expect("directories")
        .pop()
        .expect("the music directory");
    // The first scan may still be running; the directory can go once it has finished.
    let removed = wait_until(
        || fixture.library.remove_directory(directory.id).is_ok(),
        WAIT,
    );
    assert!(removed, "the directory was removed");
    let emptied = wait_until(|| library_tracks(&fixture.library).is_empty(), WAIT);
    assert!(emptied, "the track left the library");

    assert_eq!(
        fixture.player.play_queue(vec![a], 0).code_of(),
        Some(CommandError::TrackUnavailable)
    );
}
