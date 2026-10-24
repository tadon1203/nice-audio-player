//! Library scanning: discover files, inspect the new or changed ones, persist the results.
//!
//! The work goes in batches. A batch is planned against the database read-only, its new files are
//! inspected in parallel with no transaction open, and the results are written in one short
//! transaction, so a failure or an abort never leaves a half-written batch and the write lock is
//! never held while files are read.

mod discover;
pub(crate) mod identity;
mod inspect;
mod persist;
mod relink;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use log::{error, info};

use super::database::Database;
use super::models::{LibraryDirectory, ScanFailure, ScanState, ScanStatus};
use crate::messages::StateValue;
use crate::state_hub::StateHub;
use discover::{DiscoveredFile, Discovery, discover, relative_dir, scope};
use inspect::{inspect_all, read_artwork};
use persist::{LibraryWriter, Outcome, PersistError, Plan, plan};

/// Files inspected per transaction.
const INSPECTIONS_PER_BATCH: usize = 100;
/// Files planned per transaction, however few of them need inspecting.
const FILES_PER_BATCH: usize = 1_000;
const PROGRESS_PUBLISH_INTERVAL: Duration = Duration::from_millis(200);

/// One directory to scan: all of it, or only the directories where something changed.
pub(crate) struct ScanJob {
    pub directory: LibraryDirectory,
    pub dirs: Option<Vec<PathBuf>>,
}

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

/// Scans `jobs` in order, publishing progress through `hub`. Returns how the scan ended, which is
/// also the published scan state.
pub(crate) fn run(
    database: &Database,
    jobs: &[ScanJob],
    hub: &StateHub,
    cancel: &AtomicBool,
) -> ScanStatus {
    let expected = expected_files(database, jobs);
    let mut progress = Progress::new(hub);
    progress.change(|scan| scan.expected_count = expected);
    let mut traversal_failed = false;
    for job in jobs {
        let directory = job.directory.clone();
        if cancel.load(Ordering::Acquire) {
            return progress.finish(ScanStatus::Cancelled, None);
        }
        progress.change(|scan| scan.current_directory = Some(directory.clone()));
        match scan_directory(database, job, cancel, &mut progress) {
            Ok(complete) => traversal_failed |= !complete,
            Err(Stop::Cancelled) => {
                return progress.finish(ScanStatus::Cancelled, None);
            }
            Err(Stop::Persistence) => {
                return progress.finish(ScanStatus::Failed, Some(ScanFailure::PersistenceFailed));
            }
        }
    }
    if traversal_failed {
        return progress.finish(
            ScanStatus::Failed,
            Some(ScanFailure::DirectoryTraversalFailed),
        );
    }
    // Only once every directory has been seen in full is a Missing track known to be missing, and so
    // a file that arrived known to be that track moved.
    match relink_moved(database) {
        Ok(relinked) => progress.changed(relinked as u64),
        Err(_) => {
            return progress.finish(ScanStatus::Failed, Some(ScanFailure::PersistenceFailed));
        }
    }
    progress.finish(ScanStatus::Completed, None)
}

fn relink_moved(database: &Database) -> Result<usize, PersistError> {
    let mut connection = database.write()?;
    let relinked = relink::relink_moved(&mut connection)?;
    if relinked > 0 {
        info!("library.scan.relinked count={relinked}");
    }
    Ok(relinked)
}

/// Ends the scan as failed, for a scan thread that died before it could say how it ended. The
/// counts are the ones last published.
pub(crate) fn fail(hub: &StateHub) {
    let mut scan = hub.read(|published| published.scan.value.clone());
    scan.state = ScanStatus::Failed;
    scan.current_directory = None;
    scan.failure_code = Some(ScanFailure::Panicked);
    scan.finished_count += 1;
    hub.publish(StateValue::Scan(scan));
    error!(
        "library.scan.failed failure_code={:?}",
        ScanFailure::Panicked
    );
}

