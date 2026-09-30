use super::artwork;
use super::policy::effective_track_title;
use super::runtime::LibraryRuntime;
use super::status::{ArtworkStatus, Availability, InspectionStatus};
use super::{database::Database, models::*};
use crate::activity::ApplicationActivityHandle;
use crate::events::{BackendEvent, Notifier, SharedEventSink};
use crate::lyrics::model::LyricsTrackContext;
use log::{error, info};
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
    TrackNotFound,
    TrackUnavailable,
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

// Kept separate from IPC errors so storage errors never expose SQLite implementation details.
#[derive(Clone)]
pub struct LibraryShared {
    database: Option<Database>,
    status: LibraryStatus,
    state: Arc<Mutex<LibraryScanSnapshot>>,
    cancel: Arc<AtomicBool>,
    worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    notify: Notifier,
}
impl LibraryShared {
    fn join_scan_worker(worker: JoinHandle<()>) {
        if worker.join().is_err() {
            log::error!("library.scan.worker_panicked");
        }
    }

    pub fn initialize(directory: PathBuf, notify: Notifier) -> Self {
        match Database::initialize(&directory) {
            Ok(database) => Self::ready(database, notify),
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
                }
            }
        }
    }
    fn ready(database: Database, notify: Notifier) -> Self {
        Self {
            database: Some(database),
            status: LibraryStatus::Ready,
            state: Arc::new(Mutex::new(idle())),
            cancel: Arc::new(AtomicBool::new(false)),
            worker: Arc::new(Mutex::new(None)),
            notify,
        }
    }
    pub fn status(&self) -> LibraryStatus {
        self.status.clone()
    }
    fn notify(&self) {
        self.notify.notify();
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
        cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        self.catalog_tracks(cursor, search, sort_key, sort_direction)
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
        // Files, tracks and their metadata go with the root (ON DELETE CASCADE).
        tx.execute("DELETE FROM library_roots WHERE id=?1", params![id])
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        tx.commit()
            .map_err(|_| LibraryCommandError::PersistenceFailed)
    }
    /// One track's summary, looked up by its library id.
    pub fn track_by_id(
        &self,
        id: &str,
    ) -> Result<Option<LibraryTrackSummary>, LibraryCommandError> {
        let id = parse_id(id)?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        c.query_row("SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.album,m.album_artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status,m.file_format,m.bit_depth,m.bitrate_kbps FROM tracks t JOIN library_files f ON f.id=t.file_id LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status=?2 WHERE t.id=?1", params![id, ArtworkStatus::Stored], summary_from_row)
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)
    }
    pub fn lyrics_context(&self, id: String) -> Result<LyricsTrackContext, LibraryCommandError> {
        let numeric_id = parse_id(&id).map_err(|_| LibraryCommandError::InvalidId)?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let row: Option<(String, String, Availability)> = c.query_row("SELECT r.path,f.relative_path,f.availability FROM tracks t JOIN library_files f ON f.id=t.file_id JOIN library_roots r ON r.id=f.root_id WHERE t.id=?1", params![numeric_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).optional().map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((root, relative, availability)) = row else {
            return Err(LibraryCommandError::TrackNotFound);
        };
        if availability != Availability::Available {
            return Err(LibraryCommandError::TrackUnavailable);
        }
        let root = dunce::canonicalize(root).map_err(|_| LibraryCommandError::TrackUnavailable)?;
        let source = dunce::canonicalize(root.join(relative))
            .map_err(|_| LibraryCommandError::TrackUnavailable)?;
        if !source.starts_with(&root) {
            return Err(LibraryCommandError::TrackUnavailable);
        }
        Ok(LyricsTrackContext {
            track_id: id,
            source,
            root,
        })
    }
    /// Representative color of stored artwork, computed on first request and cached.
    pub fn artwork_accent(
        &self,
        content_hash: String,
    ) -> Result<Option<String>, LibraryCommandError> {
        if content_hash.len() != 64 || !content_hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(LibraryCommandError::InvalidId);
        }
        let db = self.db()?;
        let row: Option<(i64, String, Option<String>)> = db
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?
            .query_row(
                "SELECT id,relative_path,accent FROM artwork_assets WHERE content_hash=?1",
                params![content_hash],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((id, relative_path, accent)) = row else {
            return Ok(None);
        };
        if accent.is_some() {
            return Ok(accent);
        }
        if !artwork::is_canonical_relative_path(&relative_path) {
            return Ok(None);
        }
        let Ok(bytes) = std::fs::read(db.data_dir().join(&relative_path)) else {
            return Ok(None);
        };
        let Some(color) = super::accent::representative_color(&bytes) else {
            return Ok(None);
        };
        db.write()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?
            .execute(
                "UPDATE artwork_assets SET accent=?2 WHERE id=?1",
                params![id, color],
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        Ok(Some(color))
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
            expected_count: 0,
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
            super::scanner::run(db, roots, state, cancel, notify)
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
/// The library runtime owner. Only this type owns scanner shutdown.
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
        events: SharedEventSink,
    ) -> Self {
        let shared = LibraryShared::initialize(
            directory,
            Notifier::new(events, BackendEvent::LibraryScanChanged),
        );
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
}

impl Drop for LibraryService {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn idle() -> LibraryScanSnapshot {
    LibraryScanSnapshot {
        state: LibraryScanState::Idle,
        current_root: None,
        expected_count: 0,
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
    let availability: Availability = row.get(2)?;
    let inspection_status: InspectionStatus = row.get(3)?;
    let title: Option<String> = row.get(4)?;
    let artist: Option<String> = row.get(5)?;
    let album: Option<String> = row.get(6)?;
    let album_artist: Option<String> = row.get(7)?;
    let duration: Option<i64> = row.get(8)?;
    let content_hash: Option<String> = row.get(9)?;
    let mime_type: Option<String> = row.get(10)?;
    let relative_path: Option<String> = row.get(11)?;
    let file_format: Option<String> = row.get(13)?;
    let bit_depth: Option<i64> = row.get(14)?;
    let bitrate_kbps: Option<i64> = row.get(15)?;
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
        file_format: file_format.filter(|v| !v.trim().is_empty()),
        bit_depth: bit_depth.map(|v| v as u32),
        bitrate_kbps: bitrate_kbps.map(|v| v as u64),
        playable: availability == Availability::Available
            && inspection_status == InspectionStatus::Indexed,
        availability,
    })
}
fn scanning(state: &Arc<Mutex<LibraryScanSnapshot>>) -> bool {
    matches!(
        state.lock().expect("scan state lock").state,
        LibraryScanState::Running
    )
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
pub(crate) fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::playback::PlaybackSourceError;
    use std::sync::atomic::AtomicU64;
    use std::time::{Duration, Instant};

    static TEST_DATABASE_ID: AtomicU64 = AtomicU64::new(0);

    fn test_library() -> LibraryShared {
        let directory = std::env::temp_dir().join(format!(
            "nice-audio-player-library-service-{}-{}",
            std::process::id(),
            TEST_DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&directory).expect("test directory");
        LibraryShared::ready(
            Database::initialize(&directory).expect("test database"),
            Notifier::new(
                crate::events::null_event_sink(),
                BackendEvent::LibraryScanChanged,
            ),
        )
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

        let all = library
            .catalog_albums(
                None,
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("album page");
        assert_eq!(all.items.len(), 2);
        assert_eq!(all.total_count, 2);
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
            .catalog_albums(
                None,
                Some("Needle".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("search page");
        assert!(track_only.items.is_empty());
        let searched = library
            .catalog_albums(
                None,
                Some("Shared".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("album title search page");
        assert_eq!(searched.items.len(), 1);
        assert_eq!(searched.total_count, 1);
        assert_eq!(searched.items[0].key.title, "Shared");
        let literal = library
            .catalog_albums(
                None,
                Some("%".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("literal search page");
        assert_eq!(literal.items.len(), 1);
        assert_eq!(literal.items[0].key.title, "Other %_\\ album");
        for literal_term in ["_", "\\"] {
            let literal = library
                .catalog_albums(
                    None,
                    Some(literal_term.into()),
                    LibraryAlbumSortKey::Title,
                    LibrarySortDirection::Ascending,
                )
                .expect("literal catalog search");
            assert_eq!(literal.items.len(), 1);
            assert_eq!(literal.items[0].key.title, "Other %_\\ album");
        }

        let catalog = library
            .catalog_albums(
                None,
                Some("Album Artist".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
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
            .catalog_album_artists(
                None,
                None,
                LibraryAlbumArtistSortKey::Artist,
                LibrarySortDirection::Ascending,
            )
            .expect("catalog artists");
        assert_eq!(artists.items.len(), 2);
        assert_eq!(artists.total_count, 2);
        assert_eq!(artists.items[0].album_count, 1);
        assert_eq!(artists.items[0].track_count, 2);
        let artist_albums = library
            .catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Album Artist".into(),
                },
                None,
                LibraryArtistAlbumSortKey::Year,
                LibrarySortDirection::Ascending,
            )
            .expect("artist albums");
        assert_eq!(artist_albums.items.len(), 1);
        assert_eq!(artist_albums.total_count, 1);
        assert_eq!(artist_albums.items[0].key.title, "Shared");

        let details = library
            .catalog_album_details(LibraryAlbumKey {
                title: "Shared".into(),
                album_artist: "Album Artist".into(),
            })
            .expect("logical album details");
        assert_eq!(details.track_count, 2);
        let tracks = library
            .catalog_album_tracks(details.summary.key.clone(), None)
            .expect("logical album tracks");
        assert_eq!(tracks.items.len(), 2);
        assert!(library
            .catalog_albums(
                Some("not-json".into()),
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending
            )
            .is_err());
        assert!(matches!(
            library.playback_for_album(
                &LibraryAlbumKey {
                    title: " ".into(),
                    album_artist: "Album Artist".into(),
                },
                None,
            ),
            Err(PlaybackSourceError::InvalidAlbumKey)
        ));
        assert!(matches!(
            library.playback_for_album(
                &LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("3"),
            ),
            Err(PlaybackSourceError::TrackNotMember)
        ));
        assert!(matches!(
            library.playback_for_album(
                &LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("not-an-id"),
            ),
            Err(PlaybackSourceError::InvalidTrackId)
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
            library.playback_for_album(
                &LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                Some("1"),
            ),
            Err(PlaybackSourceError::TrackUnavailable)
        ));
        assert!(matches!(
            library.playback_for_album(
                &LibraryAlbumKey {
                    title: "Shared".into(),
                    album_artist: "Album Artist".into(),
                },
                None,
            ),
            Err(PlaybackSourceError::NoPlayableTracks)
        ));
    }

    #[test]
    fn playback_uses_filename_stem_when_metadata_title_is_empty() {
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

        let selection = library
            .playback_for_tracks(
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
                Some("1"),
            )
            .expect("playable title fixture");
        assert_eq!(selection.tracks[selection.start_index].title, "1");
        let track = &selection.tracks[selection.start_index];
        assert_eq!(
            track.album_key,
            Some(LibraryAlbumKey {
                title: "Album".into(),
                album_artist: "Artist".into(),
            })
        );
        assert_eq!(track.album_track_count, Some(1));
        let single = library.playback_for_track("1").expect("single track");
        assert_eq!(single.album_track_count, Some(1));
        let restored = library
            .playback_for_track_ids(&["1".to_owned(), "999".to_owned()], Some("1"))
            .expect("listed tracks");
        assert_eq!(restored.tracks.len(), 1, "unknown ids are left out");
    }

    #[test]
    fn tracks_playback_follows_the_list_order_and_skips_tracks_that_cannot_play() {
        let library = test_library();
        let root = std::env::temp_dir().join(format!(
            "nice-audio-player-library-tracks-playback-{}-{}",
            std::process::id(),
            TEST_DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).expect("playback root");
        for (id, title) in [(1, "Bravo"), (2, "Alpha"), (3, "Charlie"), (4, "Delta")] {
            std::fs::write(root.join(format!("{id}.wav")), []).expect("audio fixture");
            seed_track_at_root(
                &library,
                TrackSeed {
                    id,
                    title,
                    artist: "Artist",
                    album: "Album",
                    album_artist: "Artist",
                    disc_number: Some(1),
                    track_number: Some(id),
                    artwork_id: None,
                },
                1,
                &root,
            );
        }
        library
            .db()
            .expect("database")
            .write()
            .expect("database lock")
            .execute(
                "UPDATE library_files SET availability='missing' WHERE id=4",
                [],
            )
            .expect("mark one file missing");

        let selection = library
            .playback_for_tracks(
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Descending,
                Some("2"),
            )
            .expect("tracks playback");

        let titles: Vec<_> = selection.tracks.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(
            titles,
            ["Charlie", "Bravo", "Alpha"],
            "sorted as listed, missing skipped"
        );
        assert_eq!(selection.tracks[selection.start_index].track_id, "2");
        assert_eq!(selection.tracks[0].album.as_deref(), Some("Album"));
        assert_eq!(selection.tracks[0].album_artist.as_deref(), Some("Artist"));

        let filtered = library
            .playback_for_tracks(
                Some("alp"),
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
                None,
            )
            .expect("filtered tracks playback");
        assert_eq!(filtered.tracks.len(), 1);
        assert!(matches!(
            library.playback_for_tracks(
                Some("alp"),
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
                Some("1"),
            ),
            Err(PlaybackSourceError::TrackNotMember)
        ));
        assert!(matches!(
            library.playback_for_tracks(
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
                Some("4"),
            ),
            Err(PlaybackSourceError::TrackUnavailable)
        ));
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
            .catalog_tracks(
                None,
                Some("multi.part".into()),
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("stem search");
        assert_eq!(stem_match.items.len(), 1);
        assert_eq!(stem_match.total_count, 1);
        assert_eq!(stem_match.items[0].title, "multi.part");
        let extension_match = library
            .catalog_tracks(
                None,
                Some("flac".into()),
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("extension search");
        assert!(extension_match.items.is_empty());
        assert_eq!(extension_match.total_count, 0);
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
            .catalog_albums(
                None,
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("first catalog page");
        assert_eq!(first.items.len(), 100);
        assert_eq!(first.total_count, 106);
        let cursor = first.next_cursor.clone().expect("next cursor");
        let second = library
            .catalog_albums(
                Some(cursor.clone()),
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("second catalog page");
        assert_eq!(second.items.len(), 6);
        assert_eq!(second.total_count, 106);
        assert!(second.items[0].key.title > first.items[99].key.title);
        assert!(first.items.iter().all(|item| {
            !second.items.iter().any(|next| {
                next.key.title == item.key.title && next.key.album_artist == item.key.album_artist
            })
        }));
        assert!(matches!(
            library.catalog_albums(
                Some(cursor),
                Some("different".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending
            ),
            Err(LibraryCommandError::InvalidCursor)
        ));
        let artist_page = library
            .catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Artist".into(),
                },
                None,
                LibraryArtistAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("artist album page");
        let artist_cursor = artist_page.next_cursor.expect("artist continuation");
        assert!(matches!(
            library.catalog_artist_albums(
                LibraryAlbumArtistKey {
                    name: "Other artist".into(),
                },
                Some(artist_cursor),
                LibraryArtistAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            ),
            Err(LibraryCommandError::InvalidCursor)
        ));
        assert!(library
            .catalog_album_artists(
                None,
                Some("Artist".into()),
                LibraryAlbumArtistSortKey::Artist,
                LibrarySortDirection::Ascending
            )
            .is_ok());
        let artist = library
            .catalog_artist(LibraryAlbumArtistKey {
                name: "Artist".into(),
            })
            .expect("logical album artist detail");
        assert_eq!(artist.album_count, 105);
        assert_eq!(artist.track_count, 105);
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
            .catalog_albums(
                None,
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
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
        assert_eq!(
            library
                .catalog_artist(LibraryAlbumArtistKey {
                    name: "Fallback Artist".into(),
                })
                .expect("fallback artist track count")
                .track_count,
            1
        );
    }

    #[test]
    fn artwork_accent_is_computed_once_then_read_from_the_database() {
        use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
        let library = test_library();
        let hash = "d".repeat(64);
        let relative = format!("artwork/dd/{hash}.png");
        let data_dir = library.db().expect("database").data_dir().to_path_buf();
        let mut png = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(&[200, 40, 40].repeat(16), 4, 4, ExtendedColorType::Rgb8)
            .expect("encode artwork");
        std::fs::create_dir_all(data_dir.join("artwork/dd")).expect("artwork directory");
        std::fs::write(data_dir.join(&relative), &png).expect("artwork file");
        library
            .db()
            .expect("database")
            .write()
            .expect("database lock")
            .execute(
                "INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length,created_at_ms) VALUES(1,?1,'image/png',?2,1,0)",
                params![hash, relative],
            )
            .expect("artwork row");

        assert_eq!(
            library.artwork_accent(hash.clone()).expect("accent"),
            Some("#c82828".to_string())
        );
        std::fs::remove_file(data_dir.join(&relative)).expect("remove artwork file");
        assert_eq!(
            library.artwork_accent(hash).expect("cached accent"),
            Some("#c82828".to_string())
        );
        assert_eq!(
            library
                .artwork_accent("e".repeat(64))
                .expect("unknown hash"),
            None
        );
        assert!(matches!(
            library.artwork_accent("nope".into()),
            Err(LibraryCommandError::InvalidId)
        ));
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
            .catalog_album_artists(
                None,
                None,
                LibraryAlbumArtistSortKey::Artist,
                LibrarySortDirection::Ascending,
            )
            .expect("album artists");
        assert_eq!(artists.items.len(), 1);
        assert_eq!(artists.items[0].track_count, 2);
        assert!(artists.items[0].artwork.is_none());
        let artist = library
            .catalog_artist(LibraryAlbumArtistKey {
                name: "Artist".into(),
            })
            .expect("artist detail");
        assert_eq!(artist.track_count, 2);
        assert!(artist.artwork.is_none());
    }

    #[test]
    fn album_playback_resolves_complete_sequence_over_one_hundred_tracks() {
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

        let selection = library
            .playback_for_album(
                &LibraryAlbumKey {
                    title: "Long Album".into(),
                    album_artist: "Artist".into(),
                },
                Some("101"),
            )
            .expect("complete album playback sequence");
        assert_eq!(selection.tracks.len(), 101);
        assert_eq!(selection.start_index, 100);
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
                "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,tag_status,artwork_status,updated_at_ms) VALUES(?1,1,?2,'Artist',?3,'Artist',1,1,'loaded','notPresent',0)",
                params![id, format!("Track {id}"), format!("Album {id}")],
            )
            .expect("metadata");
        }
        tx.commit().expect("commit source tracks");
        let started = Instant::now();
        let albums = library
            .catalog_albums(
                None,
                None,
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("albums page");
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
                LibraryArtistAlbumSortKey::Year,
                LibrarySortDirection::Ascending,
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
                "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,tag_status,artwork_status,updated_at_ms) VALUES(?1,1,'Dense track','Dense artist',?2,'Dense artist',1,1,'loaded','notPresent',0)",
                params![id, format!("Dense Album {}", id % 20)],
            )
            .expect("dense metadata");
        }
        tx.commit().expect("commit dense tracks");
        let started = Instant::now();
        let dense = library
            .catalog_albums(
                None,
                Some("Dense".into()),
                LibraryAlbumSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .expect("dense albums page");
        let dense_elapsed = started.elapsed();
        assert_eq!(dense.items.len(), 20);
        assert!(
            dense_elapsed < Duration::from_secs(1),
            "dense query took {dense_elapsed:?}"
        );
    }
}
