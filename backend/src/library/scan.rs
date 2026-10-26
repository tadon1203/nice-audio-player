//! Scanning: discover the audio files of the registered directories, inspect the new or changed ones,
//! and persist the results. The work goes in batches. A batch is planned against the database read-only,
//! its new files are inspected in parallel with no transaction open, and the results are written in one
//! short transaction, so a failure or an abort never leaves a half-written batch and the write lock is
//! never held while files are read.
//!
//! The cover art of an album directory is read and stored once per batch, and every file of that
//! directory in the batch takes it. The albums are rebuilt every `REBUILD_EVERY_BATCHES` batches, when
//! a directory's walk ends, and when the scan ends (see `albums.rs`). When a scan completes, the files
//! that arrived are relinked to the Missing tracks they are, and the artwork no track uses is collected.

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, Instant, UNIX_EPOCH},
};

use blake3::Hasher;
use log::{error, info};
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};

use super::{
    ArtworkStatus, Availability, InspectionStatus, TagStatus, albums,
    artwork::{self, StoredArtwork},
    database::Database,
    media::{
        ArtworkRead, InspectedAudioFile, SourceMetadata, Undecodable, inspect_audio_file,
        is_supported_extension, read_source_metadata,
    },
    models::{LibraryDirectory, ScanFailure, ScanState, ScanStatus},
    text::{SortTags, TrackKeys, album_edition_of},
    version::LibraryVersion,
};
use crate::Result;
use crate::errors::{Error, contain};
use crate::threads::{Cancellation, run_in_background};

/// Files inspected per transaction.
const INSPECTIONS_PER_BATCH: usize = 100;
/// Files planned per transaction, however few of them need inspecting.
const FILES_PER_BATCH: usize = 1_000;
/// Batches written between two album rebuilds during a scan.
const REBUILD_EVERY_BATCHES: u32 = 20;
const MAX_INSPECTION_THREADS: usize = 4;
const PROGRESS_PUBLISH_INTERVAL: Duration = Duration::from_millis(200);
/// The share of the scan a scan can show before it ends: the rest is shown when it ends.
const MAX_PROGRESS: f32 = 0.99;
/// The length of the head and of the tail that are hashed to identify a file.
const SAMPLE_BYTES: u64 = 64 * 1024;

/// One directory to scan: all of it, or only the directories where something changed.
pub(crate) struct ScanJob {
    pub directory: LibraryDirectory,
    pub dirs: Option<Vec<PathBuf>>,
}

/// Why a scan stopped before finishing: the listener cancelled it, or a step failed.
enum Stop {
    Cancelled,
    Failed(Error),
}

impl From<Error> for Stop {
    fn from(cause: Error) -> Self {
        Self::Failed(cause)
    }
}

/// Scans `jobs` in order. `publish` receives the scan's state as it changes. Returns how the scan
/// ended; the state it ended with has already been published.
pub(crate) fn run(
    database: &Database,
    jobs: &[ScanJob],
    publish: &dyn Fn(ScanState),
    version: &LibraryVersion,
    cancel: &Cancellation,
) -> ScanStatus {
    let expected = expected_files(database, jobs);
    let mut progress = Progress::new(publish);
    progress.change(|scan| scan.expected_count = expected);
    let mut traversal_failed = false;
    for job in jobs {
        if cancel.is_cancelled() {
            return progress.finish(ScanStatus::Cancelled, None);
        }
        let directory = job.directory.clone();
        progress.change(|scan| scan.current_directory = Some(directory));
        match scan_directory(database, job, cancel, version, &mut progress) {
            Ok(complete) => traversal_failed |= !complete,
            Err(Stop::Cancelled) => return progress.finish(ScanStatus::Cancelled, None),
            Err(Stop::Failed(cause)) => {
                error!("library.scan.step_failed cause={cause}");
                return progress.finish(ScanStatus::Failed, Some(ScanFailure::Failed));
            }
        }
    }
    if traversal_failed {
        return progress.finish(ScanStatus::Failed, Some(ScanFailure::DirectoryUnreadable));
    }
    // Only once every directory has been seen in full is a Missing track known to be missing, and so
    // a file that arrived known to be that track moved.
    if let Err(cause) = relink_moved(database, version) {
        error!("library.scan.relink_failed cause={cause}");
        return progress.finish(ScanStatus::Failed, Some(ScanFailure::Failed));
    }
    if let Err(cause) = artwork::collect(database) {
        error!("library.scan.collect_failed cause={cause:?}");
    }
    progress.finish(ScanStatus::Completed, None)
}

/// How many files earlier scans left in `directories`: a rescan should find about as many again.
/// It only sizes the progress bar, so a failed read counts as 0 rather than failing the scan.
fn expected_files(database: &Database, jobs: &[ScanJob]) -> u64 {
    count_expected_files(database, jobs).unwrap_or_else(|cause| {
        error!("library.scan.expected_count_failed cause={cause}");
        0
    })
}

fn count_expected_files(database: &Database, jobs: &[ScanJob]) -> Result<u64> {
    let connection = database.read()?;
    let mut total = 0;
    for job in jobs.iter().filter(|job| job.dirs.is_none()) {
        let count = connection.query_row(
            "SELECT COUNT(*) FROM library_files WHERE directory_id=?1 AND availability='available'",
            [job.directory.id.rowid()],
            |row| row.get::<_, i64>(0),
        )?;
        total += u64::try_from(count).unwrap_or(0);
    }
    Ok(total)
}

