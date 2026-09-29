//! The playback queue as a pure data structure: no I/O, no clock, and randomness only through an
//! injected generator. The worker owns one for its whole life; an empty queue means "nothing
//! queued".

use std::collections::HashSet;

use rand::{seq::SliceRandom, Rng};

use super::item::{PlaybackItem, PlaybackItemSeed};

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

#[derive(Debug, Clone)]
pub struct PlaybackQueue {
    entries: Vec<PlaybackItem>,
    current: usize,
    /// The order the items were queued or arranged in; shuffle-off restores it.
    manual_order: Vec<String>,
    repeat: PlaybackRepeatMode,
    shuffle: bool,
    next_item_id: u64,
}

impl PlaybackQueue {
    pub fn new(repeat: PlaybackRepeatMode, shuffle: bool) -> Self {
        Self {
            entries: Vec::new(),
            current: 0,
            manual_order: Vec::new(),
            repeat,
            shuffle,
            next_item_id: 0,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn repeat(&self) -> PlaybackRepeatMode {
        self.repeat
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    pub fn current(&self) -> Option<&PlaybackItem> {
        self.entries.get(self.current)
    }

    pub fn upcoming(&self) -> &[PlaybackItem] {
        self.entries.get(self.current + 1..).unwrap_or_default()
    }

    /// Whether the queue can move backward or forward. Repeat-all wraps, but a single item has
    /// nowhere else to go.
    pub fn can_go_previous(&self) -> bool {
        self.current > 0 || self.wraps()
    }

    pub fn can_go_next(&self) -> bool {
        self.current + 1 < self.entries.len() || self.wraps()
    }

    fn wraps(&self) -> bool {
        self.repeat == PlaybackRepeatMode::All && self.entries.len() > 1
    }

    /// Replaces the queue and makes `start_index` current. Untouched on error.
    pub fn replace<R: Rng + ?Sized>(
        &mut self,
        seeds: Vec<PlaybackItemSeed>,
        start_index: usize,
        rng: &mut R,
    ) -> Result<(), QueueError> {
        if start_index >= seeds.len() {
            return Err(QueueError::InvalidStart);
        }
        self.entries = seeds
            .into_iter()
            .map(|seed| {
                self.next_item_id = self.next_item_id.saturating_add(1);
                PlaybackItem::from_seed(format!("queue-item-{}", self.next_item_id), seed)
            })
            .collect();
        self.manual_order = self
            .entries
            .iter()
            .map(|item| item.queue_item_id.clone())
            .collect();
        self.current = start_index;
        if self.shuffle {
            self.shuffle_around_current(rng);
        }
        Ok(())
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.manual_order.clear();
        self.current = 0;
    }

    /// Drops everything after the current item.
    pub fn clear_upcoming(&mut self) -> bool {
        if self.upcoming().is_empty() {
            return false;
        }
        self.entries.truncate(self.current + 1);
        self.sync_manual_order();
        true
    }

    pub fn remove_upcoming(&mut self, id: &str) -> Result<(), QueueError> {
        let index = self.upcoming_index(id)?;
        self.entries.remove(index);
        self.sync_manual_order();
        Ok(())
    }

    /// Moves an upcoming item to `to`, an index into the upcoming list (0 is next up); an index
    /// past the end means the end. Returns whether the order changed. The current item never
    /// moves and nothing is placed before it.
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
        let item = self.entries.remove(index);
        self.entries.insert(target, item);
        self.sync_manual_order();
        Ok(true)
    }

    fn upcoming_index(&self, id: &str) -> Result<usize, QueueError> {
        self.entries
            .iter()
            .position(|item| item.queue_item_id == id)
            .filter(|index| *index > self.current)
            .ok_or(QueueError::ItemNotUpcoming)
    }

    pub fn set_repeat(&mut self, repeat: PlaybackRepeatMode) -> bool {
        std::mem::replace(&mut self.repeat, repeat) != repeat
    }

    /// Turning shuffle on keeps the current item first and shuffles the rest; turning it off
    /// restores the arranged order around the current item.
    pub fn set_shuffle<R: Rng + ?Sized>(&mut self, enabled: bool, rng: &mut R) -> bool {
        if self.shuffle == enabled {
            return false;
        }
        self.shuffle = enabled;
        if self.entries.is_empty() {
            return true;
        }
        if enabled {
            self.shuffle_around_current(rng);
        } else {
            self.restore_manual_order();
        }
        true
    }

    /// Moves to another item and returns it, or `None` at either end of a non-wrapping queue.
    pub fn advance<R: Rng + ?Sized>(
        &mut self,
        reason: AdvanceReason,
        rng: &mut R,
    ) -> Option<&PlaybackItem> {
        if self.entries.is_empty() {
            return None;
        }
        match reason {
            AdvanceReason::Natural if self.repeat == PlaybackRepeatMode::One => {}
            AdvanceReason::Natural | AdvanceReason::UserNext => {
                if self.current + 1 < self.entries.len() {
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
                    self.current = self.entries.len() - 1;
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
        if self.shuffle && self.entries.len() > 1 {
            let last_played = self.entries[self.current].queue_item_id.clone();
            self.entries.shuffle(rng);
            if self.entries[0].queue_item_id == last_played {
                let other = rng.random_range(1..self.entries.len());
                self.entries.swap(0, other);
            }
        }
        self.current = 0;
    }

    fn shuffle_around_current<R: Rng + ?Sized>(&mut self, rng: &mut R) {
        let current = self.entries.remove(self.current);
        self.entries.shuffle(rng);
        self.entries.insert(0, current);
        self.current = 0;
    }

    fn restore_manual_order(&mut self) {
        let current_id = self.entries[self.current].queue_item_id.clone();
        let mut by_id: std::collections::HashMap<_, _> = self
            .entries
            .drain(..)
            .map(|item| (item.queue_item_id.clone(), item))
            .collect();
        self.entries = self
            .manual_order
            .iter()
            .filter_map(|id| by_id.remove(id))
            .collect();
        self.current = self
            .entries
            .iter()
            .position(|item| item.queue_item_id == current_id)
            .unwrap_or(0);
    }

    /// Unshuffled, the visible order is the arranged order. Shuffled, the arranged order is only
    /// pruned so that turning shuffle off still restores what the user built.
    fn sync_manual_order(&mut self) {
        if self.shuffle {
            let present: HashSet<_> = self
                .entries
                .iter()
                .map(|item| &item.queue_item_id)
                .collect();
            self.manual_order.retain(|id| present.contains(id));
        } else {
            self.manual_order = self
                .entries
                .iter()
                .map(|item| item.queue_item_id.clone())
                .collect();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::validation::ValidatedAudioFile;
    use rand::{rngs::StdRng, SeedableRng};

    fn seed(name: &str) -> PlaybackItemSeed {
        PlaybackItemSeed::from_file(ValidatedAudioFile {
            path: format!("C:/music/{name}.flac"),
            file_name: format!("{name}.flac"),
            extension: "flac".into(),
        })
    }

    fn seeds(count: usize) -> Vec<PlaybackItemSeed> {
        (0..count).map(|i| seed(&format!("t{i}"))).collect()
    }

    fn titles(queue: &PlaybackQueue) -> Vec<String> {
        queue
            .entries
            .iter()
            .map(|item| item.title.clone())
            .collect()
    }

    fn queue_of(
        count: usize,
        start: usize,
        repeat: PlaybackRepeatMode,
        shuffle: bool,
    ) -> PlaybackQueue {
        let mut queue = PlaybackQueue::new(repeat, shuffle);
        queue
            .replace(seeds(count), start, &mut StdRng::seed_from_u64(7))
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
            queue.replace(seeds(2), 2, &mut rng()),
            Err(QueueError::InvalidStart)
        );
        assert_eq!(queue.len(), 3);
        assert_eq!(queue.current().unwrap().title, "t1.flac");
    }

    #[test]
    fn item_ids_stay_unique_across_replacements() {
        let mut queue = queue_of(2, 0, PlaybackRepeatMode::Off, false);
        let first = queue.current().unwrap().queue_item_id.clone();
        queue.replace(seeds(2), 0, &mut rng()).unwrap();
        assert_ne!(queue.current().unwrap().queue_item_id, first);
    }

    #[test]
    fn shuffle_keeps_the_same_items_current_first_and_changes_the_order() {
        let mut queue = queue_of(20, 5, PlaybackRepeatMode::Off, false);
        let before = titles(&queue);
        assert!(queue.set_shuffle(true, &mut rng()));

        let after = titles(&queue);
        assert_eq!(after[0], "t5.flac");
        assert_eq!(queue.current, 0);
        let mut sorted_before = before.clone();
        let mut sorted_after = after.clone();
        sorted_before.sort();
        sorted_after.sort();
        assert_eq!(sorted_before, sorted_after);

        let rest: Vec<_> = before.iter().filter(|t| *t != "t5.flac").cloned().collect();
        let mut reversed = rest.clone();
        reversed.reverse();
        assert_ne!(after[1..], rest[..], "shuffle must change the order");
        assert_ne!(after[1..], reversed[..], "shuffle is not a reversal");
    }

    #[test]
    fn shuffle_off_restores_the_arranged_order_around_the_current_item() {
        let mut queue = queue_of(10, 3, PlaybackRepeatMode::Off, false);
        let original = titles(&queue);
        queue.set_shuffle(true, &mut rng());
        queue.advance(AdvanceReason::UserNext, &mut rng());
        let playing = queue.current().unwrap().title.clone();

        queue.set_shuffle(false, &mut rng());

        assert_eq!(titles(&queue), original);
        assert_eq!(queue.current().unwrap().title, playing);
    }

    #[test]
    fn replace_while_shuffled_starts_at_the_requested_item() {
        let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, true);
        queue.replace(seeds(8), 4, &mut rng()).unwrap();
        assert_eq!(queue.current().unwrap().title, "t4.flac");
        assert_eq!(queue.len(), 8);
    }

    #[test]
    fn next_and_previous_stop_at_the_ends_unless_repeating_all() {
        let mut queue = queue_of(2, 0, PlaybackRepeatMode::Off, false);
        assert!(queue
            .advance(AdvanceReason::UserPrevious, &mut rng())
            .is_none());
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .title,
            "t1.flac"
        );
        assert!(queue.advance(AdvanceReason::UserNext, &mut rng()).is_none());
        assert!(queue.advance(AdvanceReason::Natural, &mut rng()).is_none());

        queue.set_repeat(PlaybackRepeatMode::All);
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .title,
            "t0.flac"
        );
        assert_eq!(
            queue
                .advance(AdvanceReason::UserPrevious, &mut rng())
                .unwrap()
                .title,
            "t1.flac"
        );
    }

    #[test]
    fn repeat_one_only_repeats_on_a_natural_finish() {
        let mut queue = queue_of(3, 1, PlaybackRepeatMode::One, false);
        assert_eq!(
            queue
                .advance(AdvanceReason::Natural, &mut rng())
                .unwrap()
                .title,
            "t1.flac"
        );
        assert_eq!(
            queue
                .advance(AdvanceReason::UserNext, &mut rng())
                .unwrap()
                .title,
            "t2.flac"
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
        let first_pass = titles(&queue);
        let last = first_pass.last().unwrap().clone();
        for _ in 0..first_pass.len() - 1 {
            queue.advance(AdvanceReason::Natural, &mut rng);
        }
        assert_eq!(queue.current().unwrap().title, last);

        let wrapped = queue
            .advance(AdvanceReason::Natural, &mut rng)
            .unwrap()
            .title
            .clone();
        assert_ne!(
            wrapped, last,
            "the finished item must not repeat back to back"
        );
        assert_eq!(queue.current, 0);
        let second_pass = titles(&queue);
        assert_eq!(second_pass[0], wrapped);
        assert_ne!(first_pass, second_pass);
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
        let first_upcoming = queue.upcoming()[0].queue_item_id.clone();
        let current = queue.current().unwrap().queue_item_id.clone();

        assert_eq!(queue.move_upcoming(&first_upcoming, 0), Ok(false));
        assert_eq!(queue.current().unwrap().queue_item_id, current);
        assert_eq!(
            queue.move_upcoming(&current, 0),
            Err(QueueError::ItemNotUpcoming)
        );

        assert_eq!(queue.move_upcoming(&first_upcoming, 1), Ok(true));
        assert_eq!(queue.upcoming()[1].queue_item_id, first_upcoming);
        assert_eq!(queue.current().unwrap().queue_item_id, current);
    }

    #[test]
    fn move_places_an_item_at_the_requested_upcoming_position() {
        let mut queue = queue_of(6, 1, PlaybackRepeatMode::Off, false);
        let ids: Vec<String> = queue
            .upcoming()
            .iter()
            .map(|item| item.queue_item_id.clone())
            .collect();

        // Forward over several items, then back to the front.
        assert_eq!(queue.move_upcoming(&ids[0], 3), Ok(true));
        let order: Vec<_> = queue
            .upcoming()
            .iter()
            .map(|i| i.queue_item_id.clone())
            .collect();
        assert_eq!(
            order,
            [&ids[1], &ids[2], &ids[3], &ids[0]].map(String::clone)
        );
        assert_eq!(queue.move_upcoming(&ids[0], 0), Ok(true));
        assert_eq!(queue.upcoming()[0].queue_item_id, ids[0]);

        // Past the end clamps to the end; an unchanged position reports no change.
        assert_eq!(queue.move_upcoming(&ids[0], 99), Ok(true));
        assert_eq!(queue.upcoming().last().unwrap().queue_item_id, ids[0]);
        assert_eq!(queue.move_upcoming(&ids[0], 99), Ok(false));
    }

    #[test]
    fn edits_reject_played_and_unknown_items() {
        let mut queue = queue_of(4, 2, PlaybackRepeatMode::Off, false);
        let played = queue.entries[0].queue_item_id.clone();
        assert_eq!(
            queue.remove_upcoming(&played),
            Err(QueueError::ItemNotUpcoming)
        );
        assert_eq!(
            queue.remove_upcoming("nope"),
            Err(QueueError::ItemNotUpcoming)
        );
        let upcoming = queue.upcoming()[0].queue_item_id.clone();
        assert_eq!(queue.remove_upcoming(&upcoming), Ok(()));
        assert_eq!(queue.len(), 3);
        assert!(!queue.clear_upcoming());
    }

    #[test]
    fn edits_made_while_shuffled_survive_turning_shuffle_off() {
        let mut queue = queue_of(6, 0, PlaybackRepeatMode::Off, true);
        let removed = queue.upcoming()[0].queue_item_id.clone();
        queue.remove_upcoming(&removed).unwrap();
        queue.set_shuffle(false, &mut rng());
        assert_eq!(queue.len(), 5);
        assert!(queue
            .entries
            .iter()
            .all(|item| item.queue_item_id != removed));
        assert_eq!(queue.entries[0].title, "t0.flac");
    }

    #[test]
    fn invariants_hold_over_random_operation_sequences() {
        for seed_value in 0..50u64 {
            let mut rng = StdRng::seed_from_u64(seed_value);
            let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
            queue.replace(seeds(9), 0, &mut rng).unwrap();
            for step in 0..200u32 {
                match rng.random_range(0..9) {
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
                        if let Some(id) = queue.upcoming().first().map(|i| i.queue_item_id.clone())
                        {
                            let _ = queue.remove_upcoming(&id);
                        }
                    }
                    6 => {
                        if let Some(id) = queue.upcoming().last().map(|i| i.queue_item_id.clone()) {
                            let _ = queue.move_upcoming(&id, 0);
                        }
                    }
                    7 => {
                        if step % 7 == 0 {
                            queue.clear_upcoming();
                        }
                    }
                    _ => {
                        if queue.len() < 3 {
                            queue
                                .replace(seeds(9), rng.random_range(0..9), &mut rng)
                                .unwrap();
                        }
                    }
                }
                let ids: HashSet<_> = queue.entries.iter().map(|i| &i.queue_item_id).collect();
                assert_eq!(ids.len(), queue.entries.len(), "ids are unique");
                assert!(queue.is_empty() || queue.current < queue.entries.len());
                let arranged: HashSet<_> = queue.manual_order.iter().collect();
                assert_eq!(
                    arranged, ids,
                    "arranged order tracks exactly the queued items"
                );
            }
        }
    }
}
