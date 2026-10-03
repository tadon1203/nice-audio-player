//! The decisions of the sync actor, as a plain state and one transition.
//!
//! `State::step` takes an input and the current time and returns the effects to carry out. It
//! reads no clock, touches no disk and starts no thread, so every scheduling rule is tested here
//! with made-up instants; the actor in `mod.rs` only feeds it inputs and executes its effects.
//!
//! The rules: a change in a watched folder starts a scan after the folder has been quiet for
//! `DEBOUNCE`; a failed scan stays flagged until a scan succeeds or the listener acts; cancelling
//! drops pending automatic work; the artwork garbage collection runs when nothing else is
//! pending; a folder whose watcher cannot attach is retried and, after repeated failure, flagged.

use std::{
    collections::{BTreeMap, BTreeSet},
    time::{Duration, Instant},
};

pub(super) type RootId = i64;

/// How long a folder must be quiet after a change before it is scanned, so copying an album
/// starts one scan and not one per file.
pub(super) const DEBOUNCE: Duration = Duration::from_millis(500);
/// How long after start-up the folders are scanned, to let the window come up first.
pub(super) const STARTUP_DELAY: Duration = Duration::from_millis(500);
pub(super) const WATCH_RETRY: Duration = Duration::from_secs(10);
/// A watcher that failed to attach this many times in a row needs the listener's attention.
const ATTENTION_AFTER_FAILURES: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    Running,
    /// The last scan failed. Flagged until a scan completes or the listener acts.
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Watch {
    /// An attach was asked for; its result has not come back.
    Attaching,
    Attached,
    Failed {
        attempts: u32,
        /// When to try again; `None` while an attempt is in flight.
        retry_at: Option<Instant>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Activity {
    Running,
    AttentionRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ScanOutcome {
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Input {
    /// The actor started with these folders enabled.
    Started {
        enabled: Vec<RootId>,
    },
    Registered(RootId),
    Enabled(RootId),
    Disabled(RootId),
    Removed(RootId),
    /// The listener deleted the Missing tracks; their artwork is nobody's now.
    MissingDeleted,
    /// The listener started a scan of these folders.
    ScanRequested {
        roots: Vec<RootId>,
    },
    CancelRequested,
    /// A watcher saw something change in this folder.
    FolderChanged(RootId),
    Attached(RootId),
    AttachFailed(RootId),
    ScanFinished(ScanOutcome),
    /// The artwork garbage collection found these folders' artwork missing and wants them rescanned.
    GcFinished {
        rescan: Vec<RootId>,
    },
    /// Time passed. Carries no news: the state reacts to deadlines it reaches.
    Tick,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Effect {
    StartScan(Vec<RootId>),
    CancelScan,
    RunGc,
    SetActivity(Option<Activity>),
    Attach(RootId),
    Detach(RootId),
}

pub(super) struct State {
    dirty: BTreeSet<RootId>,
    debounce: Option<Instant>,
    gc_pending: bool,
    phase: Phase,
    watches: BTreeMap<RootId, Watch>,
    published: Option<Activity>,
}

impl State {
    pub fn new() -> Self {
        Self {
            dirty: BTreeSet::new(),
            debounce: None,
            gc_pending: false,
            phase: Phase::Idle,
            watches: BTreeMap::new(),
            published: None,
        }
    }

    pub fn scanning(&self) -> bool {
        self.phase == Phase::Running
    }

    /// When the state next wants a `Tick`, if it is waiting for anything.
    pub fn next_wakeup(&self) -> Option<Instant> {
        let retries = self.watches.values().filter_map(|watch| match watch {
            Watch::Failed {
                retry_at: Some(at), ..
            } => Some(*at),
            _ => None,
        });
        let debounce = self.debounce.filter(|_| !self.scanning());
        retries.chain(debounce).min()
    }

    pub fn step(&mut self, input: Input, now: Instant) -> Vec<Effect> {
        let mut effects = Vec::new();
        match input {
            Input::Started { enabled } => {
                self.gc_pending = true;
                self.dirty.extend(enabled.iter().copied());
                self.debounce = Some(now + STARTUP_DELAY);
                for id in enabled {
                    self.watch(id, &mut effects);
                }
            }
            Input::Registered(id) | Input::Enabled(id) => {
                self.dirty.insert(id);
                self.debounce = Some(now);
                self.watch(id, &mut effects);
            }
            Input::Disabled(id) => self.release(id, &mut effects),
            Input::Removed(id) => {
                self.release(id, &mut effects);
                // Its artwork is nobody's now.
                self.gc_pending = true;
            }
            Input::MissingDeleted => self.gc_pending = true,
            Input::ScanRequested { roots } => {
                if !self.scanning() {
                    self.dirty.clear();
                    self.debounce = None;
                    self.phase = Phase::Running;
                    effects.push(Effect::StartScan(roots));
                }
            }
            Input::CancelRequested => {
                if self.scanning() {
                    effects.push(Effect::CancelScan);
                }
                self.dirty.clear();
                self.debounce = None;
            }
            Input::FolderChanged(id) => {
                if self.watches.contains_key(&id) {
                    self.dirty.insert(id);
                    self.debounce = Some(now + DEBOUNCE);
                }
            }
            Input::Attached(id) => match self.watches.get(&id) {
                None => effects.push(Effect::Detach(id)),
                Some(watch) => {
                    // A watcher that had to be retried missed whatever changed meanwhile.
                    if matches!(watch, Watch::Failed { .. }) {
                        self.dirty.insert(id);
                        self.debounce = Some(now);
                    }
                    self.watches.insert(id, Watch::Attached);
                }
            },
            Input::AttachFailed(id) => {
                if let Some(watch) = self.watches.get(&id) {
                    let attempts = match watch {
                        Watch::Failed { attempts, .. } => *attempts,
                        _ => 0,
                    } + 1;
                    self.watches.insert(
                        id,
                        Watch::Failed {
                            attempts,
                            retry_at: Some(now + WATCH_RETRY),
                        },
                    );
                }
            }
            Input::ScanFinished(outcome) => {
                self.phase = match outcome {
                    ScanOutcome::Failed => Phase::Failed,
                    ScanOutcome::Completed | ScanOutcome::Cancelled => Phase::Idle,
                };
                match outcome {
                    ScanOutcome::Completed => self.gc_pending = true,
                    ScanOutcome::Cancelled => {
                        self.dirty.clear();
                        self.debounce = None;
                    }
                    ScanOutcome::Failed => {}
                }
                // Changes that came in during the scan are scanned next.
                if !self.dirty.is_empty() && self.debounce.is_none() {
                    self.debounce = Some(now);
                }
            }
            Input::GcFinished { rescan } => {
                if !rescan.is_empty() {
                    self.dirty.extend(rescan);
                    self.debounce = Some(now);
                }
            }
            Input::Tick => {}
        }
        self.advance(now, &mut effects);
        let activity = self.activity();
        if activity != self.published {
            self.published = activity;
            effects.push(Effect::SetActivity(activity));
        }
        effects
    }

    fn watch(&mut self, id: RootId, effects: &mut Vec<Effect>) {
        self.watches.insert(id, Watch::Attaching);
        effects.push(Effect::Attach(id));
    }

    /// The listener took a folder out of the Library: drop its pending work and its watcher. That
    /// is also acting on a failed scan, so the flag goes.
    fn release(&mut self, id: RootId, effects: &mut Vec<Effect>) {
        self.dirty.remove(&id);
        if self.watches.remove(&id).is_some() {
            effects.push(Effect::Detach(id));
        }
        if self.phase == Phase::Failed {
            self.phase = Phase::Idle;
        }
    }

    /// Does what is due: retries watchers, starts a scan of the changed folders, collects garbage.
    fn advance(&mut self, now: Instant, effects: &mut Vec<Effect>) {
        for (id, watch) in &mut self.watches {
            if let Watch::Failed {
                attempts,
                retry_at: Some(at),
            } = *watch
            {
                if at <= now {
                    *watch = Watch::Failed {
                        attempts,
                        retry_at: None,
                    };
                    effects.push(Effect::Attach(*id));
                }
            }
        }
        if self.scanning() {
            return;
        }
        if self.debounce.is_some_and(|due| due <= now) {
            self.debounce = None;
            if !self.dirty.is_empty() {
                self.phase = Phase::Running;
                effects.push(Effect::StartScan(
                    std::mem::take(&mut self.dirty).into_iter().collect(),
                ));
                return;
            }
        }
        if self.gc_pending && self.debounce.is_none() && self.dirty.is_empty() {
            self.gc_pending = false;
            effects.push(Effect::RunGc);
        }
    }

    fn activity(&self) -> Option<Activity> {
        let watcher_needs_attention = self.watches.values().any(|watch| {
            matches!(watch, Watch::Failed { attempts, .. } if *attempts >= ATTENTION_AFTER_FAILURES)
        });
        if self.phase == Phase::Failed || watcher_needs_attention {
            Some(Activity::AttentionRequired)
        } else if self.scanning() {
            Some(Activity::Running)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A state with a clock the test moves by hand.
    struct Clock {
        state: State,
        now: Instant,
    }

    impl Clock {
        fn new() -> Self {
            Self {
                state: State::new(),
                now: Instant::now(),
            }
        }

        fn feed(&mut self, input: Input) -> Vec<Effect> {
            self.state.step(input, self.now)
        }

        /// Lets `time` pass, ticking at the state's own deadlines like the actor does.
        fn wait(&mut self, time: Duration) -> Vec<Effect> {
            let until = self.now + time;
            let mut effects = Vec::new();
            while let Some(at) = self.state.next_wakeup().filter(|at| *at <= until) {
                self.now = at.max(self.now);
                effects.extend(self.feed(Input::Tick));
            }
            self.now = until;
            effects
        }

        /// A folder that has been scanned once and is idle again.
        fn idle(roots: &[RootId]) -> Self {
            let mut clock = Self::new();
            clock.feed(Input::Started {
                enabled: roots.to_vec(),
            });
            for id in roots {
                clock.feed(Input::Attached(*id));
            }
            clock.wait(STARTUP_DELAY);
            clock.feed(Input::ScanFinished(ScanOutcome::Completed));
            clock.feed(Input::GcFinished { rescan: Vec::new() });
            clock
        }
    }

    fn starts(effects: &[Effect]) -> Vec<Vec<RootId>> {
        effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::StartScan(roots) => Some(roots.clone()),
                _ => None,
            })
            .collect()
    }

    fn activities(effects: &[Effect]) -> Vec<Option<Activity>> {
        effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::SetActivity(activity) => Some(*activity),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_folders_are_scanned_shortly_after_start_up() {
        let mut clock = Clock::new();

        let started = clock.feed(Input::Started {
            enabled: vec![1, 2],
        });
        assert_eq!(starts(&started), Vec::<Vec<RootId>>::new());
        assert!(started.contains(&Effect::Attach(1)) && started.contains(&Effect::Attach(2)));

        assert_eq!(starts(&clock.wait(STARTUP_DELAY)), vec![vec![1, 2]]);
    }

    #[test]
    fn a_change_while_idle_starts_a_scan_once_the_folder_is_quiet() {
        let mut clock = Clock::idle(&[1]);

        clock.feed(Input::FolderChanged(1));

        assert_eq!(
            starts(&clock.wait(DEBOUNCE - Duration::from_millis(1))),
            Vec::<Vec<RootId>>::new()
        );
        assert_eq!(starts(&clock.wait(Duration::from_millis(1))), vec![vec![1]]);
    }

    #[test]
    fn a_burst_of_changes_starts_one_scan() {
        let mut clock = Clock::idle(&[1]);

        let mut started = Vec::new();
        for _ in 0..20 {
            started.extend(clock.feed(Input::FolderChanged(1)));
            started.extend(clock.wait(Duration::from_millis(100)));
        }
        started.extend(clock.wait(DEBOUNCE * 2));

        assert_eq!(starts(&started), vec![vec![1]]);
    }

    #[test]
    fn changes_in_a_folder_nobody_watches_are_ignored() {
        let mut clock = Clock::idle(&[1]);

        clock.feed(Input::FolderChanged(7));

        assert_eq!(starts(&clock.wait(DEBOUNCE * 2)), Vec::<Vec<RootId>>::new());
    }

    #[test]
    fn a_change_during_a_scan_is_scanned_after_it() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });

        clock.feed(Input::FolderChanged(1));
        assert_eq!(
            starts(&clock.wait(DEBOUNCE * 2)),
            Vec::<Vec<RootId>>::new(),
            "one scan at a time"
        );

        let finished = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert_eq!(starts(&finished), vec![vec![1]]);
    }

    #[test]
    fn registering_a_folder_scans_it_at_once() {
        let mut clock = Clock::idle(&[1]);

        let registered = clock.feed(Input::Registered(2));

        assert!(registered.contains(&Effect::Attach(2)));
        assert_eq!(starts(&registered), vec![vec![2]]);
    }

    #[test]
    fn a_failed_scan_stays_flagged_until_one_succeeds() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });

        let failed = clock.feed(Input::ScanFinished(ScanOutcome::Failed));
        assert_eq!(activities(&failed), vec![Some(Activity::AttentionRequired)]);
        assert_eq!(
            activities(&clock.wait(Duration::from_secs(60))),
            Vec::<Option<Activity>>::new(),
            "still flagged"
        );

        clock.feed(Input::ScanRequested { roots: vec![1] });
        let succeeded = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert_eq!(activities(&succeeded), vec![None]);
    }

    #[test]
    fn a_scan_that_follows_a_failure_replaces_the_flag_while_it_runs() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });
        clock.feed(Input::ScanFinished(ScanOutcome::Failed));

        let again = clock.feed(Input::ScanRequested { roots: vec![1] });

        assert_eq!(activities(&again), vec![Some(Activity::Running)]);
    }

    #[test]
    fn a_folder_change_after_a_failure_scans_again_and_a_success_clears_the_flag() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });
        clock.feed(Input::ScanFinished(ScanOutcome::Failed));

        clock.feed(Input::FolderChanged(1));
        let started = clock.wait(DEBOUNCE);
        assert_eq!(starts(&started), vec![vec![1]]);

        let finished = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert_eq!(activities(&finished), vec![None]);
    }

    #[test]
    fn removing_the_folder_that_failed_acknowledges_the_failure() {
        let mut clock = Clock::idle(&[1, 2]);
        clock.feed(Input::ScanRequested { roots: vec![1, 2] });
        clock.feed(Input::ScanFinished(ScanOutcome::Failed));

        let removed = clock.feed(Input::Removed(1));

        assert_eq!(activities(&removed), vec![None]);
    }

    #[test]
    fn cancelling_drops_the_automatic_work_that_was_waiting() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });
        clock.feed(Input::FolderChanged(1));

        let cancelled = clock.feed(Input::CancelRequested);
        assert!(cancelled.contains(&Effect::CancelScan));
        // A change that lands before the scan notices the cancellation is dropped too.
        clock.feed(Input::FolderChanged(1));
        let finished = clock.feed(Input::ScanFinished(ScanOutcome::Cancelled));

        assert_eq!(activities(&finished), vec![None]);
        assert_eq!(starts(&clock.wait(DEBOUNCE * 4)), Vec::<Vec<RootId>>::new());
    }

    #[test]
    fn a_folder_that_is_disabled_or_removed_is_no_longer_scanned_or_watched() {
        let mut clock = Clock::idle(&[1, 2]);
        clock.feed(Input::FolderChanged(1));
        clock.feed(Input::FolderChanged(2));

        let disabled = clock.feed(Input::Disabled(1));
        let removed = clock.feed(Input::Removed(2));

        assert!(disabled.contains(&Effect::Detach(1)));
        assert!(removed.contains(&Effect::Detach(2)));
        assert_eq!(starts(&clock.wait(DEBOUNCE * 2)), Vec::<Vec<RootId>>::new());
    }

    #[test]
    fn artwork_is_collected_once_a_scan_has_completed_and_nothing_else_waits() {
        let mut clock = Clock::new();
        clock.feed(Input::Started { enabled: vec![1] });
        clock.feed(Input::Attached(1));
        clock.wait(STARTUP_DELAY);

        let finished = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert!(finished.contains(&Effect::RunGc));

        // Not again until something asks for it.
        assert!(clock.feed(Input::Tick).is_empty());
        let removed = clock.feed(Input::Removed(1));
        assert!(
            removed.contains(&Effect::RunGc),
            "removing a folder frees its artwork"
        );
    }

    #[test]
    fn collection_waits_for_changes_that_are_pending() {
        let mut clock = Clock::idle(&[1]);
        clock.feed(Input::ScanRequested { roots: vec![1] });
        clock.feed(Input::FolderChanged(1));

        let finished = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert!(!finished.contains(&Effect::RunGc));

        let waited = clock.wait(DEBOUNCE);
        assert_eq!(starts(&waited), vec![vec![1]]);
        let second = clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        assert!(second.contains(&Effect::RunGc));
    }

    #[test]
    fn folders_whose_artwork_was_found_missing_are_rescanned() {
        let mut clock = Clock::idle(&[1]);

        let collected = clock.feed(Input::GcFinished { rescan: vec![1] });

        assert_eq!(starts(&collected), vec![vec![1]]);
    }

    #[test]
    fn a_watcher_that_cannot_attach_is_retried_and_flagged_after_repeated_failure() {
        let mut clock = Clock::new();
        clock.feed(Input::Started { enabled: vec![1] });

        let first = clock.feed(Input::AttachFailed(1));
        assert_eq!(
            activities(&first),
            Vec::<Option<Activity>>::new(),
            "one failure is not news"
        );
        // The start-up scan runs meanwhile and finishes.
        clock.wait(STARTUP_DELAY);
        clock.feed(Input::ScanFinished(ScanOutcome::Completed));
        clock.feed(Input::GcFinished { rescan: Vec::new() });

        let retried = clock.wait(WATCH_RETRY - STARTUP_DELAY);
        assert!(retried.contains(&Effect::Attach(1)));
        let second = clock.feed(Input::AttachFailed(1));
        assert_eq!(activities(&second), vec![Some(Activity::AttentionRequired)]);

        let retried = clock.wait(WATCH_RETRY);
        assert!(retried.contains(&Effect::Attach(1)));
        let recovered = clock.feed(Input::Attached(1));
        assert_eq!(
            activities(&recovered),
            vec![Some(Activity::Running)],
            "the flag gives way to the scan that catches up"
        );
        assert_eq!(
            starts(&recovered),
            vec![vec![1]],
            "what changed while it was unwatched is picked up"
        );
    }

    #[test]
    fn a_watcher_is_not_retried_before_its_time() {
        let mut clock = Clock::new();
        clock.feed(Input::Started { enabled: vec![1] });
        clock.feed(Input::AttachFailed(1));

        let early = clock.wait(WATCH_RETRY - Duration::from_millis(1));

        assert!(!early.contains(&Effect::Attach(1)));
    }
}
