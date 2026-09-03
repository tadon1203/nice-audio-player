use super::artwork;
use super::policy::effective_track_title;
use super::runtime::LibraryRuntime;
use super::{database::Database, models::*};
use crate::activity::ApplicationActivityHandle;
use crate::lyrics::model::LyricsTrackContext;
use crate::media::{
    inspection::inspect_audio_file_internal,
    metadata::read_source_metadata,
    validation::{is_supported_extension, validate_audio_file, ValidatedAudioFile},
};
use log::{error, info};
use rusqlite::{params, OptionalExtension, Row};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum LibraryCommandError {
    InvalidRoot,
    RootNotFound,
    RootNotDirectory,
    CanonicalizationFailed,
    DuplicateRoot,
    OverlappingRoot,
    ScanInProgress,
    InvalidId,
    AlbumNotFound,
    InvalidCursor,
    InvalidAlbumKey,
    InvalidAlbumArtistKey,
    AlbumArtistNotFound,
    RootMissing,
    ScanAlreadyRunning,
    NoEnabledRoots,
    ScanNotRunning,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}

pub struct ResolvedPlaybackEntry {
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub duration_ms: Option<u64>,
}
type PlayableEntryRow = (
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<i64>,
);

// Kept separate from IPC errors so storage errors never expose SQLite implementation details.
#[derive(Clone)]
pub struct LibraryShared {
    database: Option<Database>,
    status: LibraryStatus,
    state: Arc<Mutex<LibraryScanSnapshot>>,
    cancel: Arc<AtomicBool>,
    worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    notify: std::sync::mpsc::SyncSender<()>,
    receiver: Arc<Mutex<Option<std::sync::mpsc::Receiver<()>>>>,
}
impl LibraryShared {
    fn join_scan_worker(worker: JoinHandle<()>) {
        if worker.join().is_err() {
            log::error!("library.scan.worker_panicked");
        }
    }