/// How many files earlier scans left in `directories`: a rescan should find about as many again.
fn expected_files(database: &Database, jobs: &[ScanJob]) -> u64 {
    let Ok(connection) = database.read() else {
        return 0;
    };
    jobs.iter()
        .filter(|job| job.dirs.is_none())
        .map(|job| job.directory.id.rowid())
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

/// Scans one directory. `Ok(false)` means the walk broke partway, so nothing is marked missing.
fn scan_directory(
    database: &Database,
    job: &ScanJob,
    cancel: &AtomicBool,
    progress: &mut Progress<'_>,
) -> Result<bool, Stop> {
    let directory = &job.directory;
    let directory_id = directory.id.rowid();
    let reader = database.read().map_err(PersistError::from)?;
    let mut writer = LibraryWriter::new(database.write().map_err(PersistError::from)?);
    let generation = writer.begin_scan(directory_id)?;
    let dirs = scope(Path::new(&directory.path), job.dirs.as_deref());
    // The prefixes the walk covers, to mark only those files Missing.
    let within: Option<Vec<String>> = job.dirs.as_ref().map(|_| {
        dirs.iter()
            .map(|dir| match relative_dir(&directory.path, dir) {
                relative if relative.is_empty() => relative,
                relative => format!("{relative}/"),
            })
            .collect()
    });
    let mut walk = discover(&directory.path, &dirs);
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
                    let plan = plan(&reader, directory_id, file)?;
                    to_inspect += usize::from(matches!(plan, Plan::Inspect { .. }));
                    planned.push(plan);
                }
            }
        }
        let outcomes = read_batch(planned, database.data_dir(), cancel, progress);
        let changed = writer.write_batch(directory_id, generation, &outcomes.outcomes)?;
        progress.changed(changed);
        if outcomes.cancelled {
            return Err(Stop::Cancelled);
        }
        if exhausted {
            break;
        }
    }
    if complete {
        let gone = writer.finish_directory(directory_id, generation, within.as_deref())?;
        progress.changed(gone);
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
            Plan::Touch {
                file_id,
                was_missing,
            } => outcomes.push(Outcome::Touch {
                file_id,
                was_missing,
            }),
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

/// Counts what the scan has done, and publishes it. The scan thread is the only writer while a
/// scan runs, so `scan` is its working copy of the published state.
struct Progress<'a> {
    hub: &'a StateHub,
    scan: ScanState,
    last_publish: Instant,
}

impl<'a> Progress<'a> {
    fn new(hub: &'a StateHub) -> Self {
        Self {
            hub,
            scan: hub.read(|published| published.scan.value.clone()),
            last_publish: Instant::now()
                .checked_sub(PROGRESS_PUBLISH_INTERVAL)
                .unwrap_or_else(Instant::now),
        }
    }

    /// Changes the scan and publishes the change now.
    fn change(&mut self, update: impl FnOnce(&mut ScanState)) {
        update(&mut self.scan);
        self.publish();
    }

    /// Changes the scan, and publishes it at most once per `PROGRESS_PUBLISH_INTERVAL`. The next
    /// `change` or the end of the scan publishes what this one left out.
    fn count(&mut self, update: impl FnOnce(&mut ScanState)) {
        update(&mut self.scan);
        if self.last_publish.elapsed() >= PROGRESS_PUBLISH_INTERVAL {
            self.publish();
        }
    }

    fn publish(&mut self) {
        self.hub.publish(StateValue::Scan(self.scan.clone()));
        self.last_publish = Instant::now();
    }

    /// Ends the scan with `outcome` and publishes the final state.
    fn finish(&mut self, outcome: ScanStatus, failure: Option<ScanFailure>) -> ScanStatus {
        self.change(|scan| {
            scan.state = outcome;
            scan.current_directory = None;
            scan.failure_code = failure;
            scan.finished_count += 1;
        });
        let counts = format!(
            "discovered_count={} inspected_count={} indexed_count={} failed_count={}",
            self.scan.discovered_count,
            self.scan.inspected_count,
            self.scan.indexed_count,
            self.scan.failed_count
        );
        match self.scan.state {
            ScanStatus::Completed => info!("library.scan.completed {counts}"),
            ScanStatus::Cancelled => info!("library.scan.cancelled {counts}"),
            ScanStatus::Failed => error!(
                "library.scan.failed {counts} failure_code={:?}",
                self.scan.failure_code
            ),
            ScanStatus::Idle | ScanStatus::Running => {}
        }
        outcome
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

    fn changed(&mut self, files: u64) {
        if files > 0 {
            self.count(|scan| scan.changed_count += files);
        }
    }

    fn failed(&mut self) {
        self.count(|scan| scan.failed_count += 1);
    }
}
