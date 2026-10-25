//! The write side of the Library: one actor that owns the directories, the file watchers and the
//! scanner thread. Everything that can change what the Library holds reaches it as an input on one
//! channel (a listener's command, a watcher seeing a change, the scanner finishing), and it blocks
//! on that channel until the next input or the next deadline its state asks for, so it never polls.
//!
//! The decisions are in `step.rs`; this file carries them out.

mod step;

use super::{
    LibraryCommandError, StoreError,
    database::Database,
    directories, maintenance,
    models::{LibraryDirectory, ScanState, ScanStatus},
    scanner, watcher,
};
use crate::errors::CommandError;
use crate::ids::DirectoryId;
use crate::messages::StateValue;
use crate::state_hub::StateHub;
use log::{debug, error, info, warn};
use notify::RecommendedWatcher;
use parking_lot::Mutex;
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender},
    },
    thread::{self, JoinHandle},
    time::Instant,
};
use step::{DirectoryNumber, Effect, Input, ScanOutcome, ScanTarget, State};

type Reply<T, E> = SyncSender<Result<T, E>>;

/// Answers a command, if its caller is still waiting. A caller that has gone away is logged, not
/// an error.
fn respond<T, E>(reply: &Reply<T, E>, result: Result<T, E>) {
    if reply.send(result).is_err() {
        debug!("library.reply_closed");
    }
}

enum Command {
    Register(String, Reply<LibraryDirectory, CommandError>),
    Enable(DirectoryId, bool, Reply<(), CommandError>),
    Remove(DirectoryId, Reply<(), CommandError>),
    DeleteMissing(Reply<u64, LibraryCommandError>),
    Start(Reply<(), LibraryCommandError>),
    Cancel(Reply<(), LibraryCommandError>),
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
    pub(crate) fn start(database: Database, hub: Arc<StateHub>) -> Self {
        let (messages, receiver) = mpsc::channel();
        let actor = Actor {
            database,
            hub,
            messages: messages.clone(),
            cancel: Arc::new(AtomicBool::new(false)),
            state: State::new(),
            watchers: HashMap::new(),
            scanner: None,
            queue: VecDeque::new(),
        };
        let thread = thread::Builder::new()
            .name("library-actor".into())
            .spawn(move || actor.run(&receiver))
            .expect("the OS starts a thread unless it is out of resources");
        Self {
            messages,
            thread: Mutex::new(Some(thread)),
        }
    }

    fn call<T, E: From<CommandError>>(
        &self,
        command: impl FnOnce(Reply<T, E>) -> Command,
    ) -> Result<T, E> {
        let (reply, answer) = mpsc::sync_channel(1);
        let task_failed = || E::from(CommandError::TaskFailed);
        self.messages
            .send(Message::Command(command(reply)))
            .inspect_err(|cause| log::warn!("library.sync.command_send_failed cause={cause}"))
            .map_err(|_| task_failed())?;
        answer
            .recv()
            .inspect_err(|cause| log::warn!("library.sync.reply_recv_failed cause={cause}"))
            .map_err(|_| task_failed())?
    }

    pub(crate) fn add_directory(&self, path: String) -> Result<LibraryDirectory, CommandError> {
        self.call(|reply| Command::Register(path, reply))
    }

    pub(crate) fn set_directory_enabled(
        &self,
        id: DirectoryId,
        enabled: bool,
    ) -> Result<(), CommandError> {
        self.call(|reply| Command::Enable(id, enabled, reply))
    }

    pub(crate) fn remove_directory(&self, id: DirectoryId) -> Result<(), CommandError> {
        self.call(|reply| Command::Remove(id, reply))
    }

    pub(crate) fn delete_missing(&self) -> Result<u64, LibraryCommandError> {
        self.call(Command::DeleteMissing)
    }

