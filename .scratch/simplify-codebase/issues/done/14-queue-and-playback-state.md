# 14: Queue by id and one QueueRow

## What to build

The queue knows its current entry by id. The queue state published to the Renderer is one plain value with one row shape, `QueueRow`, for the current item, history, upcoming, windows, and the current playback. Fields the Renderer never reads are gone.

## How

`backend/src/audio/playback/` (merge and delete the old files). `playback.rs` is the only file other modules see (ticket 13); `queue.rs` and `state.rs` are private children, and `playback.rs` re-exports the state types. `audio/queue.rs` and `audio/state.rs` do not exist.

- `queue.rs` (stays at `playback/queue.rs`): the current entry is `Option<QueueItemId>`; the index is computed when needed. `current_arranged_index`'s clamp and the id lookup in `set_shuffle` go. `QueueError` stays private and converts to `CommandError` (`QueueItemNotFound`, `QueueBusy`) where the `Player` methods return it.
- `state.rs` ← `playback/snapshot.rs` and the publish code it serves: `PlaybackState`, `PlaybackControls`, `CurrentPlayback`, `StartedBy`, `QueueState`, `QueueWindow`, `RepeatMode` (renamed in ticket 03). `QueueRow` replaces `PlaybackQueueItem` and `PlaybackItem` (delete `PlayableItem::to_playback_item`); it carries `NowPlayingTrack`, the shape `PlaybackItem` already has. Remove `QueueState.historyCount` and `canRestorePrevious` (undo is offered from `clear_queue`'s answer), `CurrentPlayback.outputDevice.id`, `PlaybackState::Failed.playbackId`, and the unused `PlaybackState::active_item`. `QueueState` is a plain value (contract below).
- `queue_window` reads `upcoming_entries` on the caller's thread and the rows from the Library store in one query. The window size is one constant, `UPCOMING_WINDOW = 100`, exported through the bindings and used by the Renderer.
- Names inside the worker that mention the old shapes change with them; the worker keeps its structure until ticket 15.
- Renderer: replace `PlaybackQueueItem` and `PlaybackItem` with `QueueRow` in the types and components that use them; remove reads of `historyCount`, `canRestorePrevious`, `album` on the queue row, `outputDevice.id`, and `Failed.playbackId`; the upcoming list uses `UPCOMING_WINDOW` instead of its own constant. The Player area is rewritten in ticket 18. Run `pnpm bindings`.

## Contracts

```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
pub struct QueueState {
    pub current: Option<QueueRow>,
    pub history: Vec<QueueRow>,   // newest HISTORY_IN_STATE, oldest first
    pub upcoming: Vec<QueueRow>,  // first UPCOMING_IN_STATE
    pub upcoming_count: u32,
    pub repeat_mode: RepeatMode,
    pub shuffle_enabled: bool,
    #[serde(skip)] #[specta(skip)]
    pub(crate) upcoming_entries: Arc<[QueueEntry]>,
}
pub struct QueueRow { pub queue_item_id: QueueItemId, pub track: NowPlayingTrack }
pub struct QueueWindow { pub version: u64, pub offset: u32, pub items: Vec<QueueRow> }
```

`NowPlayingTrack` is the one track shape for every row. The queue panel reads a subset of it; the Now Playing column reads the rest. Its `album` stays.

## Tests

Queue and state are pure: inline unit tests in `queue.rs` and `state.rs` (prior art: `playback/tests/queue.rs`, `snapshot.rs`, `preferences.rs`). Cover: the current entry by id after remove, move, and shuffle; repeat modes; history and upcoming limits; `QueueState` equality; `queue_window` offsets. The seam tests are the `Player` tests in `backend/src/audio/playback/tests.rs` and `tests/*.rs`; they change to the new shapes. Delete the JSON field-name tests. Renderer: the tests that built `PlaybackQueueItem` fixtures use `QueueRow`.

## Acceptance criteria

- [ ] `playback/queue.rs` and `playback/state.rs` exist; `snapshot.rs` and `item.rs` and the types named above are gone.
- [ ] The 25 unit tests of `queue.rs` are reviewed: a test that copies the implementation (a table of the same `match`, a constant, a getter) is deleted; a test of behavior stays.
- [ ] `QueueState` is a plain value with the fields above; `historyCount` and `canRestorePrevious` do not exist in the Backend or the Renderer.
- [ ] `pnpm bindings`, `pnpm check`, `pnpm check:native`, `pnpm test:native`, `pnpm test:renderer`, `pnpm test:e2e` pass.

## Comments

The How cannot be implemented as written, because `QueueRow { track: TrackCore }` also replaces `PlaybackItem`, which is the type of the current playback's item. That item carries fields the Renderer reads, so the ticket's "fields the Renderer never reads are gone" does not hold for it:

- `src/lib/components/now-playing/track-facts.ts:22-27` reads `item.year`, `item.discNumber`, `item.trackNumber`, and `item.album.trackCount` for the Facts line.
- `src/lib/playback/playback.svelte.ts:202` reads `this.#item?.album?.id` to decide whether the album being shown is the one playing.

`TrackCore` has none of these (`backend/src/library/models.rs:91`). They are on `NowPlayingTrack` (`models.rs:210`: `core`, `album`, `track_number`, `disc_number`, `year`), which `PlaybackItem` flattens.

Decision needed, and this ticket does not make it:

1. `QueueRow` for queue entries uses `TrackCore`, and the current playback keeps `NowPlayingTrack` (or a `NowPlayingTrack`-based row). The contract and "replaces `PlaybackItem`" then change.
2. `QueueRow` keeps `NowPlayingTrack` for all rows. This adds the fields the queue panel does not read, against the ticket's intent.
3. The Renderer gets the album and facts from another read (for example the library), which is a new behavior no ticket describes.

No code was changed. The working tree is clean.

Resolved: option 2 chosen by the user. The How and Contracts above now say `QueueRow` carries `NowPlayingTrack`, and `QueueRow.album` is no longer removed.
