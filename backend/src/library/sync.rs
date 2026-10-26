//! The write side of the Library: one thread, `LibraryWorker`, owns the directories, their file
//! watchers, and the scan thread. Everything that can change what the Library holds reaches it as an
//! input on one channel: a command from `Library`, a watcher that saw a change, or a scan that ended.
//! The worker blocks on that channel until the next input or the debounce deadline, so it never polls.
//!
//! The rules: a change in a watched directory starts a scan once the directory has been quiet for
//! `DEBOUNCE`. Changes that come during a scan wait for it to end. A watcher that cannot attach is
//! logged and not retried.

use super::{
    LibraryStatus, StoreError, artwork,
    database::Database,
    directories,
    models::{LibraryDirectory, LibraryState, ScanFailure, ScanState, ScanStatus},
    scan,
    version::LibraryVersion,
};
use crate::errors::CommandError;
use crate::ids::DirectoryId;
use crate::state_store::StateStore;
use crate::threads::{Cancellation, request, run_in_background};
use log::{debug, error, info, warn};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc,
        mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

/// How long a directory must be quiet after a change before it is scanned, so copying an album
/// starts one scan and not one per file.
#[cfg(not(test))]
const DEBOUNCE: Duration = Duration::from_millis(500);
#[cfg(test)]
const DEBOUNCE: Duration = Duration::from_millis(50);

type Reply<T> = SyncSender<Result<T, CommandError>>;

/// What a caller asks the worker to do. Each command answers on its own reply channel.
pub(crate) enum SyncCommand {
    AddDirectory(String, Reply<()>),
    SetDirectoryEnabled(DirectoryId, bool, Reply<()>),
    RemoveDirectory(DirectoryId, Reply<()>),
    DeleteMissingTracks(Reply<()>),
    StartScan(Reply<()>),
    CancelScan(Reply<()>),
    Shutdown(Reply<()>),
}

/// How a scan ended, as the scan thread reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ScanOutcome {
    Completed,
    Cancelled,
    Failed,
}

pub(crate) enum SyncInput {
    Command(SyncCommand),
    /// A watcher saw a change in `directory`: at these paths, or somewhere in it when `dirs` is `None`.
    Changed {
        directory: DirectoryId,
        dirs: Option<Vec<PathBuf>>,
    },
    /// The scan's state changed. The scan thread sends its final state before `ScanEnded`.
    ScanProgress(ScanState),
    ScanEnded(ScanOutcome),
}

/// Answers a command, if its caller is still waiting. A caller that has gone away is logged, not
/// an error.
fn respond<T>(reply: &Reply<T>, result: Result<T, CommandError>) {
    if reply.send(result).is_err() {
        debug!("library.reply_closed");
    }
}

/// Sends an input to the worker. The worker may already be gone, which is logged.
fn send(messages: &Sender<SyncInput>, input: SyncInput) {
    if let Err(cause) = messages.send(input) {
        debug!("library.sync.input_send_failed cause={cause}");
    }
}