    pub(crate) fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.call(Command::Start)
    }

    pub(crate) fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.call(Command::Cancel)
    }

    /// Stops the actor, its watchers and the scan in progress, and waits for them.
    pub(crate) fn shutdown(&self) {
        if let Err(cause) = self.messages.send(Message::Shutdown) {
            log::debug!("library.sync.shutdown_send_failed cause={cause}");
        }
        let thread = self.thread.lock().take();
        if let Some(thread) = thread
            && thread.join().is_err()
        {
            log::error!("library.sync.actor_panicked");
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
    hub: Arc<StateHub>,
    /// For the inputs the watchers and the scanner thread send back.
    messages: Sender<Message>,
    cancel: Arc<AtomicBool>,
    state: State,
    watchers: HashMap<DirectoryNumber, RecommendedWatcher>,
    scanner: Option<JoinHandle<()>>,
    /// Inputs the actor's own effects produced, processed before it waits again.
    queue: VecDeque<Input>,
}

impl Actor {
    fn run(mut self, receiver: &Receiver<Message>) {
        let enabled = self
            .enabled_directories_or_log()
            .iter()
            .map(directory_number)
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
            Effect::StartScan(targets) => self.start_scan(&targets),
            Effect::CancelScan => self.cancel.store(true, Ordering::Release),
            Effect::RunGc => {
                let rescan = maintenance::collect_source_artwork(&self.database)
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                maintenance::spawn_thumbnail_backfill(&self.database);
                self.queue.push_back(Input::GcFinished { rescan });
            }
            Effect::Attach(id) => self.attach(id),
            Effect::Detach(id) => {
                self.watchers.remove(&id);
            }
        }
    }

    fn command(&mut self, command: Command) {
        match command {
            Command::Register(path, reply) => {
                let result = self.while_idle(|actor| directories::add(&actor.database, &path));
                if let Some(id) = result.as_ref().ok().map(directory_number) {
                    self.feed(Input::Registered(id));
                }
                respond(&reply, result);
            }
            Command::Enable(id, enabled, reply) => {
                let result =
                    self.while_idle(|actor| directories::set_enabled(&actor.database, id, enabled));
                if result.is_ok() {
                    self.feed(if enabled {
                        Input::Enabled(id.rowid())
                    } else {
                        Input::Disabled(id.rowid())
                    });
                }
                respond(&reply, result);
            }
            Command::Remove(id, reply) => {
                let result = self.while_idle(|actor| directories::remove(&actor.database, id));
                if result.is_ok() {
                    self.feed(Input::Removed(id.rowid()));
                }
                respond(&reply, result);
            }
            Command::DeleteMissing(reply) => {
                let result = self.while_idle(|actor| directories::delete_missing(&actor.database));
                if result.is_ok() {
                    self.feed(Input::MissingDeleted);
                }
                respond(&reply, result);
            }
            Command::Start(reply) => {
                let result = if self.state.scanning() {
                    Err(LibraryCommandError::ScanAlreadyRunning)
                } else {
                    self.enabled_directories().and_then(|directories| {
                        if directories.is_empty() {
                            Err(LibraryCommandError::NoEnabledDirectories)
                        } else {
                            Ok(directories.iter().map(directory_number).collect())
                        }
                    })
                };
                let result =
                    result.map(|directories| self.feed(Input::ScanRequested { directories }));
                respond(&reply, result);
            }
            Command::Cancel(reply) => {
                let result = if self.state.scanning() {
                    self.feed(Input::CancelRequested);
                    Ok(())
                } else {
                    Err(LibraryCommandError::ScanNotRunning)
                };
                respond(&reply, result);
            }
        }
    }

    /// Directories cannot change under a running scan.
    fn while_idle<T, E: From<LibraryCommandError>>(
        &mut self,
        change: impl FnOnce(&mut Self) -> Result<T, E>,
    ) -> Result<T, E> {
        if self.state.scanning() {
            return Err(E::from(LibraryCommandError::ScanInProgress));
        }
        change(self)
    }

    fn enabled_directories(&self) -> Result<Vec<LibraryDirectory>, LibraryCommandError> {
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

    fn start_scan(&mut self, targets: &[ScanTarget]) {
        let jobs: Vec<scanner::ScanJob> = self
            .enabled_directories_or_log()
            .into_iter()
            .filter_map(|directory| {
                let id = directory_number(&directory);
                let target = targets.iter().find(|target| target.directory == id)?;
                Some(scanner::ScanJob {
                    directory,
                    dirs: target.dirs.clone(),
                })
            })
            .collect();
        if jobs.is_empty() {
            // Every directory that wanted a scan is gone: there is nothing to do.
            self.queue
                .push_back(Input::ScanFinished(ScanOutcome::Completed));
            return;
        }
        self.cancel.store(false, Ordering::Release);
        let previous = self.hub.read(|published| published.scan.value.clone());
        self.hub.publish(StateValue::Scan(ScanState {
            state: ScanStatus::Running,
            finished_count: previous.finished_count,
            changed_count: previous.changed_count,
            ..ScanState::idle()
        }));
        info!("library.scan.started directory_count={}", jobs.len());
        let (database, hub, cancel) = (
            self.database.clone(),
            Arc::clone(&self.hub),
            Arc::clone(&self.cancel),
        );
        let messages = self.messages.clone();
        self.scanner = Some(
            thread::Builder::new()
                .name("library-scanner".into())
                .spawn(move || {
                    let mut ending = ScanEnding::new(messages, Arc::clone(&hub));
                    let outcome = scanner::run(&database, &jobs, &hub, &cancel);
                    ending.finish(match outcome {
                        ScanStatus::Completed => ScanOutcome::Completed,
                        ScanStatus::Cancelled => ScanOutcome::Cancelled,
                        _ => ScanOutcome::Failed,
                    });
                })
                .expect("the OS starts a thread unless it is out of resources"),
        );
    }

    fn reap_scanner(&mut self) {
        if let Some(scanner) = self.scanner.take()
            && scanner.join().is_err()
        {
            log::error!("library.scan.worker_panicked");
        }
    }

    fn attach(&mut self, id: DirectoryNumber) {
        let path = self
            .enabled_directories_or_log()
            .into_iter()
            .find(|directory| directory_number(directory) == id)
            .map(|directory| directory.path);
        let messages = self.messages.clone();
        let attached = path.and_then(|path| {
            watcher::attach(std::path::Path::new(&path), move |paths| {
                let input = if paths.is_empty() {
                    Input::DirectoryChanged(id)
                } else {
                    Input::PathsChanged {
                        directory: id,
                        paths,
                    }
                };
                if let Err(cause) = messages.send(Message::Input(input)) {
                    log::debug!("library.watcher.input_send_failed cause={cause}");
                }
            })
            .ok()
        });
        if let Some(watcher) = attached {
            self.watchers.insert(id, watcher);
            self.queue.push_back(Input::Attached(id));
        } else {
            warn!("library.watcher.attach_failed directory_id={id}");
            self.queue.push_back(Input::AttachFailed(id));
        }
    }

    fn stop(&mut self) {
        self.cancel.store(true, Ordering::Release);
        self.reap_scanner();
        self.watchers.clear();
    }
}

/// Tells the actor how a scan thread ended. If the thread dies first, the scan ends as failed
/// when this drops, so the scan never stays "Running".
struct ScanEnding {
    messages: Sender<Message>,
    hub: Arc<StateHub>,
    finished: bool,
}

impl ScanEnding {
    fn new(messages: Sender<Message>, hub: Arc<StateHub>) -> Self {
        Self {
            messages,
            hub,
            finished: false,
        }
    }

    fn finish(&mut self, outcome: ScanOutcome) {
        self.finished = true;
        report_scan_finished(&self.messages, outcome);
    }
}

/// Sends the scan's end to the actor. The actor may already be gone, which is logged.
fn report_scan_finished(messages: &Sender<Message>, outcome: ScanOutcome) {
    if let Err(cause) = messages.send(Message::Input(Input::ScanFinished(outcome))) {
        log::debug!("library.sync.scan_finished_send_failed cause={cause}");
    }
}

impl Drop for ScanEnding {
    fn drop(&mut self) {
        if !self.finished {
            scanner::fail(&self.hub);
            report_scan_finished(&self.messages, ScanOutcome::Failed);
        }
    }
}

fn directory_number(directory: &LibraryDirectory) -> DirectoryNumber {
    directory.id.rowid()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::StateValue;
    use crate::settings::Settings;
    use crate::state_hub::{Published, StateHub};
    use crate::test_support::null_message_listener;

    #[test]
    fn a_scan_thread_that_dies_ends_the_scan_as_failed() {
        let (messages, received) = mpsc::channel();
        let hub = Arc::new(StateHub::new(
            Published::initial(&Settings::default()),
            null_message_listener(),
        ));
        hub.publish(StateValue::Scan(ScanState {
            state: ScanStatus::Running,
            ..ScanState::idle()
        }));
        let thread_hub = Arc::clone(&hub);

        let died = thread::Builder::new()
            .name("scanner-bug-test".into())
            .spawn(move || {
                let _ending = ScanEnding::new(messages, thread_hub);
                panic!("scanner bug");
            })
            .unwrap()
            .join();

        assert!(died.is_err());
        let snapshot = hub.read(|published| published.scan.clone());
        assert_eq!(snapshot.value.state, ScanStatus::Failed);
        assert!(matches!(
            received.try_recv(),
            Ok(Message::Input(Input::ScanFinished(ScanOutcome::Failed)))
        ));
    }
}
