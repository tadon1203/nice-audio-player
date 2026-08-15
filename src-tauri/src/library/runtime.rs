use super::{models::LibraryScanState, service::LibraryShared, watcher};
use crate::activity::{
    ApplicationActivity, ApplicationActivityHandle, ApplicationActivityKind,
    ApplicationActivityState,
};
use notify::RecommendedWatcher;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const LIBRARY_ACTIVITY_ID: &str = "library-sync";
const WATCH_RETRY: Duration = Duration::from_secs(10);

enum Command {
    Register(
        String,
        SyncSender<Result<super::models::LibraryRoot, super::service::LibraryCommandError>>,
    ),
    Enable(
        String,
        bool,
        SyncSender<Result<super::models::LibraryRoot, super::service::LibraryCommandError>>,
    ),
    Remove(
        String,
        SyncSender<Result<(), super::service::LibraryCommandError>>,
    ),
    Start(SyncSender<Result<(), super::service::LibraryCommandError>>),
    Cancel(SyncSender<Result<(), super::service::LibraryCommandError>>),
}

#[derive(Clone)]
pub(crate) struct LibraryRuntimeHandle {
    commands: SyncSender<Command>,
}

impl LibraryRuntimeHandle {
    fn call<T>(
        &self,
        command: Command,
        receiver: Receiver<Result<T, super::service::LibraryCommandError>>,
    ) -> Result<T, super::service::LibraryCommandError> {
        self.commands
            .send(command)
            .map_err(|_| super::service::LibraryCommandError::TaskFailed)?;
        receiver
            .recv()
            .map_err(|_| super::service::LibraryCommandError::TaskFailed)?
    }
    pub fn register_root(
        &self,
        input: String,
    ) -> Result<super::models::LibraryRoot, super::service::LibraryCommandError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.call(Command::Register(input, tx), rx)
    }
    pub fn set_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> Result<super::models::LibraryRoot, super::service::LibraryCommandError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.call(Command::Enable(id, enabled, tx), rx)
    }
    pub fn remove_root(&self, id: String) -> Result<(), super::service::LibraryCommandError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.call(Command::Remove(id, tx), rx)
    }
    pub fn start_scan(&self) -> Result<(), super::service::LibraryCommandError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.call(Command::Start(tx), rx)
    }
    pub fn cancel_scan(&self) -> Result<(), super::service::LibraryCommandError> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.call(Command::Cancel(tx), rx)
    }
}

pub struct LibraryRuntime {
    stop: Arc<AtomicBool>,
    commands: SyncSender<Command>,
    wake: SyncSender<()>,
    thread: Option<JoinHandle<()>>,
}

impl LibraryRuntime {
    pub fn start(shared: LibraryShared, activity: Option<ApplicationActivityHandle>) -> Self {
        let (commands, command_receiver) = mpsc::sync_channel(16);
        let (wake, wake_receiver) = mpsc::sync_channel(1);
        let stop = Arc::new(AtomicBool::new(false));
        let thread = thread::spawn({
            let stop = stop.clone();
            let signal = wake.clone();
            move || {
                run(
                    shared,
                    activity,
                    command_receiver,
                    wake_receiver,
                    signal,
                    stop,
                )
            }
        });
        Self {
            stop,
            commands,
            wake,
            thread: Some(thread),
        }
    }
    pub fn handle(&self) -> LibraryRuntimeHandle {
        LibraryRuntimeHandle {
            commands: self.commands.clone(),
        }
    }
    pub fn shutdown(
        &mut self,
        shared: &LibraryShared,
        activity: Option<&ApplicationActivityHandle>,
    ) {
        self.stop.store(true, Ordering::Release);
        let _ = self.wake.try_send(());
        shared.shutdown();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        if let Some(activity) = activity {
            activity.clear(LIBRARY_ACTIVITY_ID);
        }
    }
}

struct Retry {
    next_attempt: Instant,
    failed_once: bool,
}