/// Scans one directory. `Ok(false)` means the walk broke partway, so nothing is marked missing.
fn scan_directory(
    database: &Database,
    job: &ScanJob,
    cancel: &Cancellation,
    version: &LibraryVersion,
    progress: &mut Progress<'_>,
) -> Result<bool, Stop> {
    let directory = &job.directory;
    let directory_id = directory.id.rowid();
    let reader = database.read()?;
    let mut writer = LibraryWriter::new(database.write()?);
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
    let pass = Pass {
        directory,
        dirs,
        within,
        generation,
        data_dir: database.data_dir().to_path_buf(),
    };
    let walked = walk_directory(&reader, &mut writer, &pass, cancel, version, progress);
    // The albums are rebuilt even when the walk stopped early, so they match the tracks written so far.
    let settled = writer.settle_albums(version);
    let complete = walked?;
    settled?;
    Ok(complete)
}

/// What one pass over a directory covers.
struct Pass<'a> {
    directory: &'a LibraryDirectory,
    dirs: Vec<PathBuf>,
    /// The prefixes the walk covers, when it does not cover the whole directory.
    within: Option<Vec<String>>,
    generation: i64,
    data_dir: PathBuf,
}

fn walk_directory(
    reader: &Connection,
    writer: &mut LibraryWriter,
    pass: &Pass<'_>,
    cancel: &Cancellation,
    version: &LibraryVersion,
    progress: &mut Progress<'_>,
) -> Result<bool, Stop> {
    let directory_id = pass.directory.id.rowid();
    let mut walk = discover(&pass.directory.path, &pass.dirs);
    let mut complete = true;
    loop {
        let mut planned: Vec<Plan> = Vec::new();
        let mut to_inspect = 0;
        let mut exhausted = false;
        while to_inspect < INSPECTIONS_PER_BATCH && planned.len() < FILES_PER_BATCH {
            if cancel.is_cancelled() {
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
                    let plan = plan(reader, directory_id, file)?;
                    to_inspect += usize::from(matches!(plan, Plan::Inspect { .. }));
                    planned.push(plan);
                }
            }
        }
        let batch = read_batch(planned, &pass.data_dir, cancel, progress);
        writer.write_batch(directory_id, pass.generation, &batch.outcomes, version)?;
        if batch.cancelled {
            return Err(Stop::Cancelled);
        }
        if exhausted {
            break;
        }
    }
    if complete {
        writer.finish_directory(directory_id, pass.generation, pass.within.as_deref())?;
    } else {
        progress.failed();
    }
    Ok(complete)
}

fn relink_moved(database: &Database, version: &LibraryVersion) -> Result<usize> {
    let mut connection = database.write()?;
    let relinked = relink(&mut connection, version)?;
    if relinked > 0 {
        info!("library.scan.relinked count={relinked}");
    }
    Ok(relinked)
}

// Discovery: walk a directory and describe the supported audio files in it.

/// A supported audio file as the filesystem shows it right now.
#[derive(Debug, Clone)]
struct DiscoveredFile {
    path: PathBuf,
    /// Path below the directory, always with `/` separators.
    relative: String,
    file_name: String,
    /// Lowercase, without the dot.
    extension: String,
    byte_length: u64,
    /// Changes whenever the file is rewritten; equal keys mean "unchanged".
    modification_key: String,
}

enum Discovery {
    Found(DiscoveredFile),
    /// A supported file that could not be described. Counts as failed, and as discovered when
    /// `counted` (it got as far as being recognized).
    Unusable {
        counted: bool,
    },
    /// The walk itself broke, so the set of files seen is incomplete.
    WalkFailed,
}

/// The directories a scan of `directory` walks: the directory itself, or, for a scan that follows changes,
/// each changed path's directory (the nearest one that still exists), with directories inside
/// another one left out since walking that covers them.
fn scope(directory: &Path, changed: Option<&[PathBuf]>) -> Vec<PathBuf> {
    let Some(changed) = changed else {
        return vec![directory.to_path_buf()];
    };
    let mut dirs: Vec<PathBuf> = Vec::new();
    for path in changed {
        let mut dir = path.as_path();
        while !(dir.is_dir() && dir.starts_with(directory)) {
            match dir.parent() {
                Some(parent) if dir != directory => dir = parent,
                _ => {
                    dir = directory;
                    break;
                }
            }
        }
        if !dirs.iter().any(|known| dir.starts_with(known)) {
            dirs.retain(|known| !known.starts_with(dir));
            dirs.push(dir.to_path_buf());
        }
    }
    if dirs.is_empty() {
        dirs.push(directory.to_path_buf());
    }
    dirs
}

/// A directory below `directory` as `/`-separated relative text, `""` for the directory itself.
fn relative_dir(directory: &str, dir: &Path) -> String {
    dir.strip_prefix(directory)
        .ok()
        .and_then(|relative| relative.to_str())
        .map(|relative| relative.replace('\\', "/"))
        .unwrap_or_default()
}

/// Walks `dirs` (see [`scope`]) and describes the supported audio files in them.
fn discover<'a>(directory: &'a str, dirs: &[PathBuf]) -> impl Iterator<Item = Discovery> + 'a {
    let starts = dirs.to_vec();
    starts
        .into_iter()
        .flat_map(|start| walkdir::WalkDir::new(start).follow_links(false).into_iter())
        .filter_map(move |entry| {
            let Ok(entry) = entry else {
                return Some(Discovery::WalkFailed);
            };
            if !entry.file_type().is_file() {
                return None;
            }
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if !is_supported_extension(extension) {
                return None;
            }
            let Some(relative) = path
                .strip_prefix(directory)
                .ok()
                .and_then(|relative| relative.to_str())
                .map(|relative| relative.replace('\\', "/"))
            else {
                return Some(Discovery::Unusable { counted: false });
            };
            let Ok(metadata) = std::fs::metadata(path) else {
                return Some(Discovery::Unusable { counted: true });
            };
            let modification_key = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos().to_string())
                .unwrap_or_default();
            Some(Discovery::Found(DiscoveredFile {
                path: path.to_path_buf(),
                relative,
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_owned(),
                extension: extension.to_ascii_lowercase(),
                byte_length: metadata.len(),
                modification_key,
            }))
        })
}

