//! The playback queue as a pure data structure: no I/O, no clock, and randomness only through an
//! injected generator. The worker owns one for its whole life; an empty queue means "nothing
//! queued".
//!
//! The queue holds track ids, not tracks: what an entry looks like is read when it is needed
//! (see `QueueState` in `state.rs`). The arranged order is the one source of truth for what is queued and how
//! the listener arranged it. Shuffle is only a second list, the order the entries play in;
//! turning it off drops that list, so nothing can be lost or reordered by having shuffled.

use std::collections::HashSet;
use std::sync::Arc;

use rand::{Rng, seq::SliceRandom};

use crate::ids::{QueueItemId, TrackId};
use crate::player::errors::PlayerError;
use crate::player::errors::Result;

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMode {
    Off,
    All,
    One,
}

/// Why the queue is asked for another item; repeat-one only applies to a natural finish.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum AdvanceReason {
    Natural,
    UserNext,
    UserPrevious,
}

/// One place in the queue: its own id, and the library track it plays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueueEntry {
    pub(super) id: QueueItemId,
    pub track_id: TrackId,
}

/// Edits an order that snapshots may share: the order is copied, changed, and stored back.
fn edit_order<R>(
    order: &mut Arc<[QueueEntry]>,
    change: impl FnOnce(&mut Vec<QueueEntry>) -> R,
) -> R {
    let mut entries = order.to_vec();
    let result = change(&mut entries);
    *order = entries.into();
    result
}

#[derive(Debug, Clone)]
pub struct Queue {
    /// The order the entries were queued and arranged in. Shuffle never touches it.
    arranged: Arc<[QueueEntry]>,
    /// While shuffle is on, the order the entries play in; the same entries as `arranged`.
    shuffled: Option<Arc<[QueueEntry]>>,
    /// The id of the current entry; `None` when nothing is current.
    current: Option<QueueItemId>,
    repeat: RepeatMode,
    shuffle: bool,
    next_item_id: QueueItemId,
}

