//! Library scanning: discover files, inspect the new or changed ones, persist the results.
//!
//! The work goes in batches. A batch is planned against the database read-only, its new files are
//! inspected in parallel with no transaction open, and the results are written in one short
//! transaction, so a failure or an abort never leaves a half-written batch and the write lock is
//! never held while files are read.

mod discover;
mod identity;
mod inspect;
mod persist;
mod relink;

use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use log::{error, info};

use super::database::Database;
use super::error::parse_id;
use super::models::{LibraryRoot, LibraryScanSnapshot, LibraryScanState, ScanFailure};
use crate::events::Notifier;
use discover::{discover, DiscoveredFile, Discovery};
use inspect::{inspect_all, read_artwork};
use persist::{plan, LibraryWriter, Outcome, PersistError, Plan};

/// Files inspected per transaction.
const INSPECTIONS_PER_BATCH: usize = 100;
/// Files planned per transaction, however few of them need inspecting.
const FILES_PER_BATCH: usize = 1_000;
const PROGRESS_SIGNAL_INTERVAL: Duration = Duration::from_millis(200);

pub(crate) type SharedScanState = Arc<Mutex<LibraryScanSnapshot>>;

/// Why a scan stopped before finishing.
enum Stop {
    Cancelled,
    Persistence,
}

impl From<PersistError> for Stop {
    fn from(_: PersistError) -> Self {
        Self::Persistence
    }
}

/// Scans `roots` in order, publishing progress through `state` and `notify`. Returns how the scan
/// ended, which is also in `state`.
pub(crate) fn run(
    database: Database,
    roots: Vec<LibraryRoot>,
    state: SharedScanState,
    cancel: Arc<AtomicBool>,
    notify: Notifier,
) -> LibraryScanState {
    state.lock().expect("scan state lock").expected_count = expected_files(&database, &roots);
    let mut progress = Progress::new(&state, &notify);
    let mut traversal_failed = false;
    for root in roots {
        if cancel.load(Ordering::Acquire) {
            return finish(&state, LibraryScanState::Cancelled, None, &notify);
        }
        state.lock().expect("scan state lock").current_root = Some(root.clone());
        notify.notify();
        match scan_root(&database, &root, &cancel, &mut progress) {
            Ok(complete) => traversal_failed |= !complete,
            Err(Stop::Cancelled) => {
                return finish(&state, LibraryScanState::Cancelled, None, &notify)
            }
            Err(Stop::Persistence) => {
                return finish(
                    &state,
                    LibraryScanState::Failed,
                    Some(ScanFailure::PersistenceFailed),
                    &notify,
                )
            }
        }
    }
    if traversal_failed {
        return finish(
            &state,
            LibraryScanState::Failed,
            Some(ScanFailure::RootTraversalFailed),
            &notify,
        );
    }
    // Only once every folder has been seen in full is a Missing track known to be missing, and so
    // a file that arrived known to be that track moved.
    if relink_moved(&database).is_err() {
        return finish(
            &state,
            LibraryScanState::Failed,
            Some(ScanFailure::PersistenceFailed),
            &notify,
        );
    }
    finish(&state, LibraryScanState::Completed, None, &notify)
}

fn relink_moved(database: &Database) -> Result<(), PersistError> {
    let mut connection = database.write()?;
    let relinked = relink::relink_moved(&mut connection)?;
    if relinked > 0 {
        info!("library.scan.relinked count={relinked}");
    }
    Ok(())
}

/// Ends the scan as failed, for a scan thread that died before it could say how it ended.
pub(crate) fn fail(state: &SharedScanState, notify: &Notifier) {
    // A panic can poison the lock; the snapshot is plain counters, so it is still good to use.
    let mut scan = state.lock().unwrap_or_else(|poisoned| {
        state.clear_poison();
        poisoned.into_inner()
    });
    scan.state = LibraryScanState::Failed;
    scan.current_root = None;
    scan.failure_code = Some(ScanFailure::Panicked);
    drop(scan);
    error!(
        "library.scan.failed failure_code={:?}",
        ScanFailure::Panicked
    );
    notify.notify();
}

/// How many files earlier scans left in `roots`: a rescan should find about as many again.
fn expected_files(database: &Database, roots: &[LibraryRoot]) -> u64 {
    let Ok(connection) = database.read() else {
        return 0;
    };
    roots
        .iter()
        .filter_map(|root| parse_id(&root.id).ok())
        .filter_map(|id| {
            connection
                .query_row(
                    "SELECT COUNT(*) FROM library_files WHERE root_id=?1 AND availability='available'",
                    [id],
                    |row| row.get::<_, i64>(0),
                )
                .ok()
        })
        .map(|count| u64::try_from(count).unwrap_or(0))
        .sum()
}