// Planning: compare a discovered file with the database. Read-only.

/// What a discovered file needs, decided from what the database already holds.
#[derive(Debug)]
enum Plan {
    /// Unchanged: only record that it was seen, which makes it available again when it was Missing.
    Touch { file_id: i64 },
    /// Unchanged, but its artwork could not be stored last time.
    RetryArtwork {
        file_id: i64,
        revision: i64,
        file: DiscoveredFile,
    },
    /// New (`known` is `None`) or changed (`known` is its id and next revision).
    Inspect {
        known: Option<(i64, i64)>,
        file: DiscoveredFile,
    },
}

const SELECT_EXISTING_FILE: &str = "
    SELECT f.id, f.source_revision, f.modification_key, f.byte_length, f.inspection_status,
           m.artwork_status, f.availability
    FROM library_files f
    LEFT JOIN tracks t ON t.file_id = f.id
    LEFT JOIN track_source_metadata m ON m.track_id = t.id AND m.source_revision = f.source_revision
    WHERE f.directory_id = ?1 AND f.relative_path = ?2";

/// Compares a discovered file with the database. Read-only. A file is unchanged when its size
/// and modification time both are.
fn plan(reader: &Connection, directory_id: i64, file: DiscoveredFile) -> Result<Plan> {
    type Existing = (
        i64,
        i64,
        String,
        i64,
        InspectionStatus,
        Option<ArtworkStatus>,
        Availability,
    );
    let existing: Option<Existing> = reader
        .prepare_cached(SELECT_EXISTING_FILE)?
        .query_row(params![directory_id, file.relative], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })
        .optional()?;
    let unchanged = |key: &str, length: i64| {
        key == file.modification_key && u64::try_from(length).is_ok_and(|n| n == file.byte_length)
    };
    Ok(match existing {
        Some((
            file_id,
            revision,
            key,
            length,
            InspectionStatus::Indexed,
            Some(ArtworkStatus::StoreFailed),
            _,
        )) if unchanged(&key, length) => Plan::RetryArtwork {
            file_id,
            revision,
            file,
        },
        Some((file_id, _, key, length, _, _, _)) if unchanged(&key, length) => {
            Plan::Touch { file_id }
        }
        Some((file_id, revision, ..)) => Plan::Inspect {
            known: Some((file_id, revision + 1)),
            file,
        },
        None => Plan::Inspect { known: None, file },
    })
}

// Inspection: read everything a file has to tell, without touching the database.

/// The cover art of a file, after it was read and, when there was some, stored.
#[derive(Debug, Clone)]
struct ArtworkOutcome {
    status: ArtworkStatus,
    stored: Option<StoredArtwork>,
}

impl ArtworkOutcome {
    fn from_read(read: &ArtworkRead, data_dir: &Path) -> Self {
        let (status, stored) = match read {
            ArtworkRead::NotPresent => (ArtworkStatus::NotPresent, None),
            ArtworkRead::Unavailable => (ArtworkStatus::Unavailable, None),
            ArtworkRead::Invalid => (ArtworkStatus::Invalid, None),
            ArtworkRead::Selected { bytes, mime_type } => {
                match artwork::store(data_dir, bytes, *mime_type) {
                    Ok(stored) => (ArtworkStatus::Stored, Some(stored)),
                    Err(cause) => {
                        log::warn!("library.artwork.store_failed cause={cause}");
                        (ArtworkStatus::StoreFailed, None)
                    }
                }
            }
        };
        Self { status, stored }
    }
}

/// Reads the cover art of one file and stores it.
fn read_artwork(path: &Path, data_dir: &Path) -> ArtworkOutcome {
    let read = match contain("library.read_artwork", || read_source_metadata(path)) {
        Ok(Ok(Some(metadata))) => metadata.artwork,
        Ok(Ok(None)) => ArtworkRead::NotPresent,
        Ok(Err(_)) | Err(_) => ArtworkRead::Unavailable,
    };
    ArtworkOutcome::from_read(&read, data_dir)
}

struct InspectedFile {
    audio: InspectedAudioFile,
    tag_status: TagStatus,
    /// Empty when the file has no tags or they could not be read.
    tags: SourceMetadata,
    /// The cover of the file's album directory in the batch.
    artwork: ArtworkOutcome,
    bitrate_kbps: Option<i64>,
    /// `None` when the file could not be read for it.
    content_hash: Option<String>,
}