/// The handle `Library` holds. Dropping the last one stops the worker.
pub(crate) struct LibrarySync {
    messages: Sender<SyncInput>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl LibrarySync {
    pub(crate) fn start(
        database: Database,
        state_store: Arc<StateStore>,
        version: Arc<LibraryVersion>,
    ) -> Self {
        let (messages, receiver) = mpsc::channel();
        let worker = LibraryWorker {
            database,
            state_store,
            version,
            state: LibraryState::empty(LibraryStatus::Ready),
            messages: messages.clone(),
            dirty: HashMap::new(),
            deadline: None,
            scan: None,
            collector: None,
            watchers: HashMap::new(),
        };
        let thread = thread::Builder::new()
            .name("library-sync".into())
            .spawn(move || worker.run(&receiver))
            .expect("the OS starts a thread unless it is out of resources");
        Self {
            messages,
            thread: Mutex::new(Some(thread)),
        }
    }

    /// Sends a command and waits for its answer. A worker that has stopped is `TaskFailed`.
    fn call<T>(&self, command: impl FnOnce(Reply<T>) -> SyncCommand) -> Result<T, CommandError> {
        request(&self.messages, |reply| SyncInput::Command(command(reply)))?
    }

    pub(crate) fn add_directory(&self, path: String) -> Result<(), CommandError> {
        self.call(|reply| SyncCommand::AddDirectory(path, reply))
    }

    pub(crate) fn set_directory_enabled(
        &self,
        id: DirectoryId,
        enabled: bool,
    ) -> Result<(), CommandError> {
        self.call(|reply| SyncCommand::SetDirectoryEnabled(id, enabled, reply))
    }

    pub(crate) fn remove_directory(&self, id: DirectoryId) -> Result<(), CommandError> {
        self.call(|reply| SyncCommand::RemoveDirectory(id, reply))
    }

    pub(crate) fn delete_missing_tracks(&self) -> Result<(), CommandError> {
        self.call(SyncCommand::DeleteMissingTracks)
    }

    pub(crate) fn start_scan(&self) -> Result<(), CommandError> {
        self.call(SyncCommand::StartScan)
    }

    pub(crate) fn cancel_scan(&self) -> Result<(), CommandError> {
        self.call(SyncCommand::CancelScan)
    }

    /// Stops the worker, its watchers and the scan in progress, and waits for them.
    pub(crate) fn shutdown(&self) {
        if let Err(cause) = self.call(SyncCommand::Shutdown) {
            debug!("library.sync.shutdown_failed cause={cause}");
        }
        let thread = self.thread.lock().take();
        if let Some(thread) = thread
            && thread.join().is_err()
        {
            error!("library.sync.worker_panicked");
        }
    }
}

impl Drop for LibrarySync {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// The write side's state. Only the worker thread touches it.
struct LibraryWorker {
    database: Database,
    state_store: Arc<StateStore>,
    /// The Library version, which the worker advances after each committed directory change.
    version: Arc<LibraryVersion>,
    /// The Library state as last published. The worker is its only writer.
    state: LibraryState,
    /// For the inputs the watchers and the scan thread send back.
    messages: Sender<SyncInput>,
    /// What is waiting to be scanned: a directory's changed paths, or `None` for all of it.
    dirty: HashMap<DirectoryId, Option<HashSet<PathBuf>>>,
    /// When the next automatic scan is due. `None` while a scan runs.
    deadline: Option<Instant>,
    scan: Option<RunningScan>,
    /// The artwork collection started by a removal, which must end before a scan writes artwork.
    collector: Option<JoinHandle<()>>,
    watchers: HashMap<DirectoryId, RecommendedWatcher>,
}

struct RunningScan {
    cancellation: Cancellation,
    thread: JoinHandle<()>,
}

impl LibraryWorker {
    fn run(mut self, receiver: &Receiver<SyncInput>) {
        for directory in self.enabled_directories_or_log() {
            self.watch_and_scan(&directory, DEBOUNCE);
        }
        self.read_directories();
        self.publish();
        loop {
            let input = match self.deadline {
                Some(deadline) => {
                    match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    {
                        Ok(input) => Some(input),
                        Err(RecvTimeoutError::Timeout) => None,
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
                None => match receiver.recv() {
                    Ok(input) => Some(input),
                    Err(_) => break,
                },
            };
            match input {
                Some(SyncInput::Command(command)) => {
                    if !self.command(command) {
                        return;
                    }
                }
                Some(SyncInput::Changed { directory, dirs }) => self.changed(directory, dirs),
                Some(SyncInput::ScanProgress(scan)) => {
                    self.state.scan = scan;
                    self.publish();
                }
                Some(SyncInput::ScanEnded(outcome)) => self.scan_ended(outcome),
                None => {}
            }
            self.start_due_scan();
        }
        self.stop();
    }

    /// Carries out a command. Returns `false` when the worker must stop.
    fn command(&mut self, command: SyncCommand) -> bool {
        match command {
            SyncCommand::AddDirectory(path, reply) => {
                let result = self.while_idle(|database| directories::add(database, &path));
                if let Ok(directory) = &result {
                    self.watch_and_scan(directory, Duration::ZERO);
                    self.changed_directories();
                }
                respond(&reply, result.map(|_| ()));
            }
            SyncCommand::SetDirectoryEnabled(id, enabled, reply) => {
                let result =
                    self.while_idle(|database| directories::set_enabled(database, id, enabled));
                if result.is_ok() {
                    self.set_enabled(id, enabled);
                    self.changed_directories();
                }
                respond(&reply, result);
            }
            SyncCommand::RemoveDirectory(id, reply) => {
                let result = self.while_idle(|database| directories::remove(database, id));
                if result.is_ok() {
                    self.dirty.remove(&id);
                    self.watchers.remove(&id);
                    self.collect_artwork_in_background();
                    self.changed_directories();
                }
                respond(&reply, result);
            }
            SyncCommand::DeleteMissingTracks(reply) => {
                let result = self.while_idle(directories::delete_missing);
                if result.is_ok() {
                    self.collect_artwork_in_background();
                    self.changed_directories();
                }
                respond(&reply, result);
            }
            SyncCommand::StartScan(reply) => {
                let result = if self.scan.is_some() {
                    Err(CommandError::ScanAlreadyRunning)
                } else {
                    self.enabled_directories().and_then(|directories| {
                        if directories.is_empty() {
                            return Err(CommandError::NoEnabledDirectories);
                        }
                        // A whole scan covers every change too, so the pending ones go.
                        self.dirty.clear();
                        self.begin_scan(
                            directories
                                .iter()
                                .map(|directory| (directory.id, None))
                                .collect(),
                        )
                    })
                };
                respond(&reply, result);
            }
            SyncCommand::CancelScan(reply) => {
                let result = match &self.scan {
                    Some(scan) => {
                        scan.cancellation.cancel();
                        Ok(())
                    }
                    None => Err(CommandError::ScanNotRunning),
                };
                respond(&reply, result);
            }
            SyncCommand::Shutdown(reply) => {
                self.stop();
                respond(&reply, Ok(()));
                return false;
            }
        }
        true
    }

    /// Runs a change to the directories, unless a scan is running: directories cannot change under one.
    fn while_idle<T>(
        &mut self,
        change: impl FnOnce(&Database) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        if self.scan.is_some() {
            return Err(CommandError::ScanAlreadyRunning);
        }
        change(&self.database)
    }

    /// Called after a committed change to the directories or their tracks: advances the Library
    /// version, reads the directory rows, and publishes the Library state.
    fn changed_directories(&mut self) {
        self.version.bump();
        self.read_directories();
        self.publish();
    }

    /// Reads the directory rows, with their counts, into the state. A failed read is logged and
    /// keeps the rows last read.
    fn read_directories(&mut self) {
        let directories = self
            .database
            .read()
            .map_err(StoreError::from)
            .and_then(|connection| directories::list(&connection));
        match directories {
            Ok(directories) => self.state.directories = directories,
            Err(error) => error!("library.directories.read_failed error={error:?}"),
        }
    }

    /// Sets the Library version in the state and pushes the state. Every change to the state goes
    /// through here.
    fn publish(&mut self) {
        self.state.version = self.version.get();
        self.state_store.set_library(self.state.clone());
    }

    /// Watches a directory and marks all of it for a scan after `delay`. A watcher that cannot attach
    /// is logged; the directory is still scanned, but its changes are not seen until it is enabled again.
    fn watch_and_scan(&mut self, directory: &LibraryDirectory, delay: Duration) {
        match attach(directory, self.messages.clone()) {
            Ok(watcher) => {
                self.watchers.insert(directory.id, watcher);
            }
            Err(cause) => {
                warn!(
                    "library.watcher.attach_failed directory_id={} cause={cause}",
                    directory.id.rowid()
                );
            }
        }
        self.dirty.insert(directory.id, None);
        self.deadline = Some(Instant::now() + delay);
    }

    fn set_enabled(&mut self, id: DirectoryId, enabled: bool) {
        if !enabled {
            self.dirty.remove(&id);
            self.watchers.remove(&id);
            return;
        }
        let directory = self
            .enabled_directories_or_log()
            .into_iter()
            .find(|directory| directory.id == id);
        if let Some(directory) = directory {
            self.watch_and_scan(&directory, Duration::ZERO);
        }
    }

    /// A change in a watched directory. It waits for the debounce, or for the scan in progress.
    fn changed(&mut self, directory: DirectoryId, dirs: Option<Vec<PathBuf>>) {
        if !self.watchers.contains_key(&directory) {
            return;
        }
        let pending = self
            .dirty
            .entry(directory)
            .or_insert_with(|| Some(HashSet::new()));
        match (pending, dirs) {
            (pending, None) => *pending = None,
            (Some(paths), Some(changed)) => paths.extend(changed),
            // Everything in the directory is already waiting to be scanned.
            (None, Some(_)) => {}
        }
        if self.scan.is_none() {
            self.deadline = Some(Instant::now() + DEBOUNCE);
        }
    }

    fn scan_ended(&mut self, outcome: ScanOutcome) {
        debug!("library.scan.ended outcome={outcome:?}");
        self.reap_scan();
        if self.state.scan.status == ScanStatus::Running {
            // The scan thread died before it published how the scan ended.
            self.state.scan.status = ScanStatus::Failed;
            self.state.scan.current_directory = None;
            self.state.scan.failure = Some(ScanFailure::Panicked);
            error!("library.scan.failed failure={:?}", ScanFailure::Panicked);
        }
        self.read_directories();
        self.publish();
        // Changes that came in during the scan are scanned next.
        if !self.dirty.is_empty() {
            self.deadline = Some(Instant::now());
        }
    }

    /// Starts the automatic scan when its deadline has passed and no scan runs.
    fn start_due_scan(&mut self) {
        let due = self
            .deadline
            .is_some_and(|deadline| deadline <= Instant::now());
        if !due || self.scan.is_some() {
            return;
        }
        self.deadline = None;
        let targets = std::mem::take(&mut self.dirty);
        if let Err(cause) = self.begin_scan(targets.clone()) {
            // The changes stay pending: the next change or the next scan request picks them up.
            warn!("library.scan.start_failed cause={cause}");
            self.dirty = targets;
        }
    }

    /// Starts the scan thread for `targets`, the directories still enabled among them.
    fn begin_scan(
        &mut self,
        mut targets: HashMap<DirectoryId, Option<HashSet<PathBuf>>>,
    ) -> Result<(), CommandError> {
        self.wait_for_collection();
        let jobs: Vec<scan::ScanJob> = self
            .enabled_directories()?
            .into_iter()
            .filter_map(|directory| {
                let dirs = targets.remove(&directory.id)?;
                Some(scan::ScanJob {
                    directory,
                    dirs: dirs.map(|paths| paths.into_iter().collect()),
                })
            })
            .collect();
        if jobs.is_empty() {
            return Ok(());
        }
        self.state.scan = ScanState {
            status: ScanStatus::Running,
            ..ScanState::idle()
        };
        self.publish();
        info!("library.scan.started directory_count={}", jobs.len());
        let cancellation = Cancellation::default();
        let (database, version) = (self.database.clone(), Arc::clone(&self.version));
        let (thread_cancellation, messages) = (cancellation.clone(), self.messages.clone());
        let thread = thread::Builder::new()
            .name("library-scan".into())
            .spawn(move || {
                run_in_background();
                let mut ending = ScanEnding::new(messages.clone());
                let publish = |scan: ScanState| send(&messages, SyncInput::ScanProgress(scan));
                let status = scan::run(&database, &jobs, &publish, &version, &thread_cancellation);
                ending.finish(match status {
                    ScanStatus::Completed => ScanOutcome::Completed,
                    ScanStatus::Cancelled => ScanOutcome::Cancelled,
                    _ => ScanOutcome::Failed,
                });
            })
            .expect("the OS starts a thread unless it is out of resources");
        self.scan = Some(RunningScan {
            cancellation,
            thread,
        });
        self.deadline = None;
        Ok(())
    }

    fn reap_scan(&mut self) {
        if let Some(scan) = self.scan.take()
            && scan.thread.join().is_err()
        {
            error!("library.scan.worker_panicked");
        }
    }

    /// Collects the artwork no track uses, on a short-lived thread. A scan waits for it to end, so
    /// the collection never deletes a file that a scan is about to reference.
    fn collect_artwork_in_background(&mut self) {
        self.wait_for_collection();
        let database = self.database.clone();
        match thread::Builder::new()
            .name("library-artwork-collect".into())
            .spawn(move || {
                if let Err(cause) = artwork::collect(&database) {
                    warn!("library.artwork.collect_failed cause={cause:?}");
                }
            }) {
            Ok(collector) => self.collector = Some(collector),
            Err(cause) => warn!("library.artwork.thread_failed cause={cause}"),
        }
    }

    fn wait_for_collection(&mut self) {
        if let Some(collector) = self.collector.take()
            && collector.join().is_err()
        {
            error!("library.artwork.collector_panicked");
        }
    }

    fn enabled_directories(&self) -> Result<Vec<LibraryDirectory>, CommandError> {
        let connection = self.database.read().map_err(StoreError::from)?;
        Ok(directories::list(&connection)?
            .into_iter()
            .filter(|directory| directory.enabled)
            .collect())
    }

    /// For callers that carry on without directories: a failed read is logged, not mistaken for
    /// "no directories".
    fn enabled_directories_or_log(&self) -> Vec<LibraryDirectory> {
        self.enabled_directories().unwrap_or_else(|error| {
            error!("library.directories.read_failed error={error:?}");
            Vec::new()
        })
    }

    /// Stops the scan in progress, the watchers and the collection, and waits for them.
    fn stop(&mut self) {
        if let Some(scan) = &self.scan {
            scan.cancellation.cancel();
        }
        self.reap_scan();
        self.wait_for_collection();
        self.watchers.clear();
    }
}

/// Watches `directory` and sends its changes to the worker. An event that names no path means the
/// watcher lost track, so the whole directory is scanned.
fn attach(
    directory: &LibraryDirectory,
    messages: Sender<SyncInput>,
) -> notify::Result<RecommendedWatcher> {
    let id = directory.id;
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let dirs = match result {
            Ok(event) if matches!(event.kind, EventKind::Access(_)) => return,
            Ok(event) if !event.paths.is_empty() => Some(event.paths),
            Ok(_) | Err(_) => None,
        };
        if let Err(cause) = messages.send(SyncInput::Changed {
            directory: id,
            dirs,
        }) {
            debug!("library.watcher.input_send_failed cause={cause}");
        }
    })?;
    watcher.watch(Path::new(&directory.path), RecursiveMode::Recursive)?;
    Ok(watcher)
}

/// Tells the worker how a scan thread ended. If the thread dies first, the scan ends as failed
/// when this drops, so the scan never stays "Running".
struct ScanEnding {
    messages: Sender<SyncInput>,
    finished: bool,
}

impl ScanEnding {
    fn new(messages: Sender<SyncInput>) -> Self {
        Self {
            messages,
            finished: false,
        }
    }

