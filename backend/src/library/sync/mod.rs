//! The write side of the Library: one actor that owns the folders, the file watchers and the
//! scanner thread. Everything that can change what the Library holds reaches it as an input on one
//! channel (a listener's command, a watcher seeing a change, the scanner finishing), and it blocks
//! on that channel until the next input or the next deadline its state asks for, so it never polls.
//!
//! The decisions are in `step.rs`; this file carries them out.

mod step;

use super::{
    database::Database,
    error::{parse_id, LibraryCommandError, StoreError},
    maintenance,
    models::{LibraryRoot, LibraryScanSnapshot, LibraryScanState},
    roots, scanner, watcher,
};
use crate::activity::{
    ApplicationActivity, ApplicationActivityHandle, ApplicationActivityKind,
    ApplicationActivityState,
};
use crate::events::Notifier;
use log::{error, info, warn};
use notify::RecommendedWatcher;
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::Instant,
};
use step::{Activity, Effect, Input, RootId, ScanOutcome, ScanTarget, State};

const LIBRARY_ACTIVITY_ID: &str = "library-sync";

type Reply<T> = SyncSender<Result<T, LibraryCommandError>>;

enum Command {
    Register(String, Reply<LibraryRoot>),
    Enable(String, bool, Reply<LibraryRoot>),
    Remove(String, Reply<()>),
    DeleteMissing(Reply<u64>),
    Start(Reply<()>),
    Cancel(Reply<()>),
}

enum Message {
    Command(Command),
    Input(Input),
    Shutdown,
}

/// A handle to the actor. Dropping the last one shuts it down.
pub(crate) struct LibrarySync {
    messages: Sender<Message>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl LibrarySync {
    pub fn start(
        database: Database,
        scan: Arc<Mutex<LibraryScanSnapshot>>,
        notify: Notifier,
        activity: Option<ApplicationActivityHandle>,
    ) -> Self {
        let (messages, receiver) = mpsc::channel();
        let actor = Actor {
            database,
            scan,
            notify,
            activity,
            messages: messages.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
            state: State::new(),
            watchers: HashMap::new(),
            scanner: None,
            queue: VecDeque::new(),
        };
        let thread = thread::spawn(move || actor.run(receiver));
        Self {
            messages,
            thread: Mutex::new(Some(thread)),
        }
    }

    fn call<T>(&self, command: impl FnOnce(Reply<T>) -> Command) -> Result<T, LibraryCommandError> {
        let (reply, answer) = mpsc::sync_channel(1);
        self.messages
            .send(Message::Command(command(reply)))
            .map_err(|_| LibraryCommandError::TaskFailed)?;
        answer.recv().map_err(|_| LibraryCommandError::TaskFailed)?
    }

    pub fn register_root(&self, path: String) -> Result<LibraryRoot, LibraryCommandError> {
        self.call(|reply| Command::Register(path, reply))
    }

    pub fn set_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> Result<LibraryRoot, LibraryCommandError> {
        self.call(|reply| Command::Enable(id, enabled, reply))
    }

    pub fn remove_root(&self, id: String) -> Result<(), LibraryCommandError> {
        self.call(|reply| Command::Remove(id, reply))
    }

    pub fn delete_missing(&self) -> Result<u64, LibraryCommandError> {
        self.call(Command::DeleteMissing)
    }

    pub fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.call(Command::Start)
    }

    pub fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.call(Command::Cancel)
    }

    /// Stops the actor, its watchers and the scan in progress, and waits for them.
    pub fn shutdown(&self) {
        let _ = self.messages.send(Message::Shutdown);
        let thread = self.thread.lock().expect("sync thread lock").take();
        if let Some(thread) = thread {
            if thread.join().is_err() {
                log::error!("library.sync.actor_panicked");
            }
        }
    }
}