/// Reads a file. One that cannot be decoded is kept in the library but is not playable.
fn inspect(file: &DiscoveredFile, cover: &ArtworkOutcome) -> Result<InspectedFile, Undecodable> {
    let audio = inspect_audio_file(&file.path, &file.extension)?;
    let (tag_status, tags) = match read_source_metadata(&file.path) {
        Ok(Some(tags)) => (TagStatus::Loaded, tags),
        Ok(None) => (TagStatus::Absent, SourceMetadata::default()),
        Err(_) => (TagStatus::Failed, SourceMetadata::default()),
    };
    Ok(InspectedFile {
        bitrate_kbps: average_bitrate_kbps(file.byte_length, audio.info.duration_ms)
            .map(|value| value as i64),
        artwork: cover.clone(),
        content_hash: content_hash(&file.path).ok(),
        audio,
        tag_status,
        tags,
    })
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

/// The hash of a file's first and last `SAMPLE_BYTES` (all of it when it is shorter than two
/// samples), together with its length. A file moved or renamed keeps it; any rewrite that
/// changes either end, a retag included, does not.
pub(crate) fn content_hash(path: &Path) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path)?;
    let length = file.metadata()?.len();
    let mut hasher = Hasher::new();
    hasher.update(&length.to_le_bytes());
    let mut buffer = Vec::new();
    if length <= SAMPLE_BYTES * 2 {
        file.read_to_end(&mut buffer)?;
    } else {
        buffer.resize(SAMPLE_BYTES as usize, 0);
        file.read_exact(&mut buffer)?;
        hasher.update(&buffer);
        file.seek(SeekFrom::End(-(SAMPLE_BYTES as i64)))?;
        file.read_exact(&mut buffer)?;
    }
    hasher.update(&buffer);
    Ok(hasher.finalize().to_hex().to_string())
}

/// Runs `work` over `items` on up to `MAX_INSPECTION_THREADS` threads and keeps their order. An entry
/// is `None` when the scan was cancelled before its item was reached, or when `work` gave up on it.
fn parallel<T: Sync, R: Send>(
    items: &[T],
    cancel: &Cancellation,
    work: impl Fn(&T) -> Option<R> + Sync,
) -> Vec<Option<R>> {
    let results: Vec<Mutex<Option<R>>> = items.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism()
        .map_or(1, usize::from)
        .min(MAX_INSPECTION_THREADS)
        .min(items.len());
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                run_in_background();
                loop {
                    if cancel.is_cancelled() {
                        return;
                    }
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(item) = items.get(index) else {
                        return;
                    };
                    if let Some(result) = work(item) {
                        *results[index].lock() = Some(result);
                    }
                }
            });
        }
    });
    results.into_iter().map(Mutex::into_inner).collect()
}

/// The directory a file is filed in, which is the album directory for the cover art.
fn album_directory(file: &DiscoveredFile) -> &Path {
    file.path.parent().unwrap_or_else(|| Path::new(""))
}

/// The cover of each album directory in a batch: the artwork of its first file, read and stored once.
fn album_covers(
    files: &[DiscoveredFile],
    data_dir: &Path,
    cancel: &Cancellation,
) -> HashMap<PathBuf, ArtworkOutcome> {
    let mut seen = HashSet::new();
    let firsts: Vec<&DiscoveredFile> = files
        .iter()
        .filter(|file| seen.insert(album_directory(file)))
        .collect();
    parallel(&firsts, cancel, |file| {
        Some((
            album_directory(file).to_path_buf(),
            read_artwork(&file.path, data_dir),
        ))
    })
    .into_iter()
    .flatten()
    .collect()
}

/// Inspects `files` in parallel. An entry is `None` when the scan was cancelled before its file was reached.
fn inspect_all(
    files: &[DiscoveredFile],
    covers: &HashMap<PathBuf, ArtworkOutcome>,
    cancel: &Cancellation,
) -> Vec<Option<Result<InspectedFile, Undecodable>>> {
    parallel(files, cancel, |file| {
        let cover = covers.get(album_directory(file))?;
        // A file that panics a parser is a file that cannot be read, not a dead scan.
        Some(contain("library.inspect", || inspect(file, cover)).unwrap_or(Err(Undecodable)))
    })
}

// Writing: one short transaction per batch.

/// A planned file with what was read for it.
enum Outcome {
    Touch {
        file_id: i64,
    },
    RetryArtwork {
        file_id: i64,
        revision: i64,
        artwork: ArtworkOutcome,
    },
    Inspected {
        known: Option<(i64, i64)>,
        file: DiscoveredFile,
        result: Box<Result<InspectedFile, Undecodable>>,
    },
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
    cancel: &Cancellation,
    progress: &mut Progress<'_>,
) -> ReadBatch {
    let to_inspect: Vec<DiscoveredFile> = planned
        .iter()
        .filter_map(|plan| match plan {
            Plan::Inspect { file, .. } => Some(file.clone()),
            _ => None,
        })
        .collect();
    let covers = album_covers(&to_inspect, data_dir, cancel);
    let mut inspections = inspect_all(&to_inspect, &covers, cancel).into_iter();
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

const INSERT_FILE: &str = "
    INSERT INTO library_files(directory_id, relative_path, file_name, extension, modification_key,
                              source_revision, seen_generation, availability, inspection_status,
                              byte_length, content_hash, relink_pending)
    VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?9, ?10, ?11)";

const REVISE_FILE: &str = "
    UPDATE library_files
    SET modification_key = ?2, source_revision = ?3, seen_generation = ?4, availability = ?5,
        inspection_status = ?6, byte_length = ?7, content_hash = ?8
    WHERE id = ?1";

const TOUCH_FILE: &str = "
    UPDATE library_files SET seen_generation = ?2, availability = ?3 WHERE id = ?1";