    fn finish(&mut self, outcome: ScanOutcome) {
        self.finished = true;
        send(&self.messages, SyncInput::ScanEnded(outcome));
    }
}

impl Drop for ScanEnding {
    fn drop(&mut self) {
        if !self.finished {
            send(&self.messages, SyncInput::ScanEnded(ScanOutcome::Failed));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestDirectory, null_notifier, state_store_for_tests};

    #[test]
    fn a_scan_that_ends_without_publishing_its_state_is_published_as_failed() {
        let directory = TestDirectory::new();
        let database = Database::initialize(&directory.file("data")).expect("database");
        let state_store = state_store_for_tests(null_notifier());
        let (messages, _received) = mpsc::channel();
        let mut worker = LibraryWorker {
            database,
            state_store: Arc::clone(&state_store),
            version: Arc::new(LibraryVersion::default()),
            state: LibraryState {
                scan: ScanState {
                    status: ScanStatus::Running,
                    ..ScanState::idle()
                },
                ..LibraryState::empty(LibraryStatus::Ready)
            },
            messages,
            dirty: HashMap::new(),
            deadline: None,
            scan: None,
            collector: None,
            watchers: HashMap::new(),
        };

        worker.scan_ended(ScanOutcome::Failed);

        let scan = state_store.library().value.scan;
        assert_eq!(scan.status, ScanStatus::Failed);
        assert_eq!(scan.failure, Some(ScanFailure::Panicked));
    }

    #[test]
    fn a_scan_thread_that_dies_reports_the_scan_as_failed() {
        let (messages, received) = mpsc::channel();

        let died = thread::Builder::new()
            .name("scanner-bug-test".into())
            .spawn(move || {
                let _ending = ScanEnding::new(messages);
                panic!("scanner bug");
            })
            .unwrap()
            .join();

        assert!(died.is_err());
        assert!(matches!(
            received.try_recv(),
            Ok(SyncInput::ScanEnded(ScanOutcome::Failed))
        ));
    }
}