    pub fn initialize(directory: PathBuf) -> Self {
        let (notify, receiver) = std::sync::mpsc::sync_channel(1);
        match Database::initialize(&directory) {
            Ok(database) => Self::ready(database),
            Err(error) => {
                let reason = match error {
                    super::database::DatabaseError::Corrupt => {
                        LibraryUnavailableReason::DatabaseCorrupt
                    }
                    super::database::DatabaseError::Migration(
                        super::migrations::MigrationError::SchemaTooNew,
                    ) => LibraryUnavailableReason::SchemaTooNew,
                    super::database::DatabaseError::Migration(_) => {
                        LibraryUnavailableReason::MigrationFailed
                    }
                    _ => LibraryUnavailableReason::DatabaseOpenFailed,
                };
                error!("library.database.unavailable reason={:?}", reason);
                Self {
                    database: None,
                    status: LibraryStatus::Unavailable { reason },
                    state: Arc::new(Mutex::new(idle())),
                    cancel: Arc::new(AtomicBool::new(false)),
                    worker: Arc::new(Mutex::new(None)),
                    notify,
                    receiver: Arc::new(Mutex::new(Some(receiver))),
                }
            }
        }
    }
    fn ready(database: Database) -> Self {
        let (notify, receiver) = std::sync::mpsc::sync_channel(1);
        Self {
            database: Some(database),
            status: LibraryStatus::Ready,
            state: Arc::new(Mutex::new(idle())),
            cancel: Arc::new(AtomicBool::new(false)),
            worker: Arc::new(Mutex::new(None)),
            notify,
            receiver: Arc::new(Mutex::new(Some(receiver))),
        }
    }
    pub fn status(&self) -> LibraryStatus {
        self.status.clone()
    }
    pub fn take_scan_state_changed_receiver(&self) -> Option<std::sync::mpsc::Receiver<()>> {
        self.receiver.lock().expect("scan receiver lock").take()
    }
    fn notify(&self) {
        let _ = self.notify.try_send(());
    }
    pub(crate) fn db(&self) -> Result<&Database, LibraryCommandError> {
        self.database
            .as_ref()
            .ok_or(LibraryCommandError::LibraryUnavailable)
    }
    pub(crate) fn run_artwork_maintenance(&self) -> Vec<i64> {
        if let Some(database) = &self.database {
            return super::maintenance::collect_source_artwork(database).unwrap_or_default();
        }
        Vec::new()
    }
    pub fn roots(&self) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut s=c.prepare("SELECT id,path,enabled,scan_generation,last_successful_scan_at_ms FROM library_roots ORDER BY id").map_err(|_|LibraryCommandError::PersistenceFailed)?;
        let rows = s
            .query_map([], |r| {
                Ok(LibraryRoot {
                    id: r.get::<_, i64>(0)?.to_string(),
                    path: r.get(1)?,
                    enabled: r.get(2)?,
                    scan_generation: r.get::<_, i64>(3)? as u64,
                    last_successful_scan_at_ms: r.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                })
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)
    }
    pub fn register_root(&self, input: String) -> Result<LibraryRoot, LibraryCommandError> {
        if scanning(&self.state) {
            return Err(LibraryCommandError::ScanInProgress);
        };
        if input.trim().is_empty() {
            return Err(LibraryCommandError::InvalidRoot);
        };
        let p =
            dunce::canonicalize(&input).map_err(|_| LibraryCommandError::CanonicalizationFailed)?;
        if !p.is_dir() {
            return Err(LibraryCommandError::RootNotDirectory);
        };
        let path = p
            .to_str()
            .ok_or(LibraryCommandError::CanonicalizationFailed)?
            .to_owned();
        let roots = self.roots()?;
        for r in &roots {
            let other = Path::new(&r.path);
            if other == p || p.starts_with(other) || other.starts_with(&p) {
                return Err(if other == p {
                    LibraryCommandError::DuplicateRoot
                } else {
                    LibraryCommandError::OverlappingRoot
                });
            }
        }
        let now = now();
        let c = self
            .db()?
            .write()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        c.execute("INSERT INTO library_roots(path,enabled,scan_generation,created_at_ms,updated_at_ms) VALUES(?1,1,0,?2,?2)",params![path,now]).map_err(|_|LibraryCommandError::PersistenceFailed)?;
        let id = c.last_insert_rowid();
        Ok(LibraryRoot {
            id: id.to_string(),
            path,
            enabled: true,
            scan_generation: 0,
            last_successful_scan_at_ms: None,
        })
    }
    pub fn set_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> Result<LibraryRoot, LibraryCommandError> {
        if scanning(&self.state) {
            return Err(LibraryCommandError::ScanInProgress);
        };
        let id = parse_id(&id)?;
        let c = self
            .db()?
            .write()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        if c.execute(
            "UPDATE library_roots SET enabled=?2,updated_at_ms=?3 WHERE id=?1",
            params![id, enabled, now()],
        )
        .map_err(|_| LibraryCommandError::PersistenceFailed)?
            == 0
        {
            return Err(LibraryCommandError::RootMissing);
        };
        drop(c);
        self.roots()?
            .into_iter()
            .find(|r| r.id == id.to_string())
            .ok_or(LibraryCommandError::RootMissing)
    }
    pub fn scan_state(&self) -> LibraryScanSnapshot {
        self.state.lock().expect("scan state lock").clone()
    }
    pub fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        if !scanning(&self.state) {
            return Err(LibraryCommandError::ScanNotRunning);
        };
        self.cancel.store(true, Ordering::Release);
        Ok(())
    }
    pub fn tracks(
        &self,
        after: Option<String>,
        search: Option<String>,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        self.catalog_tracks(after, search)
    }
    pub fn remove_root(&self, id: String) -> Result<(), LibraryCommandError> {
        if scanning(&self.state) {
            return Err(LibraryCommandError::ScanInProgress);
        }
        let id = parse_id(&id)?;
        let mut c = self
            .db()?
            .write()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let tx = c
            .transaction()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let exists: Option<i64> = tx
            .query_row(
                "SELECT id FROM library_roots WHERE id=?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        if exists.is_none() {
            return Err(LibraryCommandError::RootMissing);
        }
        tx.execute("DELETE FROM track_source_metadata WHERE track_id IN (SELECT t.id FROM tracks t JOIN library_files f ON f.id=t.file_id WHERE f.root_id=?1)", params![id]).map_err(|_| LibraryCommandError::PersistenceFailed)?;
        tx.execute(
            "DELETE FROM tracks WHERE file_id IN (SELECT id FROM library_files WHERE root_id=?1)",
            params![id],
        )
        .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        tx.execute("DELETE FROM library_files WHERE root_id=?1", params![id])
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        tx.execute("DELETE FROM library_roots WHERE id=?1", params![id])
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        tx.commit()
            .map_err(|_| LibraryCommandError::PersistenceFailed)
    }
    pub fn track_for_path(
        &self,
        path: String,
    ) -> Result<Option<LibraryTrackSummary>, LibraryCommandError> {
        if path.trim().is_empty() {
            return Err(LibraryCommandError::RootNotFound);
        }
        let canonical = dunce::canonicalize(path).map_err(|_| LibraryCommandError::RootNotFound)?;
        let root = self.roots()?.into_iter().find_map(|root| {
            let root_path = Path::new(&root.path);
            canonical
                .strip_prefix(root_path)
                .ok()
                .map(|relative| (root, relative.to_path_buf()))
        });
        let Some((root, relative)) = root else {
            return Ok(None);
        };
        if relative.as_os_str().is_empty() {
            return Ok(None);
        }
        let relative_path = relative
            .to_str()
            .ok_or(LibraryCommandError::RootNotFound)?
            .replace('\\', "/");
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        c.query_row("SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.album,m.album_artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status FROM tracks t JOIN library_files f ON f.id=t.file_id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored' WHERE f.root_id=?1 AND f.relative_path=?2", params![parse_id(&root.id)?, relative_path], summary_from_row).optional().map_err(|_|LibraryCommandError::PersistenceFailed)
    }
    pub fn playable_entry(
        &self,
        id: String,
    ) -> Result<ResolvedPlaybackEntry, StartLibraryTrackError> {
        let numeric_id = parse_id(&id).map_err(|_| StartLibraryTrackError::InvalidId)?;
        let c = self
            .db()
            .map_err(|_| StartLibraryTrackError::LibraryUnavailable)?
            .read()
            .map_err(|_| StartLibraryTrackError::PersistenceFailed)?;
        let row: Option<PlayableEntryRow> = c.query_row(
            "SELECT r.path,f.relative_path,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.duration_ms FROM tracks t JOIN library_files f ON f.id=t.file_id JOIN library_roots r ON r.id=f.root_id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision WHERE t.id=?1",
            params![numeric_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?))
        ).optional().map_err(|_| StartLibraryTrackError::PersistenceFailed)?;
        let Some((root, relative, file_name, availability, inspection, title, artist, duration_ms)) =
            row
        else {
            return Err(StartLibraryTrackError::TrackNotFound);
        };
        if availability == "missing" {
            return Err(StartLibraryTrackError::TrackUnavailable);
        }
        if inspection != "indexed" {
            return Err(StartLibraryTrackError::TrackNotPlayable);
        }
        let file = validate_audio_file(Path::new(&root).join(relative).to_string_lossy().as_ref())
            .map_err(|_| StartLibraryTrackError::TrackUnavailable)?;
        Ok(ResolvedPlaybackEntry {
            file,
            title: effective_track_title(title.as_deref(), &file_name),
            artist: artist.filter(|value| !value.trim().is_empty()),
            duration_ms: duration_ms.map(|value| value as u64),
        })
    }
    pub fn lyrics_context(&self, id: String) -> Result<LyricsTrackContext, LibraryCommandError> {
        let numeric_id = parse_id(&id).map_err(|_| LibraryCommandError::InvalidId)?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let row: Option<(String, String, String)> = c.query_row("SELECT r.path,f.relative_path,f.availability FROM tracks t JOIN library_files f ON f.id=t.file_id JOIN library_roots r ON r.id=f.root_id WHERE t.id=?1", params![numeric_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).optional().map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((root, relative, availability)) = row else {
            return Err(LibraryCommandError::RootNotFound);
        };
        if availability != "available" {
            return Err(LibraryCommandError::RootMissing);
        }
        let root = dunce::canonicalize(root).map_err(|_| LibraryCommandError::RootMissing)?;
        let source = dunce::canonicalize(root.join(relative))
            .map_err(|_| LibraryCommandError::RootMissing)?;
        if !source.starts_with(&root) {
            return Err(LibraryCommandError::RootMissing);
        }
        Ok(LyricsTrackContext {
            track_id: id,
            source,
            root,
        })
    }
    pub(crate) fn start_scan_targets(
        &self,
        roots: Vec<LibraryRoot>,
    ) -> Result<(), LibraryCommandError> {
        if scanning(&self.state) {
            return Err(LibraryCommandError::ScanAlreadyRunning);
        }
        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            if worker.is_finished() {
                Self::join_scan_worker(worker);
            } else {
                *self.worker.lock().expect("worker lock") = Some(worker);
                return Err(LibraryCommandError::ScanAlreadyRunning);
            }
        }
        if roots.is_empty() {
            return Err(LibraryCommandError::NoEnabledRoots);
        };
        self.cancel.store(false, Ordering::Release);
        *self.state.lock().expect("scan state lock") = LibraryScanSnapshot {
            state: LibraryScanState::Running,
            current_root: None,
            discovered_count: 0,
            inspected_count: 0,
            indexed_count: 0,
            failed_count: 0,
            failure_code: None,
        };
        info!("library.scan.started root_count={}", roots.len());
        self.notify();
        let db = self.db()?.clone();
        let state = self.state.clone();
        let cancel = self.cancel.clone();
        let notify = self.notify.clone();
        *self.worker.lock().expect("worker lock") = Some(thread::spawn(move || {
            scan(db, roots, state, cancel, notify)
        }));
        Ok(())
    }
    pub fn start_scan(&self) -> Result<(), LibraryCommandError> {
        let roots: Vec<_> = self.roots()?.into_iter().filter(|r| r.enabled).collect();
        self.start_scan_targets(roots)
    }
    pub fn shutdown(&self) {
        self.cancel.store(true, Ordering::Release);
        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            Self::join_scan_worker(worker);
        }
    }
}
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum StartLibraryTrackError {
    InvalidId,
    TrackNotFound,
    TrackUnavailable,
    TrackNotPlayable,
    LibraryUnavailable,
    PersistenceFailed,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum StartLibraryAlbumError {
    InvalidAlbumKey,
    AlbumNotFound,
    NoPlayableTracks,
    SourceUnavailable,
    LibraryUnavailable,
    PersistenceFailed,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum StartLibraryAlbumTrackError {
    InvalidAlbumKey,
    InvalidTrackId,
    AlbumNotFound,
    TrackNotMember,
    TrackUnavailable,
    TrackNotPlayable,
    NoPlayableTracks,
    SourceUnavailable,
    LibraryUnavailable,
    PersistenceFailed,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}
/// The Tauri-managed owner. Only this type owns scanner shutdown.
pub struct LibraryService {
    shared: LibraryShared,
    runtime: Mutex<Option<LibraryRuntime>>,
    activity: Option<ApplicationActivityHandle>,
}

/// A command-safe view of the library. Dropping it has no lifecycle effect.
#[derive(Clone)]
pub struct LibraryServiceHandle {
    shared: LibraryShared,
    runtime: Option<super::runtime::LibraryRuntimeHandle>,
}

impl std::ops::Deref for LibraryServiceHandle {
    type Target = LibraryShared;
    fn deref(&self) -> &Self::Target {
        &self.shared
    }
}

impl LibraryServiceHandle {
    pub fn register_root(&self, input: String) -> Result<LibraryRoot, LibraryCommandError> {
        if let Some(runtime) = &self.runtime {
            runtime.register_root(input)
        } else {
            self.shared.register_root(input)
        }
    }
    pub fn set_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> Result<LibraryRoot, LibraryCommandError> {
        if let Some(runtime) = &self.runtime {
            runtime.set_root_enabled(id, enabled)
        } else {
            self.shared.set_root_enabled(id, enabled)
        }
    }
    pub fn remove_root(&self, id: String) -> Result<(), LibraryCommandError> {
        if let Some(runtime) = &self.runtime {
            runtime.remove_root(id)
        } else {
            self.shared.remove_root(id)
        }
    }
    pub fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.runtime
            .as_ref()
            .map_or_else(|| self.shared.start_scan(), |runtime| runtime.start_scan())
    }
    pub fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.runtime.as_ref().map_or_else(
            || self.shared.cancel_scan(),
            |runtime| runtime.cancel_scan(),
        )
    }
}