const UPSERT_SOURCE_METADATA: &str = "
    INSERT INTO track_source_metadata(
        track_id, source_revision, tag_title, tag_artist, tag_album, tag_album_artist,
        track_number, track_total, disc_number, disc_total, genre, date, duration_ms, file_format,
        codec, sample_rate, channel_count, bit_depth, bitrate_kbps, tag_status, artwork_status,
        artwork_hash, title, artist, album, album_artist, year, title_sort, artist_sort, album_sort,
        album_artist_sort, search_text, album_id, album_directory_id, album_relative_dir)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
            ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35)
    ON CONFLICT(track_id) DO UPDATE SET
        source_revision = excluded.source_revision, tag_title = excluded.tag_title,
        tag_artist = excluded.tag_artist, tag_album = excluded.tag_album,
        tag_album_artist = excluded.tag_album_artist,
        track_number = excluded.track_number, track_total = excluded.track_total,
        disc_number = excluded.disc_number, disc_total = excluded.disc_total,
        genre = excluded.genre, date = excluded.date, duration_ms = excluded.duration_ms,
        file_format = excluded.file_format, codec = excluded.codec,
        sample_rate = excluded.sample_rate, channel_count = excluded.channel_count,
        bit_depth = excluded.bit_depth, bitrate_kbps = excluded.bitrate_kbps,
        tag_status = excluded.tag_status, artwork_status = excluded.artwork_status,
        artwork_hash = excluded.artwork_hash, title = excluded.title,
        artist = excluded.artist, album = excluded.album,
        album_artist = excluded.album_artist, year = excluded.year,
        title_sort = excluded.title_sort, artist_sort = excluded.artist_sort,
        album_sort = excluded.album_sort, album_artist_sort = excluded.album_artist_sort,
        search_text = excluded.search_text, album_id = excluded.album_id,
        album_directory_id = excluded.album_directory_id,
        album_relative_dir = excluded.album_relative_dir";

struct LibraryWriter {
    connection: Connection,
    /// Batches written since the albums were last rebuilt.
    batches_since_rebuild: u32,
    /// Whether the tracks changed since the albums were last rebuilt.
    albums_stale: bool,
}

impl LibraryWriter {
    fn new(connection: Connection) -> Self {
        Self {
            connection,
            batches_since_rebuild: 0,
            albums_stale: false,
        }
    }

    /// Starts a new pass over a directory and returns its generation number.
    fn begin_scan(&self, directory_id: i64) -> Result<i64> {
        Ok(self.connection.query_row(
            "UPDATE directories SET scan_generation = scan_generation + 1
             WHERE id = ?1 RETURNING scan_generation",
            params![directory_id],
            |row| row.get(0),
        )?)
    }

    /// Writes a batch in one transaction, so a failure never leaves half of it behind. Every
    /// `REBUILD_EVERY_BATCHES` batches, the albums are rebuilt in the same transaction.
    fn write_batch(
        &mut self,
        directory_id: i64,
        generation: i64,
        outcomes: &[Outcome],
        version: &LibraryVersion,
    ) -> Result<()> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let directory_path: String = transaction.query_row(
            "SELECT path FROM directories WHERE id = ?1",
            params![directory_id],
            |row| row.get(0),
        )?;
        for outcome in outcomes {
            match outcome {
                Outcome::Touch { file_id, .. } => touch(&transaction, *file_id, generation)?,
                Outcome::RetryArtwork {
                    file_id,
                    revision,
                    artwork,
                } => {
                    touch(&transaction, *file_id, generation)?;
                    apply_artwork(&transaction, *file_id, *revision, artwork)?;
                }
                Outcome::Inspected {
                    known,
                    file,
                    result,
                } => store_file(
                    &transaction,
                    (directory_id, &directory_path),
                    generation,
                    *known,
                    file,
                    result,
                )?,
            }
        }
        self.albums_stale = true;
        self.batches_since_rebuild += 1;
        let rebuilt = self.batches_since_rebuild >= REBUILD_EVERY_BATCHES;
        if rebuilt {
            albums::rebuild(&transaction)?;
        }
        transaction.commit()?;
        if rebuilt {
            self.batches_since_rebuild = 0;
            self.albums_stale = false;
            version.bump();
        }
        Ok(())
    }

    /// Rebuilds the albums if the tracks changed since they were last rebuilt.
    fn settle_albums(&mut self, version: &LibraryVersion) -> Result<()> {
        if !self.albums_stale {
            return Ok(());
        }
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        albums::rebuild(&transaction)?;
        transaction.commit()?;
        self.albums_stale = false;
        self.batches_since_rebuild = 0;
        version.bump();
        Ok(())
    }

    /// After a complete pass: files not seen this generation are missing (kept, not deleted).
    /// A pass over only some directories (`within`, as `/`-terminated relative prefixes, `""`
    /// for the whole directory) marks only the files in them. Returns how many files became Missing.
    fn finish_directory(
        &self,
        directory_id: i64,
        generation: i64,
        within: Option<&[String]>,
    ) -> Result<u64> {
        let mut gone = 0;
        let whole = [String::new()];
        for prefix in within.unwrap_or(&whole) {
            gone += self.connection.execute(
                "UPDATE library_files SET availability = ?3
                 WHERE directory_id = ?1 AND seen_generation < ?2 AND availability <> ?3
                   AND substr(relative_path, 1, length(?4)) = ?4",
                params![directory_id, generation, Availability::Missing, prefix],
            )? as u64;
        }
        if within.is_none() {
            self.connection.execute(
                "UPDATE directories SET last_successful_scan_at_ms = ?2 WHERE id = ?1",
                params![directory_id, crate::library::now_ms()],
            )?;
        }
        Ok(gone)
    }
}

fn touch(transaction: &Transaction<'_>, file_id: i64, generation: i64) -> Result<()> {
    transaction.prepare_cached(TOUCH_FILE)?.execute(params![
        file_id,
        generation,
        Availability::Available
    ])?;
    Ok(())
}

