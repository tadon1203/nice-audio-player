//! The playback queue as a pure data structure: no I/O, no clock, and randomness only through an
//! injected generator. The worker owns one for its whole life; an empty queue means "nothing
//! queued".
//!
//! The queue holds track ids, not tracks: what an entry looks like is read when it is needed
//! (see `resolver`). The arranged order is the one source of truth for what is queued and how
//! the listener arranged it. Shuffle is only a second list, the order the entries play in;
//! turning it off drops that list, so nothing can be lost or reordered by having shuffled.

use std::collections::HashSet;
use std::sync::Arc;

use rand::{seq::SliceRandom, Rng};

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackRepeatMode {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum QueueError {
    /// `replace` needs at least one item and a start index inside them.
    InvalidStart,
    /// The id is unknown, or names the current or an already played item.
    ItemNotUpcoming,
}

const ITEM_ID_PREFIX: &str = "queue-item-";

/// One place in the queue: its own id, and the library track it plays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueueEntry {
    pub(super) id: u64,
    pub track_id: Arc<str>,
}

impl QueueEntry {
    /// The id the renderer and the queue commands know the entry by.
    pub fn queue_item_id(&self) -> String {
        format!("{ITEM_ID_PREFIX}{}", self.id)
    }
}

fn parse_item_id(id: &str) -> Option<u64> {
    id.strip_prefix(ITEM_ID_PREFIX)?.parse().ok()
}

#[derive(Debug, Clone)]
pub struct PlaybackQueue {
    /// The order the entries were queued and arranged in. Shuffle never touches it.
    arranged: Arc<Vec<QueueEntry>>,
    /// While shuffle is on, the order the entries play in; the same entries as `arranged`.
    shuffled: Option<Arc<Vec<QueueEntry>>>,
    /// The position of the current entry in the play order.
    current: usize,
    repeat: PlaybackRepeatMode,
    shuffle: bool,
    next_item_id: u64,
}