impl Drop for LibrarySync {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct Actor {
    database: Database,
    scan: Arc<Mutex<LibraryScanSnapshot>>,
    notify: Notifier,
    activity: Option<ApplicationActivityHandle>,
    /// For the inputs the watchers and the scanner thread send back.
    messages: Sender<Message>,
    cancel: Arc<AtomicBool>,
    state: State,
    watchers: HashMap<RootId, RecommendedWatcher>,
    scanner: Option<JoinHandle<()>>,
    /// Inputs the actor's own effects produced, processed before it waits again.
    queue: VecDeque<Input>,
}

impl Actor {
    fn run(mut self, receiver: Receiver<Message>) {
        let enabled = self
            .enabled_roots_or_log()
            .iter()
            .filter_map(root_id)
            .collect();
        self.feed(Input::Started { enabled });
        loop {
            let message = match self.state.next_wakeup() {
                Some(deadline) => {
                    match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    {
                        Ok(message) => Some(message),
                        Err(RecvTimeoutError::Timeout) => None,
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
                None => match receiver.recv() {
                    Ok(message) => Some(message),
                    Err(_) => break,
                },
            };
            match message {
                Some(Message::Shutdown) => break,
                Some(Message::Command(command)) => self.command(command),
                Some(Message::Input(input)) => self.feed(input),
                None => self.feed(Input::Tick),
            }
        }
        self.stop();
    }

    fn feed(&mut self, input: Input) {
        self.queue.push_back(input);
        while let Some(input) = self.queue.pop_front() {
            if matches!(input, Input::ScanFinished(_)) {
                self.reap_scanner();
            }
            for effect in self.state.step(input, Instant::now()) {
                self.execute(effect);
            }
        }
    }

    fn execute(&mut self, effect: Effect) {
        match effect {
            Effect::StartScan(targets) => self.start_scan(targets),
            Effect::CancelScan => self.cancel.store(true, Ordering::Release),
            Effect::RunGc => {
                let rescan = maintenance::collect_source_artwork(&self.database)
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                maintenance::spawn_thumbnail_backfill(&self.database);
                self.queue.push_back(Input::GcFinished { rescan });
            }
            Effect::SetActivity(activity) => self.set_activity(activity),
            Effect::Attach(id) => self.attach(id),
            Effect::Detach(id) => {
                self.watchers.remove(&id);
            }
        }
    }

    fn command(&mut self, command: Command) {
        match command {
            Command::Register(path, reply) => {
                let result = self.while_idle(|actor| roots::register(&actor.database, &path));
                if let Some(id) = result.as_ref().ok().and_then(root_id) {
                    self.feed(Input::Registered(id));
                }
                let _ = reply.send(result);
            }
            Command::Enable(id, enabled, reply) => {
                let result =
                    self.while_idle(|actor| roots::set_enabled(&actor.database, &id, enabled));
                if let Some(id) = result.as_ref().ok().and_then(root_id) {
                    self.feed(if enabled {
                        Input::Enabled(id)
                    } else {
                        Input::Disabled(id)
                    });
                }
                let _ = reply.send(result);
            }
            Command::Remove(id, reply) => {
                let result = self.while_idle(|actor| roots::remove(&actor.database, &id));
                if result.is_ok() {
                    if let Ok(id) = parse_id(&id) {
                        self.feed(Input::Removed(id));
                    }
                }
                let _ = reply.send(result);
            }
            Command::DeleteMissing(reply) => {
                let result = self.while_idle(|actor| roots::delete_missing(&actor.database));
                if result.is_ok() {
                    self.feed(Input::MissingDeleted);
                }
                let _ = reply.send(result);
            }
            Command::Start(reply) => {
                let result = if self.state.scanning() {
                    Err(LibraryCommandError::ScanAlreadyRunning)
                } else {
                    self.enabled_roots().and_then(|roots| {
                        if roots.is_empty() {
                            Err(LibraryCommandError::NoEnabledRoots)
                        } else {
                            Ok(roots.iter().filter_map(root_id).collect())
                        }
                    })
                };
                let result = result.map(|roots| self.feed(Input::ScanRequested { roots }));
                let _ = reply.send(result);
            }
            Command::Cancel(reply) => {
                let result = if self.state.scanning() {
                    self.feed(Input::CancelRequested);
                    Ok(())
                } else {
                    Err(LibraryCommandError::ScanNotRunning)
                };
                let _ = reply.send(result);
            }
        }
    }

    /// Folders cannot change under a running scan.
    fn while_idle<T>(
        &mut self,
        change: impl FnOnce(&mut Self) -> Result<T, LibraryCommandError>,
    ) -> Result<T, LibraryCommandError> {
        if self.state.scanning() {
            return Err(LibraryCommandError::ScanInProgress);
        }
        change(self)
    }

    fn enabled_roots(&self) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
        let connection = self.database.read().map_err(StoreError::from)?;
        Ok(roots::list(&connection)?
            .into_iter()
            .filter(|root| root.enabled)
            .collect())
    }

    /// For callers that carry on without folders: a failed read is logged, not mistaken for
    /// "no folders".
    fn enabled_roots_or_log(&self) -> Vec<LibraryRoot> {
        self.enabled_roots().unwrap_or_else(|error| {
            error!("library.roots.read_failed error={error:?}");
            Vec::new()
        })
    }

    fn start_scan(&mut self, targets: Vec<ScanTarget>) {
        let jobs: Vec<scanner::ScanJob> = self
            .enabled_roots_or_log()
            .into_iter()
            .filter_map(|root| {
                let id = root_id(&root)?;
                let target = targets.iter().find(|target| target.root == id)?;
                Some(scanner::ScanJob {
                    root,
                    dirs: target.dirs.clone(),
                })
            })
            .collect();
        if jobs.is_empty() {
            // Every folder that wanted a scan is gone: there is nothing to do.
            self.queue
                .push_back(Input::ScanFinished(ScanOutcome::Completed));
            return;
        }
        self.cancel.store(false, Ordering::Release);
        {
            let mut scan = self.scan.lock().expect("scan state lock");
            *scan = LibraryScanSnapshot {
                state: LibraryScanState::Running,
                finished_count: scan.finished_count,
                changed_count: scan.changed_count,
                ..LibraryScanSnapshot::idle()
            };
        }
        info!("library.scan.started root_count={}", jobs.len());
        self.notify.notify();
        let (database, scan, cancel, notify) = (
            self.database.clone(),
            self.scan.clone(),
            self.cancel.clone(),
            self.notify.clone(),
        );
        let messages = self.messages.clone();
        self.scanner = Some(thread::spawn(move || {
            let mut ending = ScanEnding::new(messages, scan.clone(), notify.clone());
            let outcome = scanner::run(database, jobs, scan, cancel, notify);
            ending.finish(match outcome {
                LibraryScanState::Completed => ScanOutcome::Completed,
                LibraryScanState::Cancelled => ScanOutcome::Cancelled,
                _ => ScanOutcome::Failed,
            });
        }));
    }

    fn reap_scanner(&mut self) {
        if let Some(scanner) = self.scanner.take() {
            if scanner.join().is_err() {
                log::error!("library.scan.worker_panicked");
            }
        }
    }

    fn attach(&mut self, id: RootId) {
        let path = self
            .enabled_roots_or_log()
            .into_iter()
            .find(|root| root_id(root) == Some(id))
            .map(|root| root.path);
        let messages = self.messages.clone();
        let attached = path.and_then(|path| {
            watcher::attach(std::path::Path::new(&path), move |paths| {
                let input = if paths.is_empty() {
                    Input::FolderChanged(id)
                } else {
                    Input::PathsChanged { root: id, paths }
                };
                let _ = messages.send(Message::Input(input));
            })
            .ok()
        });
        match attached {
            Some(watcher) => {
                self.watchers.insert(id, watcher);
                self.queue.push_back(Input::Attached(id));
            }
            None => {
                warn!("library.watcher.attach_failed root_id={id}");
                self.queue.push_back(Input::AttachFailed(id));
            }
        }
    }

    fn set_activity(&self, activity: Option<Activity>) {
        let Some(handle) = &self.activity else {
            return;
        };
        match activity {
            Some(activity) => handle.set(ApplicationActivity {
                id: LIBRARY_ACTIVITY_ID.into(),
                kind: ApplicationActivityKind::LibrarySync,
                state: match activity {
                    Activity::Running => ApplicationActivityState::Running,
                    Activity::AttentionRequired => ApplicationActivityState::AttentionRequired,
                },
            }),
            None => handle.clear(LIBRARY_ACTIVITY_ID),
        }
    }

    fn stop(&mut self) {
        self.cancel.store(true, Ordering::Release);
        self.reap_scanner();
        self.watchers.clear();
        if let Some(activity) = &self.activity {
            activity.clear(LIBRARY_ACTIVITY_ID);
        }
    }
}

/// Tells the actor how a scan thread ended. If the thread dies first, the scan ends as failed
/// when this drops, so the scan never stays "Running".
struct ScanEnding {
    messages: Sender<Message>,
    scan: Arc<Mutex<LibraryScanSnapshot>>,
    notify: Notifier,
    finished: bool,
}

impl ScanEnding {
    fn new(
        messages: Sender<Message>,
        scan: Arc<Mutex<LibraryScanSnapshot>>,
        notify: Notifier,
    ) -> Self {
        Self {
            messages,
            scan,
            notify,
            finished: false,
        }
    }