/// Stores a file that was read: it becomes playable (or, when it cannot be decoded, stays listed
/// as unsupported), and its track keeps its identity across revisions.
fn store_file(
    transaction: &Transaction<'_>,
    (directory_id, directory_path): (i64, &str),
    generation: i64,
    known: Option<(i64, i64)>,
    file: &DiscoveredFile,
    result: &Result<InspectedFile, Undecodable>,
) -> Result<()> {
    let status = match result {
        Ok(_) => InspectionStatus::Indexed,
        Err(Undecodable) => InspectionStatus::Unsupported,
    };
    let content_hash = result
        .as_ref()
        .ok()
        .and_then(|inspected| inspected.content_hash.as_deref());
    let (file_id, revision) = if let Some((file_id, revision)) = known {
        transaction.execute(
            REVISE_FILE,
            params![
                file_id,
                file.modification_key,
                revision,
                generation,
                Availability::Available,
                status,
                file.byte_length as i64,
                content_hash
            ],
        )?;
        (file_id, revision)
    } else {
        transaction.execute(
            INSERT_FILE,
            params![
                directory_id,
                file.relative,
                file.file_name,
                file.extension,
                file.modification_key,
                generation,
                Availability::Available,
                status,
                file.byte_length as i64,
                content_hash,
                result.is_ok()
            ],
        )?;
        (transaction.last_insert_rowid(), 1)
    };
    match result {
        Ok(inspected) => store_inspected(
            transaction,
            file_id,
            revision,
            (directory_id, directory_path, file),
            inspected,
        ),
        Err(Undecodable) => clear_metadata(transaction, file_id, revision, directory_id, file),
    }
}

fn store_inspected(
    transaction: &Transaction<'_>,
    file_id: i64,
    revision: i64,
    (directory_id, directory_path, file): (i64, &str, &DiscoveredFile),
    inspected: &InspectedFile,
) -> Result<()> {
    transaction.execute(
        "INSERT OR IGNORE INTO tracks(file_id) VALUES (?1)",
        params![file_id],
    )?;
    let track_id: i64 = transaction.query_row(
        "SELECT id FROM tracks WHERE file_id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    let artwork_hash = store_artwork(transaction, &inspected.artwork)?;
    let tags = &inspected.tags;
    let info = &inspected.audio.info;
    let keys = TrackKeys::build(
        [
            tags.title.as_deref(),
            tags.artist.as_deref(),
            tags.album.as_deref(),
            tags.album_artist.as_deref(),
        ],
        tags.date.as_deref(),
        &file.file_name,
        SortTags {
            title: tags.title_sort.as_deref(),
            artist: tags.artist_sort.as_deref(),
            album: tags.album_sort.as_deref(),
            album_artist: tags.album_artist_sort.as_deref(),
        },
        &album_edition_of(&file.relative),
        directory_path,
    );
    transaction.execute(
        UPSERT_SOURCE_METADATA,
        params![
            track_id,
            revision,
            tags.title,
            tags.artist,
            tags.album,
            tags.album_artist,
            tags.track_number.map(i64::from),
            tags.track_total.map(i64::from),
            tags.disc_number.map(i64::from),
            tags.disc_total.map(i64::from),
            tags.genre,
            tags.date,
            info.duration_ms.map(|value| value as i64),
            file.extension,
            format!("{:?}", info.codec),
            info.sample_rate,
            info.channel_count,
            inspected.audio.bit_depth,
            inspected.bitrate_kbps,
            inspected.tag_status,
            inspected.artwork.status,
            artwork_hash,
            keys.title,
            keys.artist,
            keys.album,
            keys.album_artist,
            keys.year,
            keys.title_sort,
            keys.artist_sort,
            keys.album_sort,
            keys.album_artist_sort,
            keys.search,
            keys.album_id,
            directory_id,
            keys.album_relative_dir,
        ],
    )?;
    Ok(())
}

/// A file that was indexed and can no longer be decoded keeps its track, with the tags of its
/// earlier revision cleared so they are not shown for the file it is now.
fn clear_metadata(
    transaction: &Transaction<'_>,
    file_id: i64,
    revision: i64,
    directory_id: i64,
    file: &DiscoveredFile,
) -> Result<()> {
    let keys = TrackKeys::new(None, None, None, None, None, &file.file_name);
    transaction.execute(
        "UPDATE track_source_metadata
         SET source_revision = ?2, tag_title = NULL, tag_artist = NULL, tag_album = NULL,
             tag_album_artist = NULL,
             track_number = NULL, track_total = NULL, disc_number = NULL, disc_total = NULL,
             genre = NULL, date = NULL, duration_ms = NULL, file_format = NULL, codec = NULL,
             sample_rate = NULL, channel_count = NULL, bit_depth = NULL, bitrate_kbps = NULL,
             tag_status = ?3, artwork_status = ?4, artwork_hash = NULL,
             title = ?5, artist = '', album = '', album_artist = '', year = NULL,
             title_sort = ?6, artist_sort = '', album_sort = '', album_artist_sort = '',
             search_text = ?7, album_id = ?8, album_directory_id = ?9, album_relative_dir = ''
         WHERE track_id = (SELECT id FROM tracks WHERE file_id = ?1)",
        params![
            file_id,
            revision,
            TagStatus::Absent,
            ArtworkStatus::NotPresent,
            keys.title,
            keys.title_sort,
            keys.search,
            keys.album_id,
            directory_id
        ],
    )?;
    Ok(())
}

fn apply_artwork(
    transaction: &Transaction<'_>,
    file_id: i64,
    revision: i64,
    artwork: &ArtworkOutcome,
) -> Result<()> {
    let track_id: i64 = transaction.query_row(
        "SELECT id FROM tracks WHERE file_id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    let artwork_hash = store_artwork(transaction, artwork)?;
    transaction.execute(
        "UPDATE track_source_metadata SET artwork_status = ?3, artwork_hash = ?4
         WHERE track_id = ?1 AND source_revision = ?2",
        params![track_id, revision, artwork.status, artwork_hash],
    )?;
    Ok(())
}

/// Records the stored artwork and returns its hash. Identical images share one row.
fn store_artwork(
    transaction: &Transaction<'_>,
    artwork: &ArtworkOutcome,
) -> Result<Option<String>> {
    match (&artwork.status, &artwork.stored) {
        (ArtworkStatus::Stored, Some(stored)) => {
            transaction.execute(
                "INSERT INTO artwork(hash, mime, has_thumbnail, byte_length) VALUES(?1, ?2, ?3, ?4)
                 ON CONFLICT(hash) DO NOTHING",
                params![
                    stored.hash.as_str(),
                    stored.mime_type,
                    stored.has_thumbnail,
                    stored.byte_length as i64
                ],
            )?;
            Ok(Some(stored.hash.as_str().to_owned()))
        }
        _ => Ok(None),
    }
}

// Relinking: a file that arrived is the Missing track it has the content of.

/// What identifies a file's track beyond where the file is: its size and the hash of its head and tail.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Identity {
    file_id: i64,
    track_id: i64,
    byte_length: i64,
    content_hash: Option<String>,
}

fn identities(connection: &Connection, condition: &str) -> rusqlite::Result<Vec<Identity>> {
    connection
        .prepare(&format!(
            "SELECT f.id, t.id, f.byte_length, f.content_hash
             FROM library_files f
             JOIN tracks t ON t.file_id = f.id
             WHERE {condition} ORDER BY f.id"
        ))?
        .query_map([], |row| {
            Ok(Identity {
                file_id: row.get(0)?,
                track_id: row.get(1)?,
                byte_length: row.get(2)?,
                content_hash: row.get(3)?,
            })
        })?
        .collect()
}

/// Pairs each arrived file with the one Missing track it has the content of: the same size and the same
/// content hash. A hash that matches several Missing tracks pairs with none, since they cannot be told
/// apart. A Missing track pairs at most once.
fn pair_moves<'a>(
    arrived: &'a [Identity],
    missing: &'a [Identity],
) -> Vec<(&'a Identity, &'a Identity)> {
    let mut claimed = vec![false; missing.len()];
    let mut pairs = Vec::new();
    for file in arrived {
        let Some(hash) = &file.content_hash else {
            continue;
        };
        let candidates: Vec<usize> = missing
            .iter()
            .enumerate()
            .filter(|(at, candidate)| {
                !claimed[*at]
                    && candidate.byte_length == file.byte_length
                    && candidate.content_hash.as_ref() == Some(hash)
            })
            .map(|(at, _)| at)
            .collect();
        if let [only] = candidates.as_slice() {
            claimed[*only] = true;
            pairs.push((file, &missing[*only]));
        }
    }
    pairs
}