/// Scans one root. `Ok(false)` means the walk broke partway, so nothing is marked missing.
fn scan_root(
    database: &Database,
    root: &LibraryRoot,
    cancel: &AtomicBool,
    progress: &mut Progress<'_>,
) -> Result<bool, Stop> {
    let root_id = parse_id(&root.id).map_err(|_| Stop::Persistence)?;
    let reader = database.read().map_err(PersistError::from)?;
    let mut writer = LibraryWriter::new(database.write().map_err(PersistError::from)?);
    let generation = writer.begin_scan(root_id)?;
    let mut walk = discover(&root.path);
    let mut complete = true;
    loop {
        let mut planned: Vec<Plan> = Vec::new();
        let mut to_inspect = 0;
        let mut exhausted = false;
        while to_inspect < INSPECTIONS_PER_BATCH && planned.len() < FILES_PER_BATCH {
            if cancel.load(Ordering::Acquire) {
                return Err(Stop::Cancelled);
            }
            match walk.next() {
                None => {
                    exhausted = true;
                    break;
                }
                Some(Discovery::WalkFailed) => {
                    complete = false;
                    exhausted = true;
                    break;
                }
                Some(Discovery::Unusable { counted }) => {
                    if counted {
                        progress.discovered();
                    }
                    progress.failed();
                }
                Some(Discovery::Found(file)) => {
                    progress.discovered();
                    let plan = plan(&reader, root_id, file)?;
                    to_inspect += usize::from(matches!(plan, Plan::Inspect { .. }));
                    planned.push(plan);
                }
            }
        }
        let outcomes = read_batch(planned, database.data_dir(), cancel, progress);
        writer.write_batch(root_id, generation, &outcomes.outcomes)?;
        if outcomes.cancelled {
            return Err(Stop::Cancelled);
        }
        if exhausted {
            break;
        }
    }
    if complete {
        writer.finish_root(root_id, generation)?;
    } else {
        progress.failed();
    }
    Ok(complete)
}

struct ReadBatch {
    outcomes: Vec<Outcome>,
    /// The scan was cancelled before every file was reached; the ones it did reach are kept.
    cancelled: bool,
}

/// Inspects a batch's new files in parallel, with no transaction open. A file the cancelled scan
/// never reached is left out, so the next scan redoes it.
fn read_batch(
    planned: Vec<Plan>,
    data_dir: &Path,
    cancel: &AtomicBool,
    progress: &mut Progress<'_>,
) -> ReadBatch {
    let to_inspect: Vec<DiscoveredFile> = planned
        .iter()
        .filter_map(|plan| match plan {
            Plan::Inspect { file, .. } => Some(file.clone()),
            _ => None,
        })
        .collect();
    let mut inspections = inspect_all(&to_inspect, data_dir, cancel).into_iter();
    let mut outcomes = Vec::with_capacity(planned.len());
    let mut cancelled = false;
    for plan in planned {
        match plan {
            Plan::Touch { file_id } => outcomes.push(Outcome::Touch { file_id }),
            Plan::RetryArtwork {
                file_id,
                revision,
                file,
            } => outcomes.push(Outcome::RetryArtwork {
                file_id,
                revision,
                artwork: read_artwork(&file.path, data_dir),
            }),
            Plan::Inspect { known, file } => {
                let Some(result) = inspections.next().flatten() else {
                    cancelled = true;
                    continue;
                };
                progress.inspected();
                if result.is_ok() {
                    progress.indexed();
                } else {
                    progress.failed();
                }
                outcomes.push(Outcome::Inspected {
                    known,
                    file,
                    result: Box::new(result),
                });
            }
        }
    }
    ReadBatch {
        outcomes,
        cancelled,
    }
}

fn finish(
    state: &SharedScanState,
    outcome: LibraryScanState,
    failure: Option<ScanFailure>,
    notify: &Notifier,
) -> LibraryScanState {
    let snapshot = {
        let mut scan = state.lock().expect("scan state lock");
        scan.state = outcome;
        scan.current_root = None;
        scan.failure_code = failure;
        scan.clone()
    };
    let counts = format!(
        "discovered_count={} inspected_count={} indexed_count={} failed_count={}",
        snapshot.discovered_count,
        snapshot.inspected_count,
        snapshot.indexed_count,
        snapshot.failed_count
    );
    match snapshot.state {
        LibraryScanState::Completed => info!("library.scan.completed {counts}"),
        LibraryScanState::Cancelled => info!("library.scan.cancelled {counts}"),
        LibraryScanState::Failed => error!(
            "library.scan.failed {counts} failure_code={:?}",
            snapshot.failure_code
        ),
        LibraryScanState::Idle | LibraryScanState::Running => {}
    }
    notify.notify();
    outcome
}

/// Counts what the scan has done and tells listeners, at most a few times a second.
struct Progress<'a> {
    state: &'a SharedScanState,
    notify: &'a Notifier,
    last_signal: Instant,
}

impl<'a> Progress<'a> {
    fn new(state: &'a SharedScanState, notify: &'a Notifier) -> Self {
        Self {
            state,
            notify,
            last_signal: Instant::now() - PROGRESS_SIGNAL_INTERVAL,
        }
    }

    fn count(&mut self, update: impl FnOnce(&mut LibraryScanSnapshot)) {
        update(&mut self.state.lock().expect("scan state lock"));
        if self.last_signal.elapsed() >= PROGRESS_SIGNAL_INTERVAL {
            self.notify.notify();
            self.last_signal = Instant::now();
        }
    }

    fn discovered(&mut self) {
        self.count(|scan| scan.discovered_count += 1);
    }

    fn inspected(&mut self) {
        self.count(|scan| scan.inspected_count += 1);
    }

    fn indexed(&mut self) {
        self.count(|scan| scan.indexed_count += 1);
    }

    fn failed(&mut self) {
        self.count(|scan| scan.failed_count += 1);
    }
}