impl PlaybackQueue {
    pub fn new(repeat: PlaybackRepeatMode, shuffle: bool) -> Self {
        Self {
            arranged: Arc::default(),
            shuffled: None,
            current: 0,
            repeat,
            shuffle,
            next_item_id: 0,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.arranged.is_empty()
    }

    pub fn len(&self) -> usize {
        self.arranged.len()
    }

    pub fn repeat(&self) -> PlaybackRepeatMode {
        self.repeat
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    /// The order the entries play in: the arranged order, or the shuffled one.
    pub fn play_order(&self) -> &Arc<Vec<QueueEntry>> {
        self.shuffled.as_ref().unwrap_or(&self.arranged)
    }

    /// The position of the current entry in `play_order`.
    pub fn position(&self) -> usize {
        self.current
    }

    pub fn current(&self) -> Option<&QueueEntry> {
        self.play_order().get(self.current)
    }

    /// What was played before the current entry, oldest first.
    pub fn history(&self) -> &[QueueEntry] {
        self.play_order().get(..self.current).unwrap_or_default()
    }

    pub fn upcoming(&self) -> &[QueueEntry] {
        self.play_order()
            .get(self.current + 1..)
            .unwrap_or_default()
    }

    /// Whether the queue can move backward or forward. Repeat-all wraps, but a single item has
    /// nowhere else to go.
    pub fn can_go_previous(&self) -> bool {
        self.current > 0 || self.wraps()
    }

    pub fn can_go_next(&self) -> bool {
        self.current + 1 < self.len() || self.wraps()
    }

    fn wraps(&self) -> bool {
        self.repeat == PlaybackRepeatMode::All && self.len() > 1
    }

    fn new_entry(&mut self, track_id: String) -> QueueEntry {
        self.next_item_id = self.next_item_id.saturating_add(1);
        QueueEntry {
            id: self.next_item_id,
            track_id: track_id.into(),
        }
    }

    /// Replaces the queue and makes `start_index` current. Untouched on error.
    pub fn replace<R: Rng + ?Sized>(
        &mut self,
        track_ids: Vec<String>,
        start_index: usize,
        rng: &mut R,
    ) -> Result<(), QueueError> {
        if start_index >= track_ids.len() {
            return Err(QueueError::InvalidStart);
        }
        let entries: Vec<QueueEntry> = track_ids
            .into_iter()
            .map(|track_id| self.new_entry(track_id))
            .collect();
        self.arranged = Arc::new(entries);
        self.shuffled = None;
        self.current = start_index;
        if self.shuffle {
            self.shuffle_around_current(rng);
        }
        Ok(())
    }

    /// Puts back a queue that was replaced, keeping this queue's repeat and shuffle settings
    /// and never reusing an item id.
    pub fn restore<R: Rng + ?Sized>(&mut self, previous: PlaybackQueue, rng: &mut R) {
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
        self.current = 0;
    }

    /// Drops everything after the current item.
    pub fn clear_upcoming(&mut self) -> bool {
        if self.upcoming().is_empty() {
            return false;
        }
        let keep = self.current + 1;
        match &mut self.shuffled {
            Some(shuffled) => {
                let dropped: HashSet<u64> = shuffled[keep..].iter().map(|entry| entry.id).collect();
                Arc::make_mut(shuffled).truncate(keep);
                Arc::make_mut(&mut self.arranged).retain(|entry| !dropped.contains(&entry.id));
            }
            None => Arc::make_mut(&mut self.arranged).truncate(keep),
        }
        true
    }

    /// Removes the entries with these ids, wherever they are. The current position follows the
    /// entries before it; if the current entry itself goes, the one after it becomes current
    /// (and none is current when it was the last).
    pub fn remove_entries(&mut self, ids: &HashSet<u64>) -> bool {
        let order = self.play_order();
        if !order.iter().any(|entry| ids.contains(&entry.id)) {
            return false;
        }
        let before = order[..self.current.min(order.len())]
            .iter()
            .filter(|entry| ids.contains(&entry.id))
            .count();
        Arc::make_mut(&mut self.arranged).retain(|entry| !ids.contains(&entry.id));
        if let Some(shuffled) = &mut self.shuffled {
            Arc::make_mut(shuffled).retain(|entry| !ids.contains(&entry.id));
        }
        self.current -= before;
        true
    }

    pub fn remove_upcoming(&mut self, id: &str) -> Result<(), QueueError> {
        let index = self.upcoming_index(id)?;
        let removed = Arc::make_mut(self.play_order_mut()).remove(index);
        if self.shuffled.is_some() {
            Arc::make_mut(&mut self.arranged).retain(|entry| entry.id != removed.id);
        }
        Ok(())
    }

    /// Moves an upcoming item to `to`, an index into the upcoming list (0 is next up); an index
    /// past the end means the end. Returns whether the order changed. The current item never
    /// moves and nothing is placed before it.
    ///
    /// While shuffled this moves the item in the play order, and in the arranged order it lands
    /// right after the entry that now plays before it.
    pub fn move_upcoming(&mut self, id: &str, to: usize) -> Result<bool, QueueError> {
        let index = self.upcoming_index(id)?;
        let target = self
            .current
            .saturating_add(1)
            .saturating_add(to)
            .min(self.len() - 1);
        if target == index {
            return Ok(false);
        }
        let order = Arc::make_mut(self.play_order_mut());
        let entry = order.remove(index);
        order.insert(target, entry.clone());
        let predecessor = order[target - 1].id;
        if self.shuffled.is_some() {
            let arranged = Arc::make_mut(&mut self.arranged);
            arranged.retain(|other| other.id != entry.id);
            let after = arranged
                .iter()
                .position(|other| other.id == predecessor)
                .map_or(arranged.len(), |position| position + 1);
            arranged.insert(after, entry);
        }
        Ok(true)
    }

    /// Makes any other item current, played or upcoming: the listener picked it from the queue.
    pub fn jump_to(&mut self, id: &str) -> Result<(), QueueError> {
        let id = parse_item_id(id).ok_or(QueueError::ItemNotUpcoming)?;
        let index = self
            .play_order()
            .iter()
            .position(|entry| entry.id == id)
            .filter(|index| *index != self.current)
            .ok_or(QueueError::ItemNotUpcoming)?;
        self.current = index;
        Ok(())
    }

    /// Adds items right after the current one (`next`) or at the end. The current item stays
    /// current. An empty queue has nothing to add to, so it is an error: start one instead.
    ///
    /// While shuffled the items are added in the same place of both orders: after the current
    /// item, or at the end.
    pub fn enqueue(&mut self, track_ids: Vec<String>, next: bool) -> Result<(), QueueError> {
        if self.is_empty() {
            return Err(QueueError::InvalidStart);
        }
        let entries: Vec<QueueEntry> = track_ids
            .into_iter()
            .map(|track_id| self.new_entry(track_id))
            .collect();
        let current_id = self.current().map(|entry| entry.id);
        let at = if next { self.current + 1 } else { self.len() };
        if self.shuffled.is_some() {
            let arranged = Arc::make_mut(&mut self.arranged);
            let arranged_at = match (next, current_id) {
                (true, Some(current_id)) => arranged
                    .iter()
                    .position(|entry| entry.id == current_id)
                    .map_or(arranged.len(), |position| position + 1),
                _ => arranged.len(),
            };
            arranged.splice(arranged_at..arranged_at, entries.iter().cloned());
        }
        Arc::make_mut(self.play_order_mut()).splice(at..at, entries);
        Ok(())
    }

    fn play_order_mut(&mut self) -> &mut Arc<Vec<QueueEntry>> {
        self.shuffled.as_mut().unwrap_or(&mut self.arranged)
    }

    fn upcoming_index(&self, id: &str) -> Result<usize, QueueError> {
        let id = parse_item_id(id).ok_or(QueueError::ItemNotUpcoming)?;
        self.play_order()
            .iter()
            .position(|entry| entry.id == id)
            .filter(|index| *index > self.current)
            .ok_or(QueueError::ItemNotUpcoming)
    }

    pub fn set_repeat(&mut self, repeat: PlaybackRepeatMode) -> bool {
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
        } else if let Some(shuffled) = self.shuffled.take() {
            let current_id = shuffled.get(self.current).map(|entry| entry.id);
            self.current = current_id
                .and_then(|id| self.arranged.iter().position(|entry| entry.id == id))
                .unwrap_or(0);
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
        match reason {
            AdvanceReason::Natural if self.repeat == PlaybackRepeatMode::One => {}
            AdvanceReason::Natural | AdvanceReason::UserNext => {
                if self.current + 1 < self.len() {
                    self.current += 1;
                } else if self.repeat == PlaybackRepeatMode::All {
                    self.wrap_to_start(rng);
                } else {
                    return None;
                }
            }
            AdvanceReason::UserPrevious => {
                if self.current > 0 {
                    self.current -= 1;
                } else if self.repeat == PlaybackRepeatMode::All {
                    self.current = self.len() - 1;
                } else {
                    return None;
                }
            }
        }
        self.current()
    }

    /// Starts another pass. A shuffled queue is shuffled again, without repeating the item that
    /// just played back to back.
    fn wrap_to_start<R: Rng + ?Sized>(&mut self, rng: &mut R) {
        if let Some(shuffled) = &mut self.shuffled {
            if shuffled.len() > 1 {
                let last_played = shuffled[self.current].id;
                let order = Arc::make_mut(shuffled);
                order.shuffle(rng);
                if order[0].id == last_played {
                    let other = rng.random_range(1..order.len());
                    order.swap(0, other);
                }
            }
        }
        self.current = 0;
    }

    fn shuffle_around_current<R: Rng + ?Sized>(&mut self, rng: &mut R) {
        let mut order: Vec<QueueEntry> = self.arranged.to_vec();
        let current = order.remove(self.current_arranged_index());
        order.shuffle(rng);
        order.insert(0, current);
        self.shuffled = Some(Arc::new(order));
        self.current = 0;
    }

    /// Where the current entry sits in the arranged order. Only meaningful while no shuffled
    /// order exists, which is when this is called.
    fn current_arranged_index(&self) -> usize {
        self.current.min(self.arranged.len().saturating_sub(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{rngs::StdRng, SeedableRng};

    fn ids(count: usize) -> Vec<String> {
        (0..count).map(|i| format!("t{i}")).collect()
    }

    /// The track ids in play order.
    fn order(queue: &PlaybackQueue) -> Vec<String> {
        queue
            .play_order()
            .iter()
            .map(|entry| entry.track_id.to_string())
            .collect()
    }

    fn arranged(queue: &PlaybackQueue) -> Vec<String> {
        queue
            .arranged
            .iter()
            .map(|entry| entry.track_id.to_string())
            .collect()
    }

    fn current(queue: &PlaybackQueue) -> String {
        queue.current().unwrap().track_id.to_string()
    }

    fn item_id(queue: &PlaybackQueue, track: &str) -> String {
        queue
            .play_order()
            .iter()
            .find(|entry| &*entry.track_id == track)
            .unwrap()
            .queue_item_id()
    }

    fn queue_of(
        count: usize,
        start: usize,
        repeat: PlaybackRepeatMode,
        shuffle: bool,
    ) -> PlaybackQueue {
        let mut queue = PlaybackQueue::new(repeat, shuffle);
        queue
            .replace(ids(count), start, &mut StdRng::seed_from_u64(7))
            .expect("valid start");
        queue
    }

    fn rng() -> StdRng {
        StdRng::seed_from_u64(42)
    }

    #[test]
    fn replace_rejects_empty_and_out_of_range_starts_without_changing_the_queue() {
        let mut queue = queue_of(3, 1, PlaybackRepeatMode::Off, false);
        assert_eq!(
            queue.replace(vec![], 0, &mut rng()),
            Err(QueueError::InvalidStart)
        );
        assert_eq!(
            queue.replace(ids(2), 2, &mut rng()),
            Err(QueueError::InvalidStart)
        );
        assert_eq!(queue.len(), 3);
        assert_eq!(current(&queue), "t1");
    }

    #[test]
    fn item_ids_stay_unique_across_replacements() {
        let mut queue = queue_of(2, 0, PlaybackRepeatMode::Off, false);
        let first = queue.current().unwrap().queue_item_id();
        queue.replace(ids(2), 0, &mut rng()).unwrap();
        assert_ne!(queue.current().unwrap().queue_item_id(), first);
    }

    #[test]
    fn shuffle_keeps_the_same_items_current_first_and_changes_the_order() {
        let mut queue = queue_of(20, 5, PlaybackRepeatMode::Off, false);
        let before = order(&queue);
        assert!(queue.set_shuffle(true, &mut rng()));

        let after = order(&queue);
        assert_eq!(after[0], "t5");
        assert_eq!(queue.position(), 0);
        let mut sorted_before = before.clone();
        let mut sorted_after = after.clone();
        sorted_before.sort();
        sorted_after.sort();
        assert_eq!(sorted_before, sorted_after);
        assert_eq!(arranged(&queue), before, "the arranged order is untouched");

        let rest: Vec<_> = before.iter().filter(|t| *t != "t5").cloned().collect();
        let mut reversed = rest.clone();
        reversed.reverse();
        assert_ne!(after[1..], rest[..], "shuffle must change the order");
        assert_ne!(after[1..], reversed[..], "shuffle is not a reversal");
    }

    #[test]
    fn shuffle_off_restores_the_arranged_order_around_the_current_item() {
        let mut queue = queue_of(10, 3, PlaybackRepeatMode::Off, false);
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
        let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, true);
        queue.replace(ids(8), 4, &mut rng()).unwrap();
        assert_eq!(current(&queue), "t4");
        assert_eq!(queue.len(), 8);
    }

    #[test]
    fn next_and_previous_stop_at_the_ends_unless_repeating_all() {
        let mut queue = queue_of(2, 0, PlaybackRepeatMode::Off, false);
        assert!(queue
            .advance(AdvanceReason::UserPrevious, &mut rng())
            .is_none());
        assert_eq!(
            &*queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            "t1"
        );
        assert!(queue.advance(AdvanceReason::UserNext, &mut rng()).is_none());
        assert!(queue.advance(AdvanceReason::Natural, &mut rng()).is_none());

        queue.set_repeat(PlaybackRepeatMode::All);
        assert_eq!(
            &*queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            "t0"
        );
        assert_eq!(
            &*queue
                .advance(AdvanceReason::UserPrevious, &mut rng())
                .unwrap()
                .track_id,
            "t1"
        );
    }

    #[test]
    fn repeat_one_only_repeats_on_a_natural_finish() {
        let mut queue = queue_of(3, 1, PlaybackRepeatMode::One, false);
        assert_eq!(
            &*queue
                .advance(AdvanceReason::Natural, &mut rng())
                .unwrap()
                .track_id,
            "t1"
        );
        assert_eq!(
            &*queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .track_id,
            "t2"
        );
    }

    #[test]
    fn navigation_flags_follow_position_and_repeat() {
        let mut queue = queue_of(3, 0, PlaybackRepeatMode::Off, false);
        assert!(!queue.can_go_previous() && queue.can_go_next());
        queue.set_repeat(PlaybackRepeatMode::All);
        assert!(queue.can_go_previous() && queue.can_go_next());
        let single = queue_of(1, 0, PlaybackRepeatMode::All, false);
        assert!(!single.can_go_previous() && !single.can_go_next());
    }

    #[test]
    fn repeat_all_reshuffles_a_shuffled_queue_on_every_pass() {
        let mut queue = queue_of(12, 0, PlaybackRepeatMode::All, true);
        let mut rng = rng();
        let first_pass = order(&queue);
        let arranged_before = arranged(&queue);
        let last = first_pass.last().unwrap().clone();
        for _ in 0..first_pass.len() - 1 {
            queue.advance(AdvanceReason::Natural, &mut rng);
        }
        assert_eq!(current(&queue), last);

        let wrapped = queue
            .advance(AdvanceReason::Natural, &mut rng)
            .unwrap()
            .track_id
            .to_string();
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
        a.sort();
        b.sort();
        assert_eq!(a, b);
    }

    #[test]
    fn move_never_displaces_or_precedes_the_current_item() {
        // The current item is not the first entry, so an unchecked move would displace it.
        let mut queue = queue_of(5, 2, PlaybackRepeatMode::Off, false);
        let first_upcoming = queue.upcoming()[0].queue_item_id();
        let current_id = queue.current().unwrap().queue_item_id();

        assert_eq!(queue.move_upcoming(&first_upcoming, 0), Ok(false));
        assert_eq!(queue.current().unwrap().queue_item_id(), current_id);
        assert_eq!(
            queue.move_upcoming(&current_id, 0),
            Err(QueueError::ItemNotUpcoming)
        );

        assert_eq!(queue.move_upcoming(&first_upcoming, 1), Ok(true));
        assert_eq!(queue.upcoming()[1].queue_item_id(), first_upcoming);
        assert_eq!(queue.current().unwrap().queue_item_id(), current_id);
    }

    #[test]
    fn move_places_an_item_at_the_requested_upcoming_position() {
        let mut queue = queue_of(6, 1, PlaybackRepeatMode::Off, false);
        let upcoming = |queue: &PlaybackQueue| -> Vec<String> {
            queue
                .upcoming()
                .iter()
                .map(QueueEntry::queue_item_id)
                .collect()
        };
        let ids = upcoming(&queue);

        // Forward over several items, then back to the front.
        assert_eq!(queue.move_upcoming(&ids[0], 3), Ok(true));
        assert_eq!(
            upcoming(&queue),
            [&ids[1], &ids[2], &ids[3], &ids[0]].map(String::clone)
        );
        assert_eq!(queue.move_upcoming(&ids[0], 0), Ok(true));
        assert_eq!(queue.upcoming()[0].queue_item_id(), ids[0]);

        // Past the end clamps to the end; an unchanged position reports no change.
        assert_eq!(queue.move_upcoming(&ids[0], 99), Ok(true));
        assert_eq!(queue.upcoming().last().unwrap().queue_item_id(), ids[0]);
        assert_eq!(queue.move_upcoming(&ids[0], 99), Ok(false));
    }

    #[test]
    fn edits_reject_played_and_unknown_items() {
        let mut queue = queue_of(4, 2, PlaybackRepeatMode::Off, false);
        let played = queue.history()[0].queue_item_id();
        assert_eq!(
            queue.remove_upcoming(&played),
            Err(QueueError::ItemNotUpcoming)
        );
        assert_eq!(
            queue.remove_upcoming("nope"),
            Err(QueueError::ItemNotUpcoming)
        );
        let upcoming = queue.upcoming()[0].queue_item_id();
        assert_eq!(queue.remove_upcoming(&upcoming), Ok(()));
        assert_eq!(queue.len(), 3);
        assert!(!queue.clear_upcoming());
    }

    #[test]
    fn edits_made_while_shuffled_survive_turning_shuffle_off() {
        let mut queue = queue_of(6, 0, PlaybackRepeatMode::Off, true);
        let removed = queue.upcoming()[0].queue_item_id();
        queue.remove_upcoming(&removed).unwrap();
        queue.set_shuffle(false, &mut rng());
        assert_eq!(queue.len(), 5);
        assert!(queue
            .arranged
            .iter()
            .all(|entry| entry.queue_item_id() != removed));
        assert_eq!(arranged(&queue)[0], "t0");
    }

    #[test]
    fn items_enqueued_while_shuffled_keep_their_place_when_shuffle_turns_off() {
        // The review's B1: four items, shuffle on, enqueue one, shuffle off must leave five.
        let mut queue = queue_of(4, 0, PlaybackRepeatMode::Off, true);
        queue.enqueue(vec!["added".into()], false).unwrap();
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), ["t0", "t1", "t2", "t3", "added"]);

        // Play next while shuffled lands right after the current item in the arranged order.
        let mut queue = queue_of(5, 2, PlaybackRepeatMode::Off, false);
        queue.set_shuffle(true, &mut rng());
        queue.enqueue(vec!["next".into()], true).unwrap();
        assert_eq!(queue.upcoming()[0].track_id.as_ref(), "next");
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), ["t0", "t1", "t2", "next", "t3", "t4"]);
        assert_eq!(current(&queue), "t2");
    }