impl Queue {
    pub fn new(repeat: RepeatMode, shuffle: bool) -> Self {
        Self {
            arranged: Arc::default(),
            shuffled: None,
            current: None,
            repeat,
            shuffle,
            next_item_id: QueueItemId::first(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.arranged.is_empty()
    }

    pub fn len(&self) -> usize {
        self.arranged.len()
    }

    pub fn repeat(&self) -> RepeatMode {
        self.repeat
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    /// The order the entries play in: the arranged order, or the shuffled one.
    pub fn play_order(&self) -> &Arc<[QueueEntry]> {
        self.shuffled.as_ref().unwrap_or(&self.arranged)
    }

    /// The position of the current entry in `play_order`; the length when nothing is current.
    pub fn position(&self) -> usize {
        match self.current {
            Some(id) => self
                .play_order()
                .iter()
                .position(|entry| entry.id == id)
                .expect("the current entry is in the play order"),
            None => self.play_order().len(),
        }
    }

    /// Makes the entry at `position` in `play_order` current. Past the end makes nothing current.
    fn set_position(&mut self, position: usize) {
        self.current = self.play_order().get(position).map(|entry| entry.id);
    }

    pub fn current(&self) -> Option<&QueueEntry> {
        self.play_order().get(self.position())
    }

    /// What was played before the current entry, oldest first.
    pub fn history(&self) -> &[QueueEntry] {
        self.play_order().get(..self.position()).unwrap_or_default()
    }

    pub fn upcoming(&self) -> &[QueueEntry] {
        self.play_order()
            .get(self.position() + 1..)
            .unwrap_or_default()
    }

    /// Whether the queue can move backward or forward. Repeat-all wraps, but a single item has
    /// nowhere else to go.
    pub fn can_go_previous(&self) -> bool {
        self.position() > 0 || self.wraps()
    }

    pub fn can_go_next(&self) -> bool {
        self.position() + 1 < self.len() || self.wraps()
    }

    fn wraps(&self) -> bool {
        self.repeat == RepeatMode::All && self.len() > 1
    }

    fn new_entry(&mut self, track_id: TrackId) -> QueueEntry {
        let id = self.next_item_id;
        self.next_item_id = id.next();
        QueueEntry { id, track_id }
    }

    /// Replaces the queue and makes `start_index` current. Untouched on error.
    pub fn replace<R: Rng + ?Sized>(
        &mut self,
        track_ids: Vec<TrackId>,
        start_index: usize,
        rng: &mut R,
    ) {
        assert!(
            start_index < track_ids.len(),
            "a queue start names one of its items"
        );
        let entries: Vec<QueueEntry> = track_ids
            .into_iter()
            .map(|track_id| self.new_entry(track_id))
            .collect();
        self.current = Some(entries[start_index].id);
        self.arranged = entries.into();
        self.shuffled = None;
        if self.shuffle {
            self.shuffle_around_current(rng);
        }
    }

    /// Puts back a queue that was replaced, keeping this queue's repeat and shuffle settings
    /// and never reusing an item id.
    pub fn restore<R: Rng + ?Sized>(&mut self, previous: Queue, rng: &mut R) {
        let (repeat, shuffle) = (self.repeat, self.shuffle);
        let next_item_id = self.next_item_id.max(previous.next_item_id);
        *self = previous;
        self.repeat = repeat;
        self.next_item_id = next_item_id;
        if self.shuffle != shuffle {
            self.set_shuffle(shuffle, rng);
        }
    }

    pub fn clear(&mut self) {
        self.arranged = Arc::default();
        self.shuffled = None;
        self.current = None;
    }

    /// Drops everything after the current item.
    pub fn clear_upcoming(&mut self) -> bool {
        if self.upcoming().is_empty() {
            return false;
        }
        let keep = self.position() + 1;
        match &mut self.shuffled {
            Some(shuffled) => {
                let dropped: HashSet<QueueItemId> = shuffled[keep.min(shuffled.len())..]
                    .iter()
                    .map(|entry| entry.id)
                    .collect();
                edit_order(shuffled, |order| order.truncate(keep));
                edit_order(&mut self.arranged, |arranged| {
                    arranged.retain(|entry| !dropped.contains(&entry.id));
                });
            }
            None => edit_order(&mut self.arranged, |arranged| arranged.truncate(keep)),
        }
        true
    }

    pub fn remove_upcoming(&mut self, id: QueueItemId) -> Result<()> {
        let index = self.upcoming_index(id)?;
        let removed = edit_order(self.play_order_mut(), |order| order.remove(index));
        if self.shuffled.is_some() {
            edit_order(&mut self.arranged, |arranged| {
                arranged.retain(|entry| entry.id != removed.id);
            });
        }
        Ok(())
    }

    /// Moves an upcoming item to `to`, an index into the upcoming list (0 is next up); an index
    /// past the end means the end. Returns whether the order changed. The current item never
    /// moves and nothing is placed before it.
    ///
    /// While shuffled this moves the item in the play order, and in the arranged order it lands
    /// right after the entry that now plays before it.
    pub fn move_upcoming(&mut self, id: QueueItemId, to: usize) -> Result<bool> {
        let index = self.upcoming_index(id)?;
        let target = self
            .position()
            .saturating_add(1)
            .saturating_add(to)
            .min(self.len() - 1);
        if target == index {
            return Ok(false);
        }
        let (entry, predecessor) = edit_order(self.play_order_mut(), |order| {
            let entry = order.remove(index);
            order.insert(target, entry.clone());
            // The entry before the moved one. `target` is at least 1, because `current + 1` is.
            let predecessor = order.get(target.saturating_sub(1)).map(|entry| entry.id);
            (entry, predecessor)
        });
        let predecessor = predecessor.ok_or(PlayerError::QueueItemNotFound)?;
        if self.shuffled.is_some() {
            edit_order(&mut self.arranged, |arranged| {
                arranged.retain(|other| other.id != entry.id);
                let after = arranged
                    .iter()
                    .position(|other| other.id == predecessor)
                    .map_or(arranged.len(), |position| position + 1);
                arranged.insert(after, entry);
            });
        }
        Ok(true)
    }

    /// Makes any other item current, played or upcoming: the listener picked it from the queue.
    pub fn jump_to(&mut self, id: QueueItemId) -> Result<()> {
        let known = self.play_order().iter().any(|entry| entry.id == id);
        if !known || self.current == Some(id) {
            return Err(PlayerError::QueueItemNotFound);
        }
        self.current = Some(id);
        Ok(())
    }

    /// Adds items right after the current one (`next`) or at the end. The current item stays
    /// current. An empty queue has nothing to add to, so it is an error: start one instead.
    ///
    /// While shuffled the items are added in the same place of both orders: after the current
    /// item, or at the end.
    pub fn enqueue(&mut self, track_ids: Vec<TrackId>, next: bool) {
        assert!(!self.is_empty(), "enqueue needs a current item");
        let entries: Vec<QueueEntry> = track_ids
            .into_iter()
            .map(|track_id| self.new_entry(track_id))
            .collect();
        let current_id = self.current;
        let at = if next {
            self.position() + 1
        } else {
            self.len()
        };
        if self.shuffled.is_some() {
            edit_order(&mut self.arranged, |arranged| {
                let arranged_at = match (next, current_id) {
                    (true, Some(current_id)) => arranged
                        .iter()
                        .position(|entry| entry.id == current_id)
                        .map_or(arranged.len(), |position| position + 1),
                    _ => arranged.len(),
                };
                arranged.splice(arranged_at..arranged_at, entries.iter().cloned());
            });
        }
        edit_order(self.play_order_mut(), |order| {
            order.splice(at..at, entries);
        });
    }

    fn play_order_mut(&mut self) -> &mut Arc<[QueueEntry]> {
        self.shuffled.as_mut().unwrap_or(&mut self.arranged)
    }

    fn upcoming_index(&self, id: QueueItemId) -> Result<usize> {
        self.play_order()
            .iter()
            .position(|entry| entry.id == id)
            .filter(|index| *index > self.position())
            .ok_or(PlayerError::QueueItemNotFound)
    }

    pub fn set_repeat(&mut self, repeat: RepeatMode) -> bool {
        std::mem::replace(&mut self.repeat, repeat) != repeat
    }

    /// Turning shuffle on keeps the current item first and shuffles the rest into a play order;
    /// turning it off drops the play order, so the arranged order plays again around the
    /// current item.
    pub fn set_shuffle<R: Rng + ?Sized>(&mut self, enabled: bool, rng: &mut R) -> bool {
        if self.shuffle == enabled {
            return false;
        }
        self.shuffle = enabled;
        if self.is_empty() {
            return true;
        }
        if enabled {
            self.shuffle_around_current(rng);
        } else {
            self.shuffled = None;
        }
        true
    }

    /// Moves to another item and returns it, or `None` at either end of a non-wrapping queue.
    pub fn advance<R: Rng + ?Sized>(
        &mut self,
        reason: AdvanceReason,
        rng: &mut R,
    ) -> Option<&QueueEntry> {
        if self.is_empty() {
            return None;
        }
        let position = self.position();
        match reason {
            AdvanceReason::Natural if self.repeat == RepeatMode::One => {}
            AdvanceReason::Natural | AdvanceReason::UserNext => {
                if position + 1 < self.len() {
                    self.set_position(position + 1);
                } else if self.repeat == RepeatMode::All {
                    self.wrap_to_start(rng);
                } else {
                    return None;
                }
            }
            AdvanceReason::UserPrevious => {
                if position > 0 {
                    self.set_position(position - 1);
                } else if self.repeat == RepeatMode::All {
                    self.set_position(self.len() - 1);
                } else {
                    return None;
                }
            }
        }
        self.current()
    }

    /// The entry a natural finish would move to, when that is already decided. A shuffled queue
    /// that wraps is shuffled only when it does, so it has no next entry yet.
    pub fn peek_natural(&self) -> Option<&QueueEntry> {
        if self.is_empty() {
            return None;
        }
        if self.repeat == RepeatMode::One {
            return self.current();
        }
        let position = self.position();
        if position + 1 < self.len() {
            return self.play_order().get(position + 1);
        }
        (self.repeat == RepeatMode::All && self.shuffled.is_none())
            .then(|| self.play_order().first())
            .flatten()
    }

    /// Starts another pass. A shuffled queue is shuffled again, without repeating the item that
    /// just played back to back.
    fn wrap_to_start<R: Rng + ?Sized>(&mut self, rng: &mut R) {
        if let Some(shuffled) = &mut self.shuffled
            && shuffled.len() > 1
        {
            let last_played = self.current;
            edit_order(shuffled, |order| {
                order.shuffle(rng);
                if order.first().map(|entry| entry.id) == last_played {
                    let other = rng.random_range(1..order.len());
                    order.swap(0, other);
                }
            });
        }
        self.set_position(0);
    }

    /// Shuffles the arranged order into a new play order that starts with the current entry.
    /// With nothing current, the whole queue is shuffled and nothing is made current.
    fn shuffle_around_current<R: Rng + ?Sized>(&mut self, rng: &mut R) {
        let mut order: Vec<QueueEntry> = self.arranged.to_vec();
        let current = self.current.and_then(|id| {
            let index = order.iter().position(|entry| entry.id == id)?;
            Some(order.remove(index))
        });
        order.shuffle(rng);
        if let Some(current) = current {
            order.insert(0, current);
        }
        self.shuffled = Some(order.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{SeedableRng, rngs::StdRng};

    /// The track with this rowid.
    fn track(number: i64) -> TrackId {
        TrackId::try_from_rowid(number).unwrap()
    }

    /// Tracks 1 to `count`.
    fn ids(count: usize) -> Vec<TrackId> {
        (1..=(count as i64)).map(track).collect()
    }

    /// The track rowids in play order.
    fn order(queue: &Queue) -> Vec<i64> {
        queue
            .play_order()
            .iter()
            .map(|entry| entry.track_id.rowid())
            .collect()
    }

    fn arranged(queue: &Queue) -> Vec<i64> {
        queue
            .arranged
            .iter()
            .map(|entry| entry.track_id.rowid())
            .collect()
    }

    fn current(queue: &Queue) -> i64 {
        queue.current().unwrap().track_id.rowid()
    }

    fn item_id(queue: &Queue, number: i64) -> QueueItemId {
        queue
            .play_order()
            .iter()
            .find(|entry| entry.track_id == track(number))
            .unwrap()
            .id
    }

    /// An item ID no queue holds.
    fn unknown_item() -> QueueItemId {
        serde_json::from_value(serde_json::json!(9999)).unwrap()
    }

    fn queue_of(count: usize, start: usize, repeat: RepeatMode, shuffle: bool) -> Queue {
        let mut queue = Queue::new(repeat, shuffle);
        queue.replace(ids(count), start, &mut StdRng::seed_from_u64(7));
        queue
    }

    fn rng() -> StdRng {
        StdRng::seed_from_u64(42)
    }

    #[test]
    #[should_panic(expected = "names one of its items")]
    fn replace_panics_on_an_out_of_range_start() {
        let mut queue = queue_of(3, 1, RepeatMode::Off, false);
        queue.replace(ids(2), 2, &mut rng());
    }

    #[test]
    fn item_ids_stay_unique_across_replacements() {
        let mut queue = queue_of(2, 0, RepeatMode::Off, false);
        let first = queue.current().unwrap().id;
        queue.replace(ids(2), 0, &mut rng());
        assert_ne!(queue.current().unwrap().id, first);
    }

    #[test]
    fn shuffle_keeps_the_same_items_current_first_and_changes_the_order() {
        let mut queue = queue_of(20, 5, RepeatMode::Off, false);
        let before = order(&queue);
        assert!(queue.set_shuffle(true, &mut rng()));

        let after = order(&queue);
        assert_eq!(after[0], 6);
        assert_eq!(queue.position(), 0);
        let mut sorted_before = before.clone();
        let mut sorted_after = after.clone();
        sorted_before.sort_unstable();
        sorted_after.sort_unstable();
        assert_eq!(sorted_before, sorted_after);
        assert_eq!(arranged(&queue), before, "the arranged order is untouched");

        let rest: Vec<i64> = before.iter().copied().filter(|t| *t != 6).collect();
        let mut reversed = rest.clone();
        reversed.reverse();
        assert_ne!(after[1..], rest[..], "shuffle must change the order");
        assert_ne!(after[1..], reversed[..], "shuffle is not a reversal");
    }

    #[test]
    fn shuffle_off_restores_the_arranged_order_around_the_current_item() {
        let mut queue = queue_of(10, 3, RepeatMode::Off, false);
        let original = order(&queue);
        queue.set_shuffle(true, &mut rng());
        queue.advance(AdvanceReason::UserNext, &mut rng());
        let playing = current(&queue);

        queue.set_shuffle(false, &mut rng());

        assert_eq!(order(&queue), original);
        assert_eq!(current(&queue), playing);
    }

    #[test]
    fn replace_while_shuffled_starts_at_the_requested_item() {
        let mut queue = Queue::new(RepeatMode::Off, true);
        queue.replace(ids(8), 4, &mut rng());
        assert_eq!(current(&queue), 5);
        assert_eq!(queue.len(), 8);
    }

    #[test]
    fn next_and_previous_stop_at_the_ends_unless_repeating_all() {
        let mut queue = queue_of(2, 0, RepeatMode::Off, false);
        assert!(
            queue
                .advance(AdvanceReason::UserPrevious, &mut rng())
                .is_none()
        );
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            track(2)
        );
        assert!(queue.advance(AdvanceReason::UserNext, &mut rng()).is_none());
        assert!(queue.advance(AdvanceReason::Natural, &mut rng()).is_none());

        queue.set_repeat(RepeatMode::All);
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            track(1)
        );
        assert_eq!(
            queue
                .advance(AdvanceReason::UserPrevious, &mut rng())
                .unwrap()
                .track_id,
            track(2)
        );
    }

    #[test]
    fn repeat_one_only_repeats_on_a_natural_finish() {
        let mut queue = queue_of(3, 1, RepeatMode::One, false);
        assert_eq!(
            queue
                .advance(AdvanceReason::Natural, &mut rng())
                .unwrap()
                .track_id,
            track(2)
        );
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            track(3)
        );
    }

    #[test]
    fn navigation_flags_follow_position_and_repeat() {
        let mut queue = queue_of(3, 0, RepeatMode::Off, false);
        assert!(!queue.can_go_previous() && queue.can_go_next());
        queue.set_repeat(RepeatMode::All);
        assert!(queue.can_go_previous() && queue.can_go_next());
        let single = queue_of(1, 0, RepeatMode::All, false);
        assert!(!single.can_go_previous() && !single.can_go_next());
    }

    #[test]
    fn repeat_all_reshuffles_a_shuffled_queue_on_every_pass() {
        let mut queue = queue_of(12, 0, RepeatMode::All, true);
        let mut rng = rng();
        let first_pass = order(&queue);
        let arranged_before = arranged(&queue);
        let last = *first_pass.last().unwrap();
        for _ in 0..first_pass.len() - 1 {
            queue.advance(AdvanceReason::Natural, &mut rng);
        }
        assert_eq!(current(&queue), last);

        let wrapped = queue
            .advance(AdvanceReason::Natural, &mut rng)
            .unwrap()
            .track_id
            .rowid();
        assert_ne!(
            wrapped, last,
            "the finished item must not repeat back to back"
        );
        assert_eq!(queue.position(), 0);
        let second_pass = order(&queue);
        assert_eq!(second_pass[0], wrapped);
        assert_ne!(first_pass, second_pass);
        assert_eq!(arranged(&queue), arranged_before);
        let mut a = first_pass;
        let mut b = second_pass;
        a.sort_unstable();
        b.sort_unstable();
        assert_eq!(a, b);
    }

    #[test]
    fn move_never_displaces_or_precedes_the_current_item() {
        // The current item is not the first entry, so an unchecked move would displace it.
        let mut queue = queue_of(5, 2, RepeatMode::Off, false);
        let first_upcoming = queue.upcoming()[0].id;
        let current_id = queue.current().unwrap().id;

        assert_eq!(queue.move_upcoming(first_upcoming, 0).ok(), Some(false));
        assert_eq!(queue.current().unwrap().id, current_id);
        assert!(matches!(
            queue.move_upcoming(current_id, 0),
            Err(PlayerError::QueueItemNotFound)
        ));

        assert_eq!(queue.move_upcoming(first_upcoming, 1).ok(), Some(true));
        assert_eq!(queue.upcoming()[1].id, first_upcoming);
        assert_eq!(queue.current().unwrap().id, current_id);
    }

    #[test]
    fn move_places_an_item_at_the_requested_upcoming_position() {
        let mut queue = queue_of(6, 1, RepeatMode::Off, false);
        let upcoming = |queue: &Queue| -> Vec<QueueItemId> {
            queue.upcoming().iter().map(|entry| entry.id).collect()
        };
        let ids = upcoming(&queue);

        // Forward over several items, then back to the front.
        assert_eq!(queue.move_upcoming(ids[0], 3).ok(), Some(true));
        assert_eq!(upcoming(&queue), [ids[1], ids[2], ids[3], ids[0]]);
        assert_eq!(queue.move_upcoming(ids[0], 0).ok(), Some(true));
        assert_eq!(queue.upcoming()[0].id, ids[0]);

        // Past the end clamps to the end; an unchanged position reports no change.
        assert_eq!(queue.move_upcoming(ids[0], 99).ok(), Some(true));
        assert_eq!(queue.upcoming().last().unwrap().id, ids[0]);
        assert_eq!(queue.move_upcoming(ids[0], 99).ok(), Some(false));
    }

    #[test]
    fn edits_reject_played_and_unknown_items() {
        let mut queue = queue_of(4, 2, RepeatMode::Off, false);
        let played = queue.history()[0].id;
        assert!(matches!(
            queue.remove_upcoming(played),
            Err(PlayerError::QueueItemNotFound)
        ));
        assert!(matches!(
            queue.remove_upcoming(unknown_item()),
            Err(PlayerError::QueueItemNotFound)
        ));
        let upcoming = queue.upcoming()[0].id;
        assert_eq!(queue.remove_upcoming(upcoming).ok(), Some(()));
        assert_eq!(queue.len(), 3);
        assert!(!queue.clear_upcoming());
    }

    #[test]
    fn edits_made_while_shuffled_survive_turning_shuffle_off() {
        let mut queue = queue_of(6, 0, RepeatMode::Off, true);
        let removed = queue.upcoming()[0].id;
        queue.remove_upcoming(removed).unwrap();
        queue.set_shuffle(false, &mut rng());
        assert_eq!(queue.len(), 5);
        assert!(queue.arranged.iter().all(|entry| entry.id != removed));
        assert_eq!(arranged(&queue)[0], 1);
    }

    #[test]
    fn items_enqueued_while_shuffled_keep_their_place_when_shuffle_turns_off() {
        // The review's B1: four items, shuffle on, enqueue one, shuffle off must leave five.
        let mut queue = queue_of(4, 0, RepeatMode::Off, true);
        queue.enqueue(vec![track(51)], false);
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), [1, 2, 3, 4, 51]);

        // Play next while shuffled lands right after the current item in the arranged order.
        let mut queue = queue_of(5, 2, RepeatMode::Off, false);
        queue.set_shuffle(true, &mut rng());
        queue.enqueue(vec![track(50)], true);
        assert_eq!(queue.upcoming()[0].track_id, track(50));
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), [1, 2, 3, 50, 4, 5]);
        assert_eq!(current(&queue), 3);
    }

    #[test]
    fn a_move_made_while_shuffled_is_kept_after_the_entry_that_now_precedes_it() {
        let mut queue = queue_of(6, 0, RepeatMode::Off, true);
        let last = queue.upcoming().last().unwrap().clone();
        assert_eq!(queue.move_upcoming(last.id, 1).ok(), Some(true));
        assert_eq!(queue.upcoming()[1], last);
        let predecessor = queue.upcoming()[0].track_id.rowid();

        queue.set_shuffle(false, &mut rng());

        let arranged = order(&queue);
        let at = arranged
            .iter()
            .position(|number| *number == last.track_id.rowid())
            .unwrap();
        assert_eq!(arranged[at - 1], predecessor);
        assert_eq!(arranged.len(), 6);
    }

    #[test]
    fn clearing_upcoming_while_shuffled_removes_those_items_for_good() {
        let mut queue = queue_of(6, 0, RepeatMode::Off, true);
        let playing = current(&queue);
        assert!(queue.clear_upcoming());
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), [playing]);
    }

    #[test]
    fn invariants_hold_over_random_operation_sequences() {
        for seed_value in 0..50u64 {
            let mut rng = StdRng::seed_from_u64(seed_value);
            let mut queue = Queue::new(RepeatMode::Off, false);
            queue.replace(ids(9), 0, &mut rng);
            for step in 0..300u32 {
                match rng.random_range(0..11) {
                    0 => {
                        queue.advance(AdvanceReason::UserNext, &mut rng);
                    }
                    1 => {
                        queue.advance(AdvanceReason::UserPrevious, &mut rng);
                    }
                    2 => {
                        queue.advance(AdvanceReason::Natural, &mut rng);
                    }
                    3 => {
                        let enabled = rng.random_bool(0.5);
                        queue.set_shuffle(enabled, &mut rng);
                    }
                    4 => {
                        let mode = [RepeatMode::Off, RepeatMode::All, RepeatMode::One]
                            [rng.random_range(0..3)];
                        queue.set_repeat(mode);
                    }
                    5 => {
                        if let Some(id) = queue.upcoming().first().map(|entry| entry.id) {
                            queue.remove_upcoming(id).unwrap();
                        }
                    }
                    6 => {
                        if let Some(id) = queue.upcoming().last().map(|entry| entry.id) {
                            queue.move_upcoming(id, rng.random_range(0..4)).unwrap();
                        }
                    }
                    7 => {
                        if step % 7 == 0 {
                            queue.clear_upcoming();
                        }
                    }
                    8 | 9 => {
                        if !queue.is_empty() {
                            let ids =
                                vec![track(1000 + i64::from(step)), track(2000 + i64::from(step))];
                            queue.enqueue(ids, rng.random_bool(0.5));
                        }
                    }
                    _ => {
                        if queue.len() < 3 {
                            queue.replace(ids(9), rng.random_range(0..9), &mut rng);
                        }
                    }
                }
                let play: HashSet<_> = queue.play_order().iter().map(|e| e.id).collect();
                assert_eq!(play.len(), queue.play_order().len(), "ids are unique");
                assert!(queue.is_empty() || queue.position() < queue.len());
                let arranged: HashSet<_> = queue.arranged.iter().map(|e| e.id).collect();
                assert_eq!(arranged.len(), queue.arranged.len());
                assert_eq!(
                    arranged, play,
                    "the arranged order holds exactly the queued items, shuffled or not"
                );
                assert_eq!(queue.shuffled.is_some(), queue.shuffle && !queue.is_empty());
            }
        }
    }

    #[test]
    fn peek_natural_names_the_entry_a_natural_finish_moves_to() {
        let mut queue = queue_of(3, 0, RepeatMode::Off, false);
        let second = queue.play_order()[1].id;
        assert_eq!(queue.peek_natural().map(|entry| entry.id), Some(second));
        queue.advance(AdvanceReason::Natural, &mut rng());
        queue.advance(AdvanceReason::Natural, &mut rng());
        assert!(queue.peek_natural().is_none(), "the end of the queue");

        queue.set_repeat(RepeatMode::All);
        let first = queue.play_order()[0].id;
        assert_eq!(queue.peek_natural().map(|entry| entry.id), Some(first));

        queue.set_repeat(RepeatMode::One);
        let current = queue.current().map(|entry| entry.id);
        assert_eq!(queue.peek_natural().map(|entry| entry.id), current);

        queue.set_repeat(RepeatMode::All);
        queue.set_shuffle(true, &mut rng());
        queue.advance(AdvanceReason::Natural, &mut rng());
        queue.advance(AdvanceReason::Natural, &mut rng());
        assert!(
            queue.peek_natural().is_none(),
            "a shuffled pass is shuffled again only when it wraps"
        );
    }

    #[test]
    fn jumping_back_to_a_played_item_makes_it_current() {
        let mut queue = queue_of(4, 2, RepeatMode::Off, false);
        let id = queue.history()[0].id;
        queue.jump_to(id).expect("played");
        assert_eq!(current(&queue), 1);
        assert_eq!(queue.upcoming().len(), 3);
        assert!(matches!(
            queue.jump_to(id),
            Err(PlayerError::QueueItemNotFound)
        ));
        assert!(matches!(
            queue.jump_to(unknown_item()),
            Err(PlayerError::QueueItemNotFound)
        ));
    }

    #[test]
    fn jumping_to_an_upcoming_item_skips_the_ones_before_it() {
        let mut queue = queue_of(4, 0, RepeatMode::Off, false);
        let id = item_id(&queue, 3);
        queue.jump_to(id).expect("upcoming");
        assert_eq!(current(&queue), 3);
        assert_eq!(queue.upcoming().len(), 1);
        assert_eq!(queue.history().len(), 2);
    }

    #[test]
    fn enqueue_adds_after_current_or_at_the_end() {
        let mut queue = queue_of(3, 0, RepeatMode::Off, false);
        queue.enqueue(vec![track(52)], false);
        queue.enqueue(vec![track(50)], true);
        assert_eq!(order(&queue), [1, 50, 2, 3, 52]);
        assert_eq!(current(&queue), 1);
    }

    #[test]
    #[should_panic(expected = "needs a current item")]
    fn enqueue_panics_without_a_current_item() {
        let mut queue = Queue::new(RepeatMode::Off, false);
        queue.enqueue(vec![track(1)], true);
    }

    #[test]
    fn nothing_current_stays_nothing_current_across_shuffle() {
        let mut queue = queue_of(2, 1, RepeatMode::Off, false);
        queue.clear();
        assert!(queue.current().is_none());

        queue.set_shuffle(true, &mut rng());
        assert!(queue.current().is_none());

        queue.set_shuffle(false, &mut rng());
        assert!(queue.current().is_none());
        assert_eq!(queue.position(), queue.len());
    }

    #[test]
    fn a_replaced_queue_can_be_put_back_with_the_current_settings() {
        let mut queue = queue_of(5, 2, RepeatMode::Off, false);
        let before = queue.clone();
        queue.replace(ids(3), 0, &mut rng());
        queue.set_repeat(RepeatMode::All);
        queue.set_shuffle(true, &mut rng());

        queue.restore(before, &mut rng());

        assert_eq!(queue.repeat(), RepeatMode::All);
        assert!(queue.shuffle());
        assert_eq!(current(&queue), 3, "the same item is current");
        let mut restored = order(&queue);
        restored.sort_unstable();
        assert_eq!(restored, [1, 2, 3, 4, 5]);
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), [1, 2, 3, 4, 5]);
        queue.enqueue(vec![track(53)], false);
        let unique: HashSet<_> = queue.arranged.iter().map(|e| e.id).collect();
        assert_eq!(unique.len(), 6, "ids stay unique across the restored queue");
    }
}