impl LibraryService {
    pub fn initialize_with_activity(
        directory: PathBuf,
        activity: Option<ApplicationActivityHandle>,
    ) -> Self {
        let shared = LibraryShared::initialize(directory);
        let runtime = if matches!(shared.status(), LibraryStatus::Ready) {
            Some(LibraryRuntime::start(shared.clone(), activity.clone()))
        } else {
            None
        };
        Self {
            shared,
            runtime: Mutex::new(runtime),
            activity,
        }
    }
    pub fn handle(&self) -> LibraryServiceHandle {
        LibraryServiceHandle {
            shared: self.shared.clone(),
            runtime: self
                .runtime
                .lock()
                .expect("library runtime lock")
                .as_ref()
                .map(|runtime| runtime.handle()),
        }
    }
    pub fn status(&self) -> LibraryStatus {
        self.shared.status()
    }
    pub fn shutdown(&self) {
        if let Some(runtime) = self.runtime.lock().expect("library runtime lock").as_mut() {
            runtime.shutdown(&self.shared, self.activity.as_ref());
        } else {
            self.shared.shutdown();
        }
    }
    pub fn take_scan_state_changed_receiver(&self) -> Option<std::sync::mpsc::Receiver<()>> {
        self.shared.take_scan_state_changed_receiver()
    }
}