fn run(
    shared: LibraryShared,
    activity: Option<ApplicationActivityHandle>,
    commands: Receiver<Command>,
    wake: Receiver<()>,
    signal: SyncSender<()>,
    stop: Arc<AtomicBool>,
) {
    let dirty = Arc::new(Mutex::new(HashSet::<String>::new()));
    dirty.lock().expect("dirty roots").extend(
        shared
            .roots()
            .unwrap_or_default()
            .into_iter()
            .filter(|root| root.enabled)
            .map(|root| root.id),
    );
    let mut watchers: HashMap<String, RecommendedWatcher> = HashMap::new();
    let mut retries: HashMap<String, Retry> = HashMap::new();
    let mut watcher_attention = HashSet::new();
    let mut debounce = Some(Instant::now() + Duration::from_millis(500));
    let mut was_running = false;
    let mut gc_pending = true;
    let mut manual_cancelled = false;
    loop {
        if stop.load(Ordering::Acquire) {
            break;
        }
        refresh_watchers(
            &shared,
            &mut watchers,
            &mut retries,
            &mut watcher_attention,
            &dirty,
            &signal,
        );
        if !watcher_attention.is_empty() {
            set_attention(&activity);
        }
        let timeout = debounce
            .map(|d| d.saturating_duration_since(Instant::now()))
            .unwrap_or(Duration::from_millis(100))
            .min(Duration::from_millis(100));
        if let Ok(command) = commands.recv_timeout(timeout) {
            handle_command(
                command,
                &shared,
                &dirty,
                &mut debounce,
                &mut gc_pending,
                &mut manual_cancelled,
                &activity,
            );
        }
        let _ = wake.try_recv();
        let running = matches!(shared.scan_state().state, LibraryScanState::Running);
        if running && !was_running {
            if watcher_attention.is_empty() {
                set_running(&activity);
            } else {
                set_attention(&activity);
            }
        }
        if !running && was_running {
            let terminal = shared.scan_state().state;
            if matches!(&terminal, LibraryScanState::Completed) {
                gc_pending = true;
            }
            if matches!(&terminal, LibraryScanState::Failed) {
                set_attention(&activity);
            } else if !matches!(&terminal, LibraryScanState::Cancelled)
                && watcher_attention.is_empty()
            {
                clear_activity(&activity);
            }
            if matches!(&terminal, LibraryScanState::Cancelled) || manual_cancelled {
                dirty.lock().expect("dirty roots").clear();
                debounce = None;
                manual_cancelled = false;
            } else if !dirty.lock().expect("dirty roots").is_empty() {
                debounce = Some(Instant::now());
            }
        }
        was_running = running;
        if !running {
            let targets = if debounce.is_some_and(|d| d <= Instant::now()) {
                take_dirty_roots(&shared, &dirty)
            } else {
                Vec::new()
            };
            if !targets.is_empty() {
                debounce = None;
                if shared.start_scan_targets(targets).is_ok() {
                    set_running(&activity);
                }
            } else if gc_pending
                && debounce.is_none()
                && dirty.lock().expect("dirty roots").is_empty()
            {
                let retry_roots = shared.run_artwork_maintenance();
                gc_pending = false;
                if !retry_roots.is_empty() {
                    dirty
                        .lock()
                        .expect("dirty roots")
                        .extend(retry_roots.into_iter().map(|id| id.to_string()));
                    debounce = Some(Instant::now());
                }
            }
        }
    }
    watchers.clear();
}

fn handle_command(
    command: Command,
    shared: &LibraryShared,
    dirty: &Arc<Mutex<HashSet<String>>>,
    debounce: &mut Option<Instant>,
    gc_pending: &mut bool,
    cancelled: &mut bool,
    activity: &Option<ApplicationActivityHandle>,
) {
    match command {
        Command::Register(input, reply) => {
            let result = shared.register_root(input);
            if let Ok(root) = &result {
                dirty.lock().expect("dirty roots").insert(root.id.clone());
                *debounce = Some(Instant::now());
            }
            let _ = reply.send(result);
        }
        Command::Enable(id, enabled, reply) => {
            let result = shared.set_root_enabled(id.clone(), enabled);
            if result.is_ok() {
                if enabled {
                    dirty.lock().expect("dirty roots").insert(id);
                    *debounce = Some(Instant::now());
                } else {
                    dirty.lock().expect("dirty roots").remove(&id);
                }
            }
            let _ = reply.send(result);
        }
        Command::Remove(id, reply) => {
            let result = shared.remove_root(id.clone());
            if result.is_ok() {
                dirty.lock().expect("dirty roots").remove(&id);
                *gc_pending = true;
            }
            let _ = reply.send(result);
        }
        Command::Start(reply) => {
            if matches!(shared.scan_state().state, LibraryScanState::Running) {
                let _ = reply.send(Err(super::service::LibraryCommandError::ScanAlreadyRunning));
                return;
            }
            let roots: Result<
                Vec<super::models::LibraryRoot>,
                super::service::LibraryCommandError,
            > = shared
                .roots()
                .map(|r| r.into_iter().filter(|r| r.enabled).collect());
            let result = roots.and_then(|roots| {
                if roots.is_empty() {
                    Err(super::service::LibraryCommandError::NoEnabledRoots)
                } else {
                    dirty.lock().expect("dirty roots").clear();
                    *debounce = None;
                    shared.start_scan_targets(roots)
                }
            });
            if result.is_ok() {
                set_running(activity);
            }
            let _ = reply.send(result);
        }
        Command::Cancel(reply) => {
            let result = shared.cancel_scan();
            if result.is_ok() {
                *cancelled = true;
                dirty.lock().expect("dirty roots").clear();
                *debounce = None;
            }
            let _ = reply.send(result);
        }
    }
}