/// Relinks what arrived since the last complete scan, then forgets that it arrived. Returns how
/// many Missing tracks were found again. One transaction: a failure relinks nothing.
fn relink(connection: &mut Connection, version: &LibraryVersion) -> Result<usize> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let arrived = identities(
        &transaction,
        "f.relink_pending = 1 AND f.availability = 'available'",
    )?;
    let missing = if arrived.is_empty() {
        Vec::new()
    } else {
        identities(&transaction, "f.availability = 'missing'")?
    };
    let pairs = pair_moves(&arrived, &missing);
    for &(new, old) in &pairs {
        // The old track takes over the new file and its freshly read tags; the new track, which
        // nothing refers to yet, and the old file row go.
        transaction.execute(
            "DELETE FROM track_source_metadata WHERE track_id = ?1",
            params![old.track_id],
        )?;
        transaction.execute(
            "UPDATE track_source_metadata SET track_id = ?1 WHERE track_id = ?2",
            params![old.track_id, new.track_id],
        )?;
        transaction.execute("DELETE FROM tracks WHERE id = ?1", params![new.track_id])?;
        transaction.execute(
            "UPDATE tracks SET file_id = ?1 WHERE id = ?2",
            params![new.file_id, old.track_id],
        )?;
        transaction.execute(
            "DELETE FROM library_files WHERE id = ?1",
            params![old.file_id],
        )?;
    }
    transaction.execute(
        "UPDATE library_files SET relink_pending = 0 WHERE relink_pending = 1",
        [],
    )?;
    if !pairs.is_empty() {
        albums::rebuild(&transaction)?;
    }
    transaction.commit()?;
    if !pairs.is_empty() {
        version.bump();
    }
    Ok(pairs.len())
}

// Progress: counts what the scan has done, and publishes it.

/// Counts what the scan has done, and publishes it. The scan thread is the only writer while a
/// scan runs, so `scan` is its own copy of the state.
struct Progress<'a> {
    publish: &'a dyn Fn(ScanState),
    scan: ScanState,
    last_publish: Instant,
}