impl Drop for LibraryService {
    fn drop(&mut self) {
        self.shutdown();
    }
}
macro_rules! require_persistence {
    ($result:expr, $state:expr, $notify:expr) => {
        if ($result).is_err() {
            finish(
                &$state,
                LibraryScanState::Failed,
                Some("persistenceFailed".into()),
                &$notify,
            );
            return;
        }
    };
}
fn scan(
    db: Database,
    roots: Vec<LibraryRoot>,
    state: Arc<Mutex<LibraryScanSnapshot>>,
    cancel: Arc<AtomicBool>,
    notify: std::sync::mpsc::SyncSender<()>,
) {
    let mut progress = ProgressPublisher::new(&notify);
    let mut traversal_failed = false;
    for root in roots {
        if cancel.load(Ordering::Acquire) {
            finish(&state, LibraryScanState::Cancelled, None, &notify);
            return;
        }
        state.lock().expect("scan state lock").current_root = Some(root.clone());
        let _ = notify.try_send(());
        let Ok(c) = db.write() else {
            finish(
                &state,
                LibraryScanState::Failed,
                Some("persistenceFailed".into()),
                &notify,
            );
            return;
        };
        let root_id = match parse_id(&root.id) {
            Ok(value) => value,
            Err(_) => {
                finish(
                    &state,
                    LibraryScanState::Failed,
                    Some("persistenceFailed".into()),
                    &notify,
                );
                return;
            }
        };
        let generation:i64=match c.query_row("UPDATE library_roots SET scan_generation=scan_generation+1,last_scan_started_at_ms=?2,updated_at_ms=?2 WHERE id=?1 RETURNING scan_generation",params![root_id,now()],|r|r.get(0)){Ok(v)=>v,Err(_)=>{finish(&state,LibraryScanState::Failed,Some("persistenceFailed".into()),&notify);return}};
        let mut complete = true;
        for entry in walkdir::WalkDir::new(&root.path)
            .follow_links(false)
            .into_iter()
        {
            if cancel.load(Ordering::Acquire) {
                finish(&state, LibraryScanState::Cancelled, None, &notify);
                return;
            }
            let Ok(entry) = entry else {
                complete = false;
                break;
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let ext = path.extension().and_then(|x| x.to_str()).unwrap_or("");
            if !is_supported_extension(ext) {
                continue;
            }
            let relative = match path.strip_prefix(&root.path).ok().and_then(|p| p.to_str()) {
                Some(v) => v.replace('\\', "/"),
                None => {
                    progress.failed(&state);
                    continue;
                }
            };
            progress.discovered(&state);
            let metadata = match std::fs::metadata(path) {
                Ok(v) => v,
                Err(_) => {
                    progress.failed(&state);
                    continue;
                }
            };
            let modkey = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_nanos().to_string())
                .unwrap_or_default();
            let file_name = path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("")
                .to_owned();
            let existing: Option<(i64, i64, String, String, String)> = match c.query_row("SELECT f.id,f.source_revision,f.modification_key,f.inspection_status,COALESCE(m.artwork_status,'') FROM library_files f LEFT JOIN tracks t ON t.file_id=f.id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision WHERE f.root_id=?1 AND f.relative_path=?2",params![root_id,relative],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional() { Ok(value) => value, Err(_) => { finish(&state,LibraryScanState::Failed,Some("persistenceFailed".into()),&notify);return; } };
            let (file_id, revision, needs, artwork_retry) = match existing {
                Some((id, rev, old, status, artwork_status))
                    if old == modkey && status == "indexed" && artwork_status == "storeFailed" =>
                {
                    require_persistence!(c.execute("UPDATE library_files SET seen_generation=?2,availability='available',updated_at_ms=?3 WHERE id=?1",params![id,generation,now()]), state, notify);
                    (id, rev, false, true)
                }
                Some((id, rev, old, status, _)) if old == modkey && status != "pending" => {
                    require_persistence!(c.execute("UPDATE library_files SET seen_generation=?2,availability='available',updated_at_ms=?3 WHERE id=?1",params![id,generation,now()]), state, notify);
                    (id, rev, false, false)
                }
                Some((id, rev, ..)) => {
                    let n = rev + 1;
                    require_persistence!(c.execute("UPDATE library_files SET byte_length=?2,modification_key=?3,source_revision=?4,seen_generation=?5,availability='available',inspection_status='pending',updated_at_ms=?6 WHERE id=?1",params![id,metadata.len() as i64,modkey,n,generation,now()]), state, notify);
                    (id, n, true, false)
                }
                None => {
                    require_persistence!(c.execute("INSERT INTO library_files(root_id,relative_path,file_name,extension,byte_length,modification_key,source_revision,seen_generation,availability,inspection_status,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,1,?7,'available','pending',?8)",params![root_id,relative,file_name,ext.to_ascii_lowercase(),metadata.len() as i64,modkey,generation,now()]), state, notify);
                    (c.last_insert_rowid(), 1, true, false)
                }
            };
            if !needs {
                if artwork_retry
                    && retry_artwork_metadata(&c, path, file_id, revision, db.data_dir()).is_err()
                {
                    finish(
                        &state,
                        LibraryScanState::Failed,
                        Some("persistenceFailed".into()),
                        &notify,
                    );
                    return;
                }
                continue;
            }
            progress.inspected(&state);
            let input = ValidatedAudioFile {
                path: path.to_string_lossy().into_owned(),
                file_name,
                extension: ext.to_ascii_lowercase(),
            };
            match inspect_audio_file_internal(&input) {
                Ok(inspection) => {
                    require_persistence!(
                        c.execute(
                            "UPDATE library_files SET inspection_status='indexed' WHERE id=?1",
                            params![file_id],
                        ),
                        state,
                        notify
                    );
                    require_persistence!(
                        c.execute(
                            "INSERT OR IGNORE INTO tracks(file_id,created_at_ms) VALUES(?1,?2)",
                            params![file_id, now()],
                        ),
                        state,
                        notify
                    );
                    let track: i64 = match c.query_row(
                        "SELECT id FROM tracks WHERE file_id=?1",
                        params![file_id],
                        |r| r.get(0),
                    ) {
                        Ok(value) => value,
                        Err(_) => {
                            finish(
                                &state,
                                LibraryScanState::Failed,
                                Some("persistenceFailed".into()),
                                &notify,
                            );
                            return;
                        }
                    };
                    let tags = read_source_metadata(path);
                    let (
                        tag_status,
                        title,
                        artist,
                        album,
                        album_artist,
                        track_number,
                        track_total,
                        disc_number,
                        disc_total,
                        genre,
                        date,
                        artwork_read,
                    ) = match tags {
                        Ok(Some(t)) => (
                            "loaded",
                            t.title,
                            t.artist,
                            t.album,
                            t.album_artist,
                            t.track_number,
                            t.track_total,
                            t.disc_number,
                            t.disc_total,
                            t.genre,
                            t.date,
                            t.artwork,
                        ),
                        Ok(None) => (
                            "absent",
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            crate::media::metadata::ArtworkRead::NotPresent,
                        ),
                        Err(_) => (
                            "failed",
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            None,
                            crate::media::metadata::ArtworkRead::Unavailable,
                        ),
                    };
                    let stored = match artwork_read {
                        crate::media::metadata::ArtworkRead::Selected {
                            ref bytes,
                            mime_type,
                        } => artwork::materialize(db.data_dir(), bytes, mime_type).ok(),
                        _ => None,
                    };
                    let artwork_status = match (&artwork_read, &stored) {
                        (crate::media::metadata::ArtworkRead::NotPresent, _) => "notPresent",
                        (crate::media::metadata::ArtworkRead::Unavailable, _) => "unavailable",
                        (crate::media::metadata::ArtworkRead::Invalid, _) => "invalid",
                        (crate::media::metadata::ArtworkRead::Selected { .. }, Some(_)) => "stored",
                        (crate::media::metadata::ArtworkRead::Selected { .. }, None) => {
                            "storeFailed"
                        }
                    };
                    let bitrate_kbps =
                        average_bitrate_kbps(metadata.len(), inspection.info.duration_ms);
                    let artwork_id = match stored.as_ref() {
                        Some(asset) => match c.query_row("INSERT INTO artwork_assets(content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(content_hash) DO UPDATE SET content_hash=excluded.content_hash RETURNING id", params![asset.hash,asset.mime_type,asset.relative_path,asset.byte_length as i64,now()], |r| r.get::<_, i64>(0)) {
                            Ok(id) => Some(id),
                            Err(_) => {
                                finish(&state, LibraryScanState::Failed, Some("persistenceFailed".into()), &notify);
                                return;
                            }
                        },
                        None => None,
                    };
                    require_persistence!(c.execute("INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,track_total,disc_number,disc_total,genre,date,duration_ms,file_format,codec,sample_rate,channel_count,bit_depth,bitrate_kbps,tag_status,artwork_status,artwork_id,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23) ON CONFLICT(track_id) DO UPDATE SET source_revision=excluded.source_revision,title=excluded.title,artist=excluded.artist,album=excluded.album,album_artist=excluded.album_artist,track_number=excluded.track_number,track_total=excluded.track_total,disc_number=excluded.disc_number,disc_total=excluded.disc_total,genre=excluded.genre,date=excluded.date,duration_ms=excluded.duration_ms,file_format=excluded.file_format,codec=excluded.codec,sample_rate=excluded.sample_rate,channel_count=excluded.channel_count,bit_depth=excluded.bit_depth,bitrate_kbps=excluded.bitrate_kbps,tag_status=excluded.tag_status,artwork_status=excluded.artwork_status,artwork_id=excluded.artwork_id,updated_at_ms=excluded.updated_at_ms",params![track,revision,title,artist,album,album_artist,track_number,track_total,disc_number,disc_total,genre,date,inspection.info.duration_ms.map(|v|v as i64),input.extension,format!("{:?}",inspection.info.codec),inspection.info.sample_rate,inspection.info.channel_count,inspection.bit_depth,bitrate_kbps,tag_status,artwork_status,artwork_id,now()]), state, notify);
                    progress.indexed(&state)
                }
                Err(_) => {
                    require_persistence!(c.execute("UPDATE library_files SET inspection_status='unsupported',inspection_error_code='unsupportedFormat' WHERE id=?1",params![file_id]), state, notify);
                    progress.failed(&state)
                }
            }
        }
        if complete {
            require_persistence!(c.execute("UPDATE library_files SET availability='missing' WHERE root_id=?1 AND seen_generation<?2",params![root_id,generation]), state, notify);
            require_persistence!(c.execute("UPDATE library_roots SET last_successful_scan_at_ms=?2,last_scan_error_code=NULL WHERE id=?1",params![root_id,now()]), state, notify);
        } else {
            progress.failed(&state);
            traversal_failed = true;
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

fn retry_artwork_metadata(
    c: &rusqlite::Connection,
    path: &Path,
    file_id: i64,
    revision: i64,
    data_dir: &Path,
) -> Result<(), ()> {
    let track_id: i64 = c
        .query_row(
            "SELECT id FROM tracks WHERE file_id=?1",
            params![file_id],
            |row| row.get(0),
        )
        .map_err(|_| ())?;
    let artwork_read = match crate::media::metadata::read_source_metadata(path) {
        Ok(Some(metadata)) => metadata.artwork,
        Ok(None) => crate::media::metadata::ArtworkRead::NotPresent,
        Err(_) => crate::media::metadata::ArtworkRead::Unavailable,
    };
    let stored = match &artwork_read {
        crate::media::metadata::ArtworkRead::Selected { bytes, mime_type } => {
            artwork::materialize(data_dir, bytes, mime_type).ok()
        }
        _ => None,
    };
    let (status, artwork_id) = match (&artwork_read, stored) {
        (crate::media::metadata::ArtworkRead::NotPresent, _) => ("notPresent", None),
        (crate::media::metadata::ArtworkRead::Unavailable, _) => ("unavailable", None),
        (crate::media::metadata::ArtworkRead::Invalid, _) => ("invalid", None),
        (crate::media::metadata::ArtworkRead::Selected { .. }, None) => ("storeFailed", None),
        (crate::media::metadata::ArtworkRead::Selected { .. }, Some(asset)) => {
            let id = c.query_row(
                "INSERT INTO artwork_assets(content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(content_hash) DO UPDATE SET content_hash=excluded.content_hash RETURNING id",
                params![asset.hash, asset.mime_type, asset.relative_path, asset.byte_length as i64, now()],
                |row| row.get::<_, i64>(0),
            ).map_err(|_| ())?;
            ("stored", Some(id))
        }
    };
    c.execute(
        "UPDATE track_source_metadata SET artwork_status=?3,artwork_id=?4,updated_at_ms=?5 WHERE track_id=?1 AND source_revision=?2",
        params![track_id, revision, status, artwork_id, now()],
    ).map_err(|_| ())?;
    Ok(())
}

fn idle() -> LibraryScanSnapshot {
    LibraryScanSnapshot {
        state: LibraryScanState::Idle,
        current_root: None,
        discovered_count: 0,
        inspected_count: 0,
        indexed_count: 0,
        failed_count: 0,
        failure_code: None,
    }
}
pub(crate) fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<LibraryTrackSummary> {
    let id: i64 = row.get(0)?;
    let file: String = row.get(1)?;
    let availability: String = row.get(2)?;
    let inspection_status: String = row.get(3)?;
    let title: Option<String> = row.get(4)?;
    let artist: Option<String> = row.get(5)?;
    let album: Option<String> = row.get(6)?;
    let album_artist: Option<String> = row.get(7)?;
    let duration: Option<i64> = row.get(8)?;
    let content_hash: Option<String> = row.get(9)?;
    let mime_type: Option<String> = row.get(10)?;
    let relative_path: Option<String> = row.get(11)?;
    let artwork = match (content_hash, mime_type, relative_path) {
        (Some(content_hash), Some(mime_type), Some(relative_path)) => match mime_type.as_str() {
            "image/jpeg" => Some(ArtworkRef {
                content_hash,
                mime_type: ArtworkMimeType::Jpeg,
                relative_path,
            }),
            "image/png" => Some(ArtworkRef {
                content_hash,
                mime_type: ArtworkMimeType::Png,
                relative_path,
            }),
            _ => None,
        },
        _ => None,
    };
    let title = effective_track_title(title.as_deref(), &file);
    Ok(LibraryTrackSummary {
        id: id.to_string(),
        title,
        artist: artist.filter(|v| !v.trim().is_empty()),
        album: album.filter(|v| !v.trim().is_empty()),
        album_artist: album_artist.filter(|v| !v.trim().is_empty()),
        artwork,
        duration_ms: duration.map(|v| v as u64),
        playable: availability == "available" && inspection_status == "indexed",
        availability: if availability == "available" {
            LibraryFileAvailability::Available
        } else {
            LibraryFileAvailability::Missing
        },
    })
}
fn scanning(state: &Arc<Mutex<LibraryScanSnapshot>>) -> bool {
    matches!(
        state.lock().expect("scan state lock").state,
        LibraryScanState::Running
    )
}
fn finish(
    s: &Arc<Mutex<LibraryScanSnapshot>>,
    state: LibraryScanState,
    f: Option<String>,
    notify: &std::sync::mpsc::SyncSender<()>,
) {
    let snapshot = {
        let mut x = s.lock().expect("scan state lock");
        x.state = state;
        x.current_root = None;
        x.failure_code = f;
        x.clone()
    };
    match snapshot.state {
        LibraryScanState::Completed => info!("library.scan.completed discovered_count={} inspected_count={} indexed_count={} failed_count={}", snapshot.discovered_count, snapshot.inspected_count, snapshot.indexed_count, snapshot.failed_count),
        LibraryScanState::Cancelled => info!("library.scan.cancelled discovered_count={} inspected_count={} indexed_count={} failed_count={}", snapshot.discovered_count, snapshot.inspected_count, snapshot.indexed_count, snapshot.failed_count),
        LibraryScanState::Failed => error!("library.scan.failed discovered_count={} inspected_count={} indexed_count={} failed_count={} failure_code={:?}", snapshot.discovered_count, snapshot.inspected_count, snapshot.indexed_count, snapshot.failed_count, snapshot.failure_code),
        LibraryScanState::Idle | LibraryScanState::Running => {}
    }
    let _ = notify.try_send(());
}
struct ProgressPublisher<'a> {
    notify: &'a std::sync::mpsc::SyncSender<()>,
    last_counter_signal: Instant,
}
impl<'a> ProgressPublisher<'a> {
    fn new(notify: &'a std::sync::mpsc::SyncSender<()>) -> Self {
        Self {
            notify,
            last_counter_signal: Instant::now() - Duration::from_millis(200),
        }
    }
    fn counter(
        &mut self,
        state: &Arc<Mutex<LibraryScanSnapshot>>,
        update: impl FnOnce(&mut LibraryScanSnapshot),
    ) {
        {
            update(&mut state.lock().expect("scan state lock"));
        }
        if self.last_counter_signal.elapsed() >= Duration::from_millis(200) {
            let _ = self.notify.try_send(());
            self.last_counter_signal = Instant::now();
        }
    }
    fn discovered(&mut self, state: &Arc<Mutex<LibraryScanSnapshot>>) {
        self.counter(state, |s| s.discovered_count += 1);
    }
    fn inspected(&mut self, state: &Arc<Mutex<LibraryScanSnapshot>>) {
        self.counter(state, |s| s.inspected_count += 1);
    }
    fn indexed(&mut self, state: &Arc<Mutex<LibraryScanSnapshot>>) {
        self.counter(state, |s| s.indexed_count += 1);
    }
    fn failed(&mut self, state: &Arc<Mutex<LibraryScanSnapshot>>) {
        self.counter(state, |s| s.failed_count += 1);
    }
}
pub(crate) fn parse_id(value: &str) -> Result<i64, LibraryCommandError> {
    if value.is_empty() || value.starts_with('0') || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(LibraryCommandError::InvalidId);
    }
    value
        .parse()
        .ok()
        .filter(|v: &i64| *v > 0)
        .ok_or(LibraryCommandError::InvalidId)
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}
fn average_bitrate_kbps(byte_length: u64, duration_ms: Option<u64>) -> Option<u64> {
    let duration_ms = duration_ms?;
    if duration_ms == 0 {
        return None;
    }
    byte_length
        .checked_mul(8)?
        .checked_mul(1000)?
        .checked_add(duration_ms / 2)?
        .checked_div(duration_ms)?
        .checked_div(1000)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    static TEST_DATABASE_ID: AtomicU64 = AtomicU64::new(0);

    fn test_library() -> LibraryShared {
        let directory = std::env::temp_dir().join(format!(
            "nice-audio-player-library-service-{}-{}",
            std::process::id(),
            TEST_DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&directory).expect("test directory");
        LibraryShared::ready(Database::initialize(&directory).expect("test database"))
    }

    struct TrackSeed<'a> {
        id: i64,
        title: &'a str,
        artist: &'a str,
        album: &'a str,
        album_artist: &'a str,
        disc_number: Option<i64>,
        track_number: Option<i64>,
        artwork_id: Option<i64>,
    }

    fn seed_track(library: &LibraryShared, track: TrackSeed<'_>) {
        seed_track_at_root(library, track, 1, Path::new("C:/Music"));
    }

    fn seed_track_at_root(
        library: &LibraryShared,
        track: TrackSeed<'_>,
        root_id: i64,
        root_path: &Path,
    ) {
        let c = library
            .db()
            .expect("database")
            .write()
            .expect("database lock");
        c.execute(
            "INSERT OR IGNORE INTO library_roots(id,path,enabled,scan_generation,created_at_ms,updated_at_ms) VALUES(?1,?2,1,0,0,0)",
            params![root_id, root_path.to_string_lossy().to_string()],
        ).expect("root");
        c.execute(
            "INSERT INTO library_files(id,root_id,relative_path,file_name,extension,byte_length,modification_key,source_revision,seen_generation,availability,inspection_status,updated_at_ms) VALUES(?1,?2,?3,?4,'wav',1,'1',1,1,'available','indexed',0)",
            params![track.id, root_id, format!("{}.wav", track.id), format!("{}.wav", track.id)],
        ).expect("file");
        c.execute(
            "INSERT INTO tracks(id,file_id,created_at_ms) VALUES(?1,?1,0)",
            params![track.id],
        )
        .expect("track");
        c.execute(
            "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,tag_status,artwork_status,artwork_id,updated_at_ms) VALUES(?1,1,?2,?3,?4,?5,?6,?7,'loaded','stored',?8,0)",
            params![track.id, track.title, track.artist, track.album, track.album_artist, track.track_number, track.disc_number, track.artwork_id],
        ).expect("metadata");
    }

    #[test]
    fn album_query_keeps_logical_identity_and_ranks_stored_artwork() {
        let library = test_library();
        let c = library
            .db()
            .expect("database")
            .write()
            .expect("database lock");
        c.execute("INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(1,?1,'image/jpeg',?2,1,0)", params!["a".repeat(64), format!("artwork/aa/{}.jpg", "a".repeat(64))]).expect("artwork one");
        c.execute("INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(2,?1,'image/png',?2,1,0)", params!["b".repeat(64), format!("artwork/bb/{}.png", "b".repeat(64))]).expect("artwork two");
        drop(c);
        seed_track(
            &library,
            TrackSeed {
                id: 1,
                title: "First",
                artist: "Artist",
                album: "Shared",
                album_artist: "Album Artist",
                disc_number: Some(2),
                track_number: Some(1),
                artwork_id: Some(1),
            },
        );
        seed_track(
            &library,
            TrackSeed {
                id: 2,
                title: "Needle",
                artist: "Artist",
                album: "Shared",
                album_artist: "Album Artist",
                disc_number: Some(1),
                track_number: Some(2),
                artwork_id: Some(2),
            },
        );
        seed_track(
            &library,
            TrackSeed {
                id: 3,
                title: "Percent %",
                artist: "Other",
                album: "Other %_\\ album",
                album_artist: "Other artist",
                disc_number: None,
                track_number: None,
                artwork_id: None,
            },
        );

        let all = library.catalog_albums(None, None).expect("album page");
        assert_eq!(all.items.len(), 2);
        let shared = all
            .items
            .iter()
            .find(|album| album.key.title == "Shared")
            .expect("shared album");
        assert_eq!(shared.key.album_artist, "Album Artist");
        assert!(matches!(
            shared.artwork.as_ref(),
            Some(ArtworkRef {
                mime_type: ArtworkMimeType::Png,
                ..
            })
        ));

        let track_only = library
            .catalog_albums(None, Some("Needle".into()))
            .expect("search page");
        assert!(track_only.items.is_empty());
        let searched = library
            .catalog_albums(None, Some("Shared".into()))
            .expect("album title search page");
        assert_eq!(searched.items.len(), 1);
        assert_eq!(searched.items[0].key.title, "Shared");
        let literal = library
            .catalog_albums(None, Some("%".into()))
            .expect("literal search page");
        assert_eq!(literal.items.len(), 1);
        assert_eq!(literal.items[0].key.title, "Other %_\\ album");
        for literal_term in ["_", "\\"] {
            let literal = library
                .catalog_albums(None, Some(literal_term.into()))
                .expect("literal catalog search");
            assert_eq!(literal.items.len(), 1);
            assert_eq!(literal.items[0].key.title, "Other %_\\ album");
        }

        let catalog = library
            .catalog_albums(None, Some("Album Artist".into()))
            .expect("catalog album page");
        assert_eq!(catalog.items.len(), 1);
        assert_eq!(catalog.items[0].key.album_artist, "Album Artist");
        assert!(matches!(
            catalog.items[0].artwork.as_ref(),
            Some(ArtworkRef {
                mime_type: ArtworkMimeType::Png,
                ..
            })
        ));

        let artists = library
            .catalog_album_artists(None, None)
            .expect("catalog artists");
        assert_eq!(artists.items.len(), 2);
        assert_eq!(artists.items[0].album_count, 1);
        let artist_albums = library
            .catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Album Artist".into(),
                },
                None,
            )
            .expect("artist albums");
        assert_eq!(artist_albums.items.len(), 1);
        assert_eq!(artist_albums.items[0].key.title, "Shared");

        let details = library
            .catalog_album_details(LibraryAlbumKey {
                title: "Shared".into(),
                album_artist: "Album Artist".into(),
            })
            .expect("logical album details");
        assert_eq!(details.track_count, 2);
        let tracks = library
            .catalog_album_tracks(details.summary.key.clone(), 0)
            .expect("logical album tracks");
        assert_eq!(tracks.items.len(), 2);
        assert!(library
            .catalog_albums(Some("not-json".into()), None)
            .is_err());
        assert!(matches!(
            library.catalog_playback(
                LibraryAlbumKey {
                    title: " ".into(),
                    album_artist: "Album Artist".into(),
                },
                None,
            ),
            Err(StartLibraryAlbumTrackError::InvalidAlbumKey)
        ));
        assert!(matches!(
            library.catalog_playback(
                LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("3".into()),
            ),
            Err(StartLibraryAlbumTrackError::TrackNotMember)
        ));
        assert!(matches!(
            library.catalog_playback(
                LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("not-an-id".into()),
            ),
            Err(StartLibraryAlbumTrackError::InvalidTrackId)
        ));
        {
            let c = library
                .db()
                .expect("database")
                .write()
                .expect("database lock");
            c.execute(
                "UPDATE library_files SET availability='missing' WHERE id IN (1,2)",
                [],
            )
            .expect("mark files unavailable");
        }
        assert!(matches!(
            library.catalog_playback(
                LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("1".into()),
            ),
            Err(StartLibraryAlbumTrackError::TrackUnavailable)
        ));
        assert!(matches!(
            library.catalog_playback(
                LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                None,
            ),
            Err(StartLibraryAlbumTrackError::NoPlayableTracks)
        ));
    }

    #[test]
    fn playable_entry_uses_filename_stem_when_metadata_title_is_empty() {
        let library = test_library();
        let root = std::env::temp_dir().join(format!(
            "nice-audio-player-library-title-{}-{}",
            std::process::id(),
            TEST_DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).expect("title fixture directory");
        std::fs::write(root.join("1.wav"), []).expect("title fixture audio");
        seed_track_at_root(
            &library,
            TrackSeed {
                id: 1,
                title: "",
                artist: "Artist",
                album: "Album",
                album_artist: "Artist",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
            1,
            &root,
        );

        let entry = library
            .playable_entry("1".into())
            .expect("playable title fixture");
        assert_eq!(entry.title, "1");
    }

    #[test]
    fn track_search_uses_the_same_filename_stem_as_displayed_title() {
        let library = test_library();
        seed_track(
            &library,
            TrackSeed {
                id: 1,
                title: "",
                artist: "Artist",
                album: "Album",
                album_artist: "Artist",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        library
            .db()
            .expect("database")
            .write()
            .expect("database lock")
            .execute(
                "UPDATE library_files SET file_name='multi.part.flac',relative_path='multi.part.flac' WHERE id=1",
                [],
            )
            .expect("filename");

        let stem_match = library
            .catalog_tracks(None, Some("multi.part".into()))
            .expect("stem search");
        assert_eq!(stem_match.items.len(), 1);
        assert_eq!(stem_match.items[0].title, "multi.part");
        assert!(library
            .catalog_tracks(None, Some("flac".into()))
            .expect("extension search")
            .items
            .is_empty());
    }

    #[test]
    fn catalog_cursor_pages_without_duplicates_or_id_ordering() {
        let library = test_library();
        for id in 1..=105 {
            let title = format!("Album {id:03}");
            seed_track(
                &library,
                TrackSeed {
                    id,
                    title: "Track",
                    artist: "Artist",
                    album: Box::leak(title.into_boxed_str()),
                    album_artist: "Artist",
                    disc_number: Some(1),
                    track_number: Some(1),
                    artwork_id: None,
                },
            );
        }
        seed_track(
            &library,
            TrackSeed {
                id: 106,
                title: "Other track",
                artist: "Other artist",
                album: "Other album",
                album_artist: "Other artist",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        let first = library
            .catalog_albums(None, None)
            .expect("first catalog page");
        assert_eq!(first.items.len(), 100);
        let cursor = first.next_cursor.clone().expect("next cursor");
        let second = library
            .catalog_albums(Some(cursor.clone()), None)
            .expect("second catalog page");
        assert_eq!(second.items.len(), 6);
        assert!(second.items[0].key.title > first.items[99].key.title);
        assert!(first.items.iter().all(|item| {
            !second.items.iter().any(|next| {
                next.key.title == item.key.title && next.key.album_artist == item.key.album_artist
            })
        }));
        assert!(matches!(
            library.catalog_albums(Some(cursor), Some("different".into())),
            Err(LibraryCommandError::InvalidCursor)
        ));
        let artist_page = library
            .catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Artist".into(),
                },
                None,
            )
            .expect("artist album page");
        let artist_cursor = artist_page.next_cursor.expect("artist continuation");
        assert!(matches!(
            library.catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Other artist".into(),
                },
                Some(artist_cursor),
            ),
            Err(LibraryCommandError::InvalidCursor)
        ));
        assert!(library
            .catalog_album_artists(None, Some("Artist".into()))
            .is_ok());
        let artist = library
            .catalog_artist(LibraryAlbumArtistKey {
                name: "Artist".into(),
            })
            .expect("logical album artist detail");
        assert_eq!(artist.album_count, 105);
    }

    #[test]
    fn catalog_preserves_case_sensitive_identity_and_effective_artist_fallback() {
        let library = test_library();
        seed_track(
            &library,
            TrackSeed {
                id: 1,
                title: "Upper",
                artist: "Performer",
                album: "Case",
                album_artist: "Performer",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        seed_track(
            &library,
            TrackSeed {
                id: 2,
                title: "Lower",
                artist: "Performer",
                album: "case",
                album_artist: "Performer",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        seed_track(
            &library,
            TrackSeed {
                id: 3,
                title: "Fallback",
                artist: "Fallback Artist",
                album: "Fallback album",
                album_artist: "Ignored metadata",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        {
            let c = library
                .db()
                .expect("database")
                .write()
                .expect("database lock");
            c.execute(
                "UPDATE track_source_metadata SET album_artist=NULL WHERE track_id=3",
                [],
            )
            .expect("clear album artist metadata");
        }

        let albums = library
            .catalog_albums(None, None)
            .expect("case-sensitive albums");
        let case_titles: Vec<_> = albums
            .items
            .iter()
            .filter(|album| album.key.album_artist == "Performer")
            .map(|album| album.key.title.as_str())
            .collect();
        assert_eq!(case_titles, ["Case", "case"]);
        assert_eq!(albums.items.len(), 3);
        assert_eq!(
            library
                .catalog_album_details(LibraryAlbumKey {
                    title: "Case".into(),
                    album_artist: "Performer".into(),
                })
                .expect("upper-case logical key")
                .track_count,
            1
        );
        assert_eq!(
            library
                .catalog_album_details(LibraryAlbumKey {
                    title: "case".into(),
                    album_artist: "Performer".into(),
                })
                .expect("lower-case logical key")
                .track_count,
            1
        );
        let fallback = library
            .catalog_album_details(LibraryAlbumKey {
                title: "Fallback album".into(),
                album_artist: "Fallback Artist".into(),
            })
            .expect("effective fallback artist");
        assert_eq!(fallback.track_count, 1);
        assert_eq!(
            library
                .catalog_artist(LibraryAlbumArtistKey {
                    name: "Fallback Artist".into(),
                })
                .expect("fallback artist detail")
                .album_count,
            1
        );
    }

    #[test]
    fn album_artist_artwork_uses_only_the_canonical_first_album() {
        let library = test_library();
        let c = library
            .db()
            .expect("database")
            .write()
            .expect("database lock");
        c.execute(
            "INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(1,?1,'image/jpeg',?2,1,0)",
            params!["c".repeat(64), format!("artwork/cc/{}.jpg", "c".repeat(64))],
        )
        .expect("artwork");
        drop(c);
        seed_track(
            &library,
            TrackSeed {
                id: 1,
                title: "First",
                artist: "Artist",
                album: "Album 1",
                album_artist: "Artist",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: None,
            },
        );
        seed_track(
            &library,
            TrackSeed {
                id: 2,
                title: "Later",
                artist: "Artist",
                album: "Album 2",
                album_artist: "Artist",
                disc_number: Some(1),
                track_number: Some(1),
                artwork_id: Some(1),
            },
        );
        let artists = library
            .catalog_album_artists(None, None)
            .expect("album artists");
        assert_eq!(artists.items.len(), 1);
        assert!(artists.items[0].artwork.is_none());
        assert!(library
            .catalog_artist(LibraryAlbumArtistKey {
                name: "Artist".into(),
            })
            .expect("artist detail")
            .artwork
            .is_none());
    }

    #[test]
    fn catalog_playback_resolves_complete_sequence_over_one_hundred_tracks() {
        let library = test_library();
        let root = std::env::temp_dir().join(format!(
            "nice-audio-player-library-playback-{}-{}",
            std::process::id(),
            TEST_DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).expect("playback root");
        for id in 1..=101 {
            std::fs::write(root.join(format!("{id}.wav")), []).expect("audio fixture");
            seed_track_at_root(
                &library,
                TrackSeed {
                    id,
                    title: "Track",
                    artist: "Artist",
                    album: "Long Album",
                    album_artist: "Artist",
                    disc_number: Some(1),
                    track_number: Some(id),
                    artwork_id: None,
                },
                1,
                &root,
            );
        }

        let (entries, index) = library
            .catalog_playback(
                LibraryAlbumKey {
                    title: "Long Album".into(),
                    album_artist: "Artist".into(),
                },
                Some("101".into()),
            )
            .expect("complete album playback sequence");
        assert_eq!(entries.len(), 101);
        assert_eq!(index, 100);
    }

    #[test]
    fn catalog_pages_two_thousand_source_tracks_within_regression_budget() {
        let library = test_library();
        let c = library
            .db()
            .expect("database")
            .write()
            .expect("database lock");
        let tx = c.unchecked_transaction().expect("seed transaction");
        tx.execute(
            "INSERT INTO library_roots(id,path,enabled,scan_generation,created_at_ms,updated_at_ms) VALUES(1,'C:/Music',1,0,0,0)",
            [],
        )
        .expect("root");
        for id in 1..=2000_i64 {
            tx.execute(
                "INSERT INTO library_files(id,root_id,relative_path,file_name,extension,byte_length,modification_key,source_revision,seen_generation,availability,inspection_status,updated_at_ms) VALUES(?1,1,?2,?2,'wav',1,'1',1,1,'available','indexed',0)",
                params![id, format!("{id}.wav")],
            )
            .expect("file");
            tx.execute(
                "INSERT INTO tracks(id,file_id,created_at_ms) VALUES(?1,?1,0)",
                params![id],
            )
            .expect("track");
            tx.execute(
                "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,tag_status,artwork_status,updated_at_ms) VALUES(?1,1,?2,'Artist',?3,'Artist',1,1,'loaded','missing',0)",
                params![id, format!("Track {id}"), format!("Album {id}")],
            )
            .expect("metadata");
        }
        tx.commit().expect("commit source tracks");
        let started = Instant::now();
        let albums = library.catalog_albums(None, None).expect("albums page");
        let albums_elapsed = started.elapsed();
        assert_eq!(albums.items.len(), 100);
        assert!(albums.next_cursor.is_some());
        assert!(
            albums_elapsed < Duration::from_secs(1),
            "root query took {albums_elapsed:?}"
        );

        let started = Instant::now();
        let artist_albums = library
            .catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Artist".into(),
                },
                None,
            )
            .expect("artist albums page");
        let artist_elapsed = started.elapsed();
        assert_eq!(artist_albums.items.len(), 100);
        assert!(artist_albums.next_cursor.is_some());
        assert!(
            artist_elapsed < Duration::from_secs(1),
            "artist query took {artist_elapsed:?}"
        );

        let c = library
            .db()
            .expect("database")
            .write()
            .expect("database lock");
        let tx = c.unchecked_transaction().expect("dense seed transaction");
        for id in 2001..=4000_i64 {
            tx.execute(
                "INSERT INTO library_files(id,root_id,relative_path,file_name,extension,byte_length,modification_key,source_revision,seen_generation,availability,inspection_status,updated_at_ms) VALUES(?1,1,?2,?2,'wav',1,'1',1,1,'available','indexed',0)",
                params![id, format!("{id}.wav")],
            )
            .expect("dense file");
            tx.execute(
                "INSERT INTO tracks(id,file_id,created_at_ms) VALUES(?1,?1,0)",
                params![id],
            )
            .expect("dense track");
            tx.execute(
                "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,tag_status,artwork_status,updated_at_ms) VALUES(?1,1,'Dense track','Dense artist',?2,'Dense artist',1,1,'loaded','missing',0)",
                params![id, format!("Dense Album {}", id % 20)],
            )
            .expect("dense metadata");
        }
        tx.commit().expect("commit dense tracks");
        let started = Instant::now();
        let dense = library
            .catalog_albums(None, Some("Dense".into()))
            .expect("dense albums page");
        let dense_elapsed = started.elapsed();
        assert_eq!(dense.items.len(), 20);
        assert!(
            dense_elapsed < Duration::from_secs(1),
            "dense query took {dense_elapsed:?}"
        );
    }
}
