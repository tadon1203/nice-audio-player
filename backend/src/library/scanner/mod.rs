//! Library scanning: discover files, inspect the new or changed ones, persist the results.
//!
//! The work goes in batches. Each batch is reconciled with the database (one transaction),
//! its new files are inspected in parallel, and the results are written in the same
//! transaction, so a failure or an abort never leaves a half-written batch.

mod discover;
mod inspect;
mod persist;

use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use log::{error, info};

use super::database::Database;
use super::models::{LibraryRoot, LibraryScanSnapshot, LibraryScanState};
use super::service::parse_id;
use crate::events::Notifier;
use discover::{discover, DiscoveredFile, Discovery};
use inspect::{inspect_all, read_artwork};
use persist::{LibraryWriter, PersistError, Reconciled, Work};

/// Files reconciled and inspected per transaction.
const BATCH_SIZE: usize = 100;
const PROGRESS_SIGNAL_INTERVAL: Duration = Duration::from_millis(200);

type SharedScanState = Arc<Mutex<LibraryScanSnapshot>>;

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

/// Scans `roots` in order, publishing progress through `state` and `notify`. Returns when the
/// scan completed, failed, or was cancelled; the final state is in `state`.
pub(crate) fn run(
    database: Database,
    roots: Vec<LibraryRoot>,
    state: SharedScanState,
    cancel: Arc<AtomicBool>,
    notify: Notifier,
) {
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
                    Some("persistenceFailed".into()),
                    &notify,
                )
            }
        }
    }
    if traversal_failed {
        finish(
            &state,
            LibraryScanState::Failed,
            Some("rootTraversalFailed".into()),
            &notify,
        )
    } else {
        finish(&state, LibraryScanState::Completed, None, &notify)
    }
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
    let writer = LibraryWriter::new(database.write().map_err(|_| Stop::Persistence)?);
    let generation = writer.begin_scan(root_id)?;
    let mut walk = discover(&root.path);
    let mut complete = true;
    loop {
        writer.begin_batch()?;
        let mut new_files: Vec<(DiscoveredFile, Reconciled)> = Vec::new();
        let mut exhausted = false;
        while new_files.len() < BATCH_SIZE {
            if cancel.load(Ordering::Acquire) {
                writer.commit_batch()?;
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
                    let reconciled = writer.reconcile(root_id, generation, &file)?;
                    match reconciled.work {
                        Work::Nothing => {}
                        Work::RetryArtwork => {
                            let artwork = read_artwork(&file.path, database.data_dir());
                            writer.apply_artwork(&reconciled, &artwork)?;
                        }
                        Work::Inspect => new_files.push((file, reconciled)),
                    }
                }
            }
        }
        store_batch(&writer, database.data_dir(), new_files, cancel, progress)?;
        writer.commit_batch()?;
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

/// Inspects a batch's new files in parallel and writes the results.
fn store_batch(
    writer: &LibraryWriter,
    data_dir: &Path,
    new_files: Vec<(DiscoveredFile, Reconciled)>,
    cancel: &AtomicBool,
    progress: &mut Progress<'_>,
) -> Result<(), Stop> {
    if new_files.is_empty() {
        return Ok(());
    }
    let files: Vec<DiscoveredFile> = new_files.iter().map(|(file, _)| file.clone()).collect();
    let results = inspect_all(&files, data_dir, cancel);
    let mut cancelled = false;
    for ((file, reconciled), result) in new_files.iter().zip(results) {
        // A file the cancelled scan never reached stays `pending`, so the next scan redoes it.
        let Some(result) = result else {
            cancelled = true;
            continue;
        };
        progress.inspected();
        match result {
            Ok(inspected) => {
                writer.store_inspected(file, reconciled, &inspected)?;
                progress.indexed();
            }
            Err(_) => {
                writer.mark_unsupported(reconciled.file_id)?;
                progress.failed();
            }
        }
    }
    if cancelled {
        writer.commit_batch()?;
        return Err(Stop::Cancelled);
    }
    Ok(())
}

fn finish(
    state: &SharedScanState,
    outcome: LibraryScanState,
    failure_code: Option<String>,
    notify: &Notifier,
) {
    let snapshot = {
        let mut scan = state.lock().expect("scan state lock");
        scan.state = outcome;
        scan.current_root = None;
        scan.failure_code = failure_code;
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