fn take_dirty_roots(
    shared: &LibraryShared,
    dirty: &Arc<Mutex<HashSet<String>>>,
) -> Vec<super::models::LibraryRoot> {
    let ids = std::mem::take(&mut *dirty.lock().expect("dirty roots"));
    shared
        .roots()
        .unwrap_or_default()
        .into_iter()
        .filter(|root| root.enabled && ids.contains(&root.id))
        .collect()
}

fn refresh_watchers(
    shared: &LibraryShared,
    watchers: &mut HashMap<String, RecommendedWatcher>,
    retries: &mut HashMap<String, Retry>,
    attention: &mut HashSet<String>,
    dirty: &Arc<Mutex<HashSet<String>>>,
    signal: &SyncSender<()>,
) {
    let enabled: HashMap<_, _> = shared
        .roots()
        .unwrap_or_default()
        .into_iter()
        .filter(|r| r.enabled)
        .map(|r| (r.id, PathBuf::from(r.path)))
        .collect();
    watchers.retain(|id, _| enabled.contains_key(id));
    retries.retain(|id, _| enabled.contains_key(id));
    attention.retain(|id| enabled.contains_key(id));
    for (id, path) in enabled {
        if watchers.contains_key(&id)
            || retries
                .get(&id)
                .is_some_and(|retry| retry.next_attempt > Instant::now())
        {
            continue;
        }
        let dirty_clone = dirty.clone();
        let signal_clone = signal.clone();
        let id_clone = id.clone();
        match watcher::attach(&path, move || {
            dirty_clone
                .lock()
                .expect("dirty roots")
                .insert(id_clone.clone());
            let _ = signal_clone.try_send(());
        }) {
            Ok(watcher) => {
                let was_retry = retries.remove(&id).is_some();
                watchers.insert(id.clone(), watcher);
                if was_retry {
                    dirty.lock().expect("dirty roots").insert(id);
                    let _ = signal.try_send(());
                }
            }
            Err(_) => {
                let failed_once = retries.get(&id).is_some_and(|retry| retry.failed_once);
                retries.insert(
                    id.clone(),
                    Retry {
                        next_attempt: Instant::now() + WATCH_RETRY,
                        failed_once: true,
                    },
                );
                if failed_once {
                    attention.insert(id);
                }
            }
        }
    }
}

fn set_running(activity: &Option<ApplicationActivityHandle>) {
    if let Some(activity) = activity {
        activity.set(ApplicationActivity {
            id: LIBRARY_ACTIVITY_ID.into(),
            kind: ApplicationActivityKind::LibrarySync,
            state: ApplicationActivityState::Running,
        });
    }
}
fn set_attention(activity: &Option<ApplicationActivityHandle>) {
    if let Some(activity) = activity {
        activity.set(ApplicationActivity {
            id: LIBRARY_ACTIVITY_ID.into(),
            kind: ApplicationActivityKind::LibrarySync,
            state: ApplicationActivityState::AttentionRequired,
        });
    }
}
fn clear_activity(activity: &Option<ApplicationActivityHandle>) {
    if let Some(activity) = activity {
        activity.clear(LIBRARY_ACTIVITY_ID);
    }
}