    #[test]
    fn a_move_made_while_shuffled_is_kept_after_the_entry_that_now_precedes_it() {
        let mut queue = queue_of(6, 0, PlaybackRepeatMode::Off, true);
        let last = queue.upcoming().last().unwrap().clone();
        assert_eq!(queue.move_upcoming(&last.queue_item_id(), 1), Ok(true));
        assert_eq!(queue.upcoming()[1], last);
        let predecessor = queue.upcoming()[0].track_id.to_string();

        queue.set_shuffle(false, &mut rng());

        let arranged = order(&queue);
        let at = arranged.iter().position(|t| **t == *last.track_id).unwrap();
        assert_eq!(arranged[at - 1], predecessor);
        assert_eq!(arranged.len(), 6);
    }

    #[test]
    fn clearing_upcoming_while_shuffled_removes_those_items_for_good() {
        let mut queue = queue_of(6, 0, PlaybackRepeatMode::Off, true);
        let playing = current(&queue);
        assert!(queue.clear_upcoming());
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), [playing]);
    }

    #[test]
    fn invariants_hold_over_random_operation_sequences() {
        for seed_value in 0..50u64 {
            let mut rng = StdRng::seed_from_u64(seed_value);
            let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
            queue.replace(ids(9), 0, &mut rng).unwrap();
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
                        let mode = [
                            PlaybackRepeatMode::Off,
                            PlaybackRepeatMode::All,
                            PlaybackRepeatMode::One,
                        ][rng.random_range(0..3)];
                        queue.set_repeat(mode);
                    }
                    5 => {
                        if let Some(id) = queue.upcoming().first().map(QueueEntry::queue_item_id) {
                            let _ = queue.remove_upcoming(&id);
                        }
                    }
                    6 => {
                        if let Some(id) = queue.upcoming().last().map(QueueEntry::queue_item_id) {
                            let _ = queue.move_upcoming(&id, rng.random_range(0..4));
                        }
                    }
                    7 => {
                        if step % 7 == 0 {
                            queue.clear_upcoming();
                        }
                    }
                    8 | 9 => {
                        if !queue.is_empty() {
                            let ids = vec![format!("e{step}"), format!("f{step}")];
                            queue.enqueue(ids, rng.random_bool(0.5)).unwrap();
                        }
                    }
                    _ => {
                        if queue.len() < 3 {
                            queue
                                .replace(ids(9), rng.random_range(0..9), &mut rng)
                                .unwrap();
                        }
                    }
                }
                let play: HashSet<_> = queue.play_order().iter().map(|e| e.id).collect();
                assert_eq!(play.len(), queue.play_order().len(), "ids are unique");
                assert!(queue.is_empty() || queue.current < queue.len());
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
    fn jumping_back_to_a_played_item_makes_it_current() {
        let mut queue = queue_of(4, 2, PlaybackRepeatMode::Off, false);
        let id = queue.history()[0].queue_item_id();
        queue.jump_to(&id).expect("played");
        assert_eq!(current(&queue), "t0");
        assert_eq!(queue.upcoming().len(), 3);
        assert_eq!(queue.jump_to(&id), Err(QueueError::ItemNotUpcoming));
        assert_eq!(queue.jump_to("nope"), Err(QueueError::ItemNotUpcoming));
    }

    #[test]
    fn jumping_to_an_upcoming_item_skips_the_ones_before_it() {
        let mut queue = queue_of(4, 0, PlaybackRepeatMode::Off, false);
        let id = item_id(&queue, "t2");
        queue.jump_to(&id).expect("upcoming");
        assert_eq!(current(&queue), "t2");
        assert_eq!(queue.upcoming().len(), 1);
        assert_eq!(queue.history().len(), 2);
    }

    #[test]
    fn enqueue_adds_after_current_or_at_the_end() {
        let mut queue = queue_of(3, 0, PlaybackRepeatMode::Off, false);
        queue.enqueue(vec!["last".into()], false).expect("enqueue");
        queue.enqueue(vec!["next".into()], true).expect("enqueue");
        assert_eq!(order(&queue), ["t0", "next", "t1", "t2", "last"]);
        assert_eq!(current(&queue), "t0");
    }

    #[test]
    fn enqueue_needs_a_queue() {
        let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
        assert_eq!(
            queue.enqueue(vec!["a".into()], true),
            Err(QueueError::InvalidStart)
        );
    }

    #[test]
    fn removing_entries_keeps_the_current_position_on_the_same_item() {
        let mut queue = queue_of(6, 3, PlaybackRepeatMode::Off, false);
        let gone: HashSet<u64> = [item_id(&queue, "t0"), item_id(&queue, "t5")]
            .iter()
            .map(|id| parse_item_id(id).unwrap())
            .collect();
        assert!(queue.remove_entries(&gone));
        assert_eq!(current(&queue), "t3");
        assert_eq!(order(&queue), ["t1", "t2", "t3", "t4"]);
        assert!(!queue.remove_entries(&gone));

        // Removing the current entry makes the one after it current.
        let current_id: HashSet<u64> = [parse_item_id(&item_id(&queue, "t3")).unwrap()].into();
        assert!(queue.remove_entries(&current_id));
        assert_eq!(current(&queue), "t4");
        let last: HashSet<u64> = [parse_item_id(&item_id(&queue, "t4")).unwrap()].into();
        assert!(queue.remove_entries(&last));
        assert!(queue.current().is_none(), "nothing follows the last entry");
    }

    #[test]
    fn a_replaced_queue_can_be_put_back_with_the_current_settings() {
        let mut queue = queue_of(5, 2, PlaybackRepeatMode::Off, false);
        let before = queue.clone();
        queue.replace(ids(3), 0, &mut rng()).unwrap();
        queue.set_repeat(PlaybackRepeatMode::All);
        queue.set_shuffle(true, &mut rng());

        queue.restore(before, &mut rng());

        assert_eq!(queue.repeat(), PlaybackRepeatMode::All);
        assert!(queue.shuffle());
        assert_eq!(current(&queue), "t2", "the same item is current");
        let mut restored = order(&queue);
        restored.sort();
        assert_eq!(restored, ids(5));
        queue.set_shuffle(false, &mut rng());
        assert_eq!(order(&queue), ids(5));
        queue.enqueue(vec!["more".into()], false).unwrap();
        let unique: HashSet<_> = queue.arranged.iter().map(|e| e.id).collect();
        assert_eq!(unique.len(), 6, "ids stay unique across the restored queue");
    }
}
