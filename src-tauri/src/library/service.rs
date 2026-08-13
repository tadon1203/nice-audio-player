use super::artwork;
use super::{database::Database, models::*};
use crate::media::{
    inspection::inspect_audio_file_internal,
    metadata::read_source_metadata,
    validation::{is_supported_extension, ValidatedAudioFile},
};
use rusqlite::{params, OptionalExtension, Row};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{SystemTime, UNIX_EPOCH},
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
    RootMissing,
    ScanAlreadyRunning,
    NoEnabledRoots,
    ScanNotRunning,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}
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
    pub fn initialize(directory: PathBuf) -> Self {
        let (notify, receiver) = std::sync::mpsc::sync_channel(1);
        match Database::initialize(&directory) {
            Ok(database) => Self::ready(database),
            Err(error) => Self {
                database: None,
                status: LibraryStatus::Unavailable {
                    reason: match error {
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
                    },
                },
                state: Arc::new(Mutex::new(idle())),
                cancel: Arc::new(AtomicBool::new(false)),
                worker: Arc::new(Mutex::new(None)),
                notify,
                receiver: Arc::new(Mutex::new(Some(receiver))),
            },
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
    fn db(&self) -> Result<&Database, LibraryCommandError> {
        self.database
            .as_ref()
            .ok_or(LibraryCommandError::LibraryUnavailable)
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
    pub fn tracks(&self, after: Option<String>) -> Result<LibraryTrackPage, LibraryCommandError> {
        let after = match after {
            Some(v) => parse_id(&v)?,
            None => 0,
        };
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut s=c.prepare("SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status FROM tracks t JOIN library_files f ON f.id=t.file_id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored' WHERE t.id>?1 ORDER BY t.id LIMIT 101").map_err(|_|LibraryCommandError::PersistenceFailed)?;
        let rows = s
            .query_map(params![after], summary_from_row)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut items = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let next_after_id = if items.len() > 100 {
            items.pop();
            items.last().map(|v| v.id.clone())
        } else {
            None
        };
        Ok(LibraryTrackPage {
            items,
            next_after_id,
        })
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
        c.query_row("SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status FROM tracks t JOIN library_files f ON f.id=t.file_id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored' WHERE f.root_id=?1 AND f.relative_path=?2", params![parse_id(&root.id)?, relative_path], summary_from_row).optional().map_err(|_|LibraryCommandError::PersistenceFailed)
    }
    pub fn start_scan(&self) -> Result<(), LibraryCommandError> {
        if scanning(&self.state) {
            return Err(LibraryCommandError::ScanAlreadyRunning);
        }
        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            if worker.is_finished() {
                let _ = worker.join();
            } else {
                *self.worker.lock().expect("worker lock") = Some(worker);
                return Err(LibraryCommandError::ScanAlreadyRunning);
            }
        }
        let roots: Vec<_> = self.roots()?.into_iter().filter(|r| r.enabled).collect();
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
    pub fn shutdown(&self) {
        self.cancel.store(true, Ordering::Release);
        if let Some(worker) = self.worker.lock().expect("worker lock").take() {
            let _ = worker.join();
        }
    }
}
/// The Tauri-managed owner. Only this type owns scanner shutdown.
pub struct LibraryService {
    shared: LibraryShared,
}

/// A command-safe view of the library. Dropping it has no lifecycle effect.
#[derive(Clone)]
pub struct LibraryServiceHandle {
    shared: LibraryShared,
}

impl std::ops::Deref for LibraryServiceHandle {
    type Target = LibraryShared;
    fn deref(&self) -> &Self::Target {
        &self.shared
    }
}

impl LibraryService {
    pub fn initialize(directory: PathBuf) -> Self {
        Self {
            shared: LibraryShared::initialize(directory),
        }
    }
    pub fn handle(&self) -> LibraryServiceHandle {
        LibraryServiceHandle {
            shared: self.shared.clone(),
        }
    }
    pub fn status(&self) -> LibraryStatus {
        self.shared.status()
    }
    pub fn shutdown(&self) {
        self.shared.shutdown()
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
                    inc_failed(&state);
                    continue;
                }
            };
            inc_discovered(&state);
            let metadata = match std::fs::metadata(path) {
                Ok(v) => v,
                Err(_) => {
                    inc_failed(&state);
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
            inc_inspected(&state);
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
                    inc_indexed(&state)
                }
                Err(_) => {
                    require_persistence!(c.execute("UPDATE library_files SET inspection_status='unsupported',inspection_error_code='unsupportedFormat' WHERE id=?1",params![file_id]), state, notify);
                    inc_failed(&state)
                }
            }
        }
        if complete {
            require_persistence!(c.execute("UPDATE library_files SET availability='missing' WHERE root_id=?1 AND seen_generation<?2",params![root_id,generation]), state, notify);
            require_persistence!(c.execute("UPDATE library_roots SET last_successful_scan_at_ms=?2,last_scan_error_code=NULL WHERE id=?1",params![root_id,now()]), state, notify);
        } else {
            inc_failed(&state);
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
fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<LibraryTrackSummary> {
    let id: i64 = row.get(0)?;
    let file: String = row.get(1)?;
    let availability: String = row.get(2)?;
    let inspection_status: String = row.get(3)?;
    let title: Option<String> = row.get(4)?;
    let artist: Option<String> = row.get(5)?;
    let duration: Option<i64> = row.get(6)?;
    let content_hash: Option<String> = row.get(7)?;
    let mime_type: Option<String> = row.get(8)?;
    let relative_path: Option<String> = row.get(9)?;
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
    let title = title.filter(|v| !v.trim().is_empty()).unwrap_or_else(|| {
        Path::new(&file)
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or(&file)
            .to_owned()
    });
    Ok(LibraryTrackSummary {
        id: id.to_string(),
        title,
        artist: artist.filter(|v| !v.trim().is_empty()),
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
    let mut x = s.lock().expect("scan state lock");
    x.state = state;
    x.current_root = None;
    x.failure_code = f;
    let _ = notify.try_send(());
}
fn inc_discovered(s: &Arc<Mutex<LibraryScanSnapshot>>) {
    s.lock().expect("scan state lock").discovered_count += 1
}
fn inc_inspected(s: &Arc<Mutex<LibraryScanSnapshot>>) {
    s.lock().expect("scan state lock").inspected_count += 1
}
fn inc_indexed(s: &Arc<Mutex<LibraryScanSnapshot>>) {
    s.lock().expect("scan state lock").indexed_count += 1
}
fn inc_failed(s: &Arc<Mutex<LibraryScanSnapshot>>) {
    s.lock().expect("scan state lock").failed_count += 1
}
fn parse_id(value: &str) -> Result<i64, LibraryCommandError> {
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