impl<'a> Progress<'a> {
    fn new(publish: &'a dyn Fn(ScanState)) -> Self {
        Self {
            publish,
            scan: ScanState {
                status: ScanStatus::Running,
                ..ScanState::idle()
            },
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
        self.scan.progress = share(&self.scan);
        (self.publish)(self.scan.clone());
        self.last_publish = Instant::now();
    }

    /// Ends the scan with `outcome` and publishes the final state.
    fn finish(&mut self, outcome: ScanStatus, failure: Option<ScanFailure>) -> ScanStatus {
        self.change(|scan| {
            scan.status = outcome;
            scan.current_directory = None;
            scan.failure = failure;
        });
        let counts = format!(
            "discovered_count={} inspected_count={} indexed_count={} failed_count={}",
            self.scan.discovered_count,
            self.scan.inspected_count,
            self.scan.indexed_count,
            self.scan.failed_count
        );
        match self.scan.status {
            ScanStatus::Completed => info!("library.scan.completed {counts}"),
            ScanStatus::Cancelled => info!("library.scan.cancelled {counts}"),
            ScanStatus::Failed => error!(
                "library.scan.failed {counts} failure={:?}",
                self.scan.failure
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

    fn failed(&mut self) {
        self.count(|scan| scan.failed_count += 1);
    }
}

/// The share of the scan done: the files found against the files the last scan of these directories
/// found. A first scan has nothing to compare with, so its share is unknown until it ends (`None`),
/// except before its first file, which is 0.
fn share(scan: &ScanState) -> Option<f32> {
    if scan.expected_count > 0 {
        let found = scan.discovered_count as f32 / scan.expected_count as f32;
        Some(found.min(MAX_PROGRESS))
    } else if scan.inspected_count == 0 {
        Some(0.0)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(file_id: i64, length: i64, hash: Option<&str>) -> Identity {
        Identity {
            file_id,
            track_id: file_id,
            byte_length: length,
            content_hash: hash.map(str::to_owned),
        }
    }

    /// The (new, old) file IDs of each pair.
    fn file_ids(pairs: &[(&Identity, &Identity)]) -> Vec<(i64, i64)> {
        pairs
            .iter()
            .map(|(new, old)| (new.file_id, old.file_id))
            .collect()
    }

    #[test]
    fn a_file_pairs_with_the_missing_track_of_the_same_size_and_content() {
        let missing = [identity(1, 10, Some("h")), identity(3, 10, Some("other"))];
        let arrived = [identity(9, 10, Some("h"))];
        assert_eq!(file_ids(&pair_moves(&arrived, &missing)), vec![(9, 1)]);

        let resized = [identity(9, 11, Some("h"))];
        assert!(pair_moves(&resized, &missing).is_empty(), "size differs");
    }

    #[test]
    fn a_content_hash_shared_by_two_missing_tracks_pairs_with_neither() {
        let missing = [identity(1, 10, Some("h")), identity(2, 10, Some("h"))];
        let arrived = [identity(9, 10, Some("h"))];
        assert_eq!(pair_moves(&arrived, &missing), Vec::new());
    }

    #[test]
    fn a_missing_track_is_claimed_once() {
        let missing = [identity(1, 10, Some("h"))];
        let arrived = [identity(8, 10, Some("h")), identity(9, 10, Some("h"))];
        assert_eq!(file_ids(&pair_moves(&arrived, &missing)), vec![(8, 1)]);
    }

    #[test]
    fn average_bitrate_is_rounded_and_absent_without_a_duration() {
        assert_eq!(average_bitrate_kbps(1_000_000, Some(8_000)), Some(1_000));
        assert_eq!(average_bitrate_kbps(1_000_000, Some(0)), None);
        assert_eq!(average_bitrate_kbps(1_000_000, None), None);
    }

    #[test]
    fn the_hash_follows_the_content_not_the_name_and_ignores_the_middle() {
        let directory = crate::test_support::TestDirectory::new();
        let mut bytes = vec![7u8; 300_000];
        let a = directory.file("a.bin");
        std::fs::write(&a, &bytes).unwrap();
        let renamed = directory.file("b.bin");
        std::fs::copy(&a, &renamed).unwrap();
        bytes[150_000] = 9;
        let middle = directory.file("c.bin");
        std::fs::write(&middle, &bytes).unwrap();
        bytes[10] = 9;
        let head = directory.file("d.bin");
        std::fs::write(&head, &bytes).unwrap();

        assert_eq!(content_hash(&a).unwrap(), content_hash(&renamed).unwrap());
        assert_eq!(content_hash(&a).unwrap(), content_hash(&middle).unwrap());
        assert_ne!(content_hash(&a).unwrap(), content_hash(&head).unwrap());
    }

    #[test]
    fn short_files_are_hashed_whole_and_the_length_counts() {
        let directory = crate::test_support::TestDirectory::new();
        let (one, two) = (directory.file("1"), directory.file("2"));
        std::fs::write(&one, [1u8, 2, 3]).unwrap();
        std::fs::write(&two, [1u8, 2, 3, 4]).unwrap();
        assert_ne!(content_hash(&one).unwrap(), content_hash(&two).unwrap());
    }

    #[test]
    fn progress_is_the_share_of_the_expected_files_found() {
        let mut scan = ScanState::idle();
        scan.expected_count = 200;
        scan.discovered_count = 50;
        assert_eq!(share(&scan), Some(0.25));
        scan.discovered_count = 500;
        assert_eq!(
            share(&scan),
            Some(MAX_PROGRESS),
            "capped until the scan ends"
        );

        scan.expected_count = 0;
        scan.inspected_count = 0;
        assert_eq!(share(&scan), Some(0.0));
        scan.inspected_count = 5;
        assert_eq!(share(&scan), None, "a first scan's share is unknown");
    }
}