    fn finish(&mut self, outcome: ScanOutcome) {
        self.finished = true;
        let _ = self
            .messages
            .send(Message::Input(Input::ScanFinished(outcome)));
    }
}

impl Drop for ScanEnding {
    fn drop(&mut self) {
        if !self.finished {
            scanner::fail(&self.scan, &self.notify);
            let _ = self
                .messages
                .send(Message::Input(Input::ScanFinished(ScanOutcome::Failed)));
        }
    }
}

fn root_id(root: &LibraryRoot) -> Option<RootId> {
    parse_id(&root.id).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{null_event_sink, BackendEvent};

    #[test]
    fn a_scan_thread_that_dies_ends_the_scan_as_failed() {
        let (messages, received) = mpsc::channel();
        let scan = Arc::new(Mutex::new(LibraryScanSnapshot {
            state: LibraryScanState::Running,
            ..LibraryScanSnapshot::idle()
        }));
        let notify = Notifier::new(null_event_sink(), BackendEvent::LibraryScanChanged);
        let thread_scan = scan.clone();

        let died = thread::spawn(move || {
            let _ending = ScanEnding::new(messages, thread_scan, notify);
            panic!("scanner bug");
        })
        .join();

        assert!(died.is_err());
        let snapshot = scan.lock().unwrap_or_else(|p| p.into_inner()).clone();
        assert_eq!(snapshot.state, LibraryScanState::Failed);
        assert!(matches!(
            received.try_recv(),
            Ok(Message::Input(Input::ScanFinished(ScanOutcome::Failed)))
        ));
    }
}
