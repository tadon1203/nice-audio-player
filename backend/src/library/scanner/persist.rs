//! The scanner's database work. Planning a batch only reads. Writing it is one short transaction
//! that holds the write lock for the writes alone, never while files are being read.

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};

use super::discover::DiscoveredFile;
use super::inspect::{ArtworkOutcome, InspectedFile};
use crate::library::database::DatabaseError;
use crate::library::keys::{album_edition_of, SortTags, TrackKeys};
use crate::library::status::{ArtworkStatus, Availability, InspectionStatus, TagStatus};
use crate::library::summary::{self, Touched};
use crate::media::inspection::Undecodable;

const SELECT_EXISTING_FILE: &str = "
    SELECT f.id, f.source_revision, f.modification_key, f.byte_length, f.inspection_status,
           m.artwork_status, f.availability
    FROM library_files f
    LEFT JOIN tracks t ON t.file_id = f.id
    LEFT JOIN track_source_metadata m ON m.track_id = t.id AND m.source_revision = f.source_revision
    WHERE f.root_id = ?1 AND f.relative_path = ?2";

const TOUCH_FILE: &str = "
    UPDATE library_files SET seen_generation = ?2, availability = ?3 WHERE id = ?1";

const REVISE_FILE: &str = "
    UPDATE library_files
    SET modification_key = ?2, source_revision = ?3, seen_generation = ?4, availability = ?5,
        inspection_status = ?6, byte_length = ?7, content_hash = ?8
    WHERE id = ?1";

const INSERT_FILE: &str = "
    INSERT INTO library_files(root_id, relative_path, file_name, extension, modification_key,
                              source_revision, seen_generation, availability, inspection_status,
                              byte_length, content_hash, relink_pending)
    VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ?9, ?10, ?11)";

const UPSERT_ARTWORK_ASSET: &str = "
    INSERT INTO artwork_assets(content_hash, mime_type, relative_path, byte_length)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(content_hash) DO UPDATE SET content_hash = excluded.content_hash
    RETURNING id";

const UPSERT_SOURCE_METADATA: &str = "
    INSERT INTO track_source_metadata(
        track_id, source_revision, title, artist, album, album_artist, track_number, track_total,
        disc_number, disc_total, genre, date, duration_ms, file_format, codec, sample_rate,
        channel_count, bit_depth, bitrate_kbps, tag_status, artwork_status, artwork_id,
        title_key, artist_key, album_key, album_artist_key, year, title_sort, artist_sort,
        album_sort, album_artist_sort, search_key, album_dir)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
            ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33)
    ON CONFLICT(track_id) DO UPDATE SET
        source_revision = excluded.source_revision, title = excluded.title,
        artist = excluded.artist, album = excluded.album, album_artist = excluded.album_artist,
        track_number = excluded.track_number, track_total = excluded.track_total,
        disc_number = excluded.disc_number, disc_total = excluded.disc_total,
        genre = excluded.genre, date = excluded.date, duration_ms = excluded.duration_ms,
        file_format = excluded.file_format, codec = excluded.codec,
        sample_rate = excluded.sample_rate, channel_count = excluded.channel_count,
        bit_depth = excluded.bit_depth, bitrate_kbps = excluded.bitrate_kbps,
        tag_status = excluded.tag_status, artwork_status = excluded.artwork_status,
        artwork_id = excluded.artwork_id, title_key = excluded.title_key,
        artist_key = excluded.artist_key, album_key = excluded.album_key,
        album_artist_key = excluded.album_artist_key, year = excluded.year,
        title_sort = excluded.title_sort, artist_sort = excluded.artist_sort,
        album_sort = excluded.album_sort, album_artist_sort = excluded.album_artist_sort,
        search_key = excluded.search_key, album_dir = excluded.album_dir";

/// Any database failure. The scan stops on it; the cause is logged where it is built and stays
/// out of the IPC surface.
#[derive(Debug)]
pub(super) struct PersistError;

impl From<rusqlite::Error> for PersistError {
    fn from(cause: rusqlite::Error) -> Self {
        log::error!("library.scan.persist_failed cause={cause}");
        Self
    }
}

impl From<DatabaseError> for PersistError {
    fn from(cause: DatabaseError) -> Self {
        log::error!("library.scan.persist_failed cause={cause:?}");
        Self
    }
}

type Persisted<T> = Result<T, PersistError>;

/// What a discovered file needs, decided from what the database already holds.
#[derive(Debug)]
pub(super) enum Plan {
    /// Unchanged: only record that it was seen (and that it is back, when it was Missing).
    Touch { file_id: i64, was_missing: bool },
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

/// Compares a discovered file with the database. Read-only. A file is unchanged when its size
/// and modification time both are.
pub(super) fn plan(reader: &Connection, root_id: i64, file: DiscoveredFile) -> Persisted<Plan> {
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
        .query_row(params![root_id, file.relative], |row| {
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
        Some((file_id, _, key, length, _, _, availability)) if unchanged(&key, length) => {
            Plan::Touch {
                file_id,
                was_missing: availability == Availability::Missing,
            }
        }
        Some((file_id, revision, ..)) => Plan::Inspect {
            known: Some((file_id, revision + 1)),
            file,
        },
        None => Plan::Inspect { known: None, file },
    })
}

/// A planned file with what was read for it.
pub(super) enum Outcome {
    Touch {
        file_id: i64,
        was_missing: bool,
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

pub(super) struct LibraryWriter {
    connection: Connection,
}

impl LibraryWriter {
    pub fn new(connection: Connection) -> Self {
        Self { connection }
    }

    /// Starts a new pass over a root and returns its generation number.
    pub fn begin_scan(&self, root_id: i64) -> Persisted<i64> {
        Ok(self.connection.query_row(
            "UPDATE library_roots SET scan_generation = scan_generation + 1
             WHERE id = ?1 RETURNING scan_generation",
            params![root_id],
            |row| row.get(0),
        )?)
    }

    /// Writes a batch in one transaction, so a failure never leaves half of it behind. Returns
    /// how many of its files changed what the Library holds.
    pub fn write_batch(
        &mut self,
        root_id: i64,
        generation: i64,
        outcomes: &[Outcome],
    ) -> Persisted<u64> {
        let mut changed = 0;
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut touched = Touched::default();
        for outcome in outcomes {
            match outcome {
                Outcome::Touch {
                    file_id,
                    was_missing,
                } => {
                    touch(&transaction, *file_id, generation)?;
                    changed += u64::from(*was_missing);
                }
                Outcome::RetryArtwork {
                    file_id,
                    revision,
                    artwork,
                } => {
                    touch(&transaction, *file_id, generation)?;
                    apply_artwork(&transaction, &mut touched, *file_id, *revision, artwork)?;
                    changed += 1;
                }
                Outcome::Inspected {
                    known,
                    file,
                    result,
                } => {
                    store_file(
                        &transaction,
                        &mut touched,
                        root_id,
                        generation,
                        *known,
                        file,
                        result,
                    )?;
                    changed += 1;
                }
            }
        }
        summary::settle(&transaction, touched)?;
        transaction.commit()?;
        Ok(changed)
    }

    /// After a complete pass: files not seen this generation are missing (kept, not deleted).
    /// A pass over only some directories (`within`, as `/`-terminated relative prefixes, `""`
    /// for the whole folder) marks only the files in them. Returns how many files became Missing.
    pub fn finish_root(
        &self,
        root_id: i64,
        generation: i64,
        within: Option<&[String]>,
    ) -> Persisted<u64> {
        let mut gone = 0;
        let whole = [String::new()];
        for prefix in within.unwrap_or(&whole) {
            gone += self.connection.execute(
                "UPDATE library_files SET availability = ?3
                 WHERE root_id = ?1 AND seen_generation < ?2 AND availability <> ?3
                   AND substr(relative_path, 1, length(?4)) = ?4",
                params![root_id, generation, Availability::Missing, prefix],
            )? as u64;
        }
        if within.is_none() {
            self.connection.execute(
                "UPDATE library_roots SET last_successful_scan_at_ms = ?2 WHERE id = ?1",
                params![root_id, crate::library::now_ms()],
            )?;
        }
        Ok(gone)
    }
}

fn touch(transaction: &Transaction, file_id: i64, generation: i64) -> Persisted<()> {
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
    transaction: &Transaction,
    touched: &mut Touched,
    root_id: i64,
    generation: i64,
    known: Option<(i64, i64)>,
    file: &DiscoveredFile,
    result: &Result<InspectedFile, Undecodable>,
) -> Persisted<()> {
    let status = match result {
        Ok(_) => InspectionStatus::Indexed,
        Err(Undecodable) => InspectionStatus::Unsupported,
    };
    let content_hash = result
        .as_ref()
        .ok()
        .and_then(|inspected| inspected.content_hash.as_deref());
    let (file_id, revision) = match known {
        Some((file_id, revision)) => {
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
        }
        None => {
            transaction.execute(
                INSERT_FILE,
                params![
                    root_id,
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
        }
    };
    match result {
        Ok(inspected) => store_inspected(
            transaction,
            touched,
            file_id,
            revision,
            (root_id, file),
            inspected,
        ),
        Err(Undecodable) => clear_metadata(transaction, touched, file_id, revision, file),
    }
}

fn store_inspected(
    transaction: &Transaction,
    touched: &mut Touched,
    file_id: i64,
    revision: i64,
    (root_id, file): (i64, &DiscoveredFile),
    inspected: &InspectedFile,
) -> Persisted<()> {
    transaction.execute(
        "INSERT OR IGNORE INTO tracks(file_id) VALUES (?1)",
        params![file_id],
    )?;
    let track_id: i64 = transaction.query_row(
        "SELECT id FROM tracks WHERE file_id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    let artwork_id = store_artwork_asset(transaction, &inspected.artwork)?;
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
        &album_edition_of(root_id, &file.relative),
    );
    touched.stored_track(transaction, track_id)?;
    touched.album((
        keys.album_artist.clone(),
        keys.album.clone(),
        keys.album_folder.clone(),
    ));
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
            artwork_id,
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
            keys.album_folder
        ],
    )?;
    Ok(())
}

/// A file that was indexed and can no longer be decoded keeps its track, with the tags of its
/// earlier revision cleared so they are not shown for the file it is now.
fn clear_metadata(
    transaction: &Transaction,
    touched: &mut Touched,
    file_id: i64,
    revision: i64,
    file: &DiscoveredFile,
) -> Persisted<()> {
    let track_id: Option<i64> = transaction
        .query_row(
            "SELECT id FROM tracks WHERE file_id = ?1",
            params![file_id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(track_id) = track_id {
        touched.stored_track(transaction, track_id)?;
    }
    let keys = TrackKeys::new(None, None, None, None, None, &file.file_name);
    transaction.execute(
        "UPDATE track_source_metadata
         SET source_revision = ?2, title = NULL, artist = NULL, album = NULL, album_artist = NULL,
             track_number = NULL, track_total = NULL, disc_number = NULL, disc_total = NULL,
             genre = NULL, date = NULL, duration_ms = NULL, file_format = NULL, codec = NULL,
             sample_rate = NULL, channel_count = NULL, bit_depth = NULL, bitrate_kbps = NULL,
             tag_status = ?3, artwork_status = ?4, artwork_id = NULL,
             title_key = ?5, artist_key = '', album_key = '', album_artist_key = '', year = NULL,
             title_sort = ?6, artist_sort = '', album_sort = '', album_artist_sort = '',
             search_key = ?7, album_dir = ''
         WHERE track_id = (SELECT id FROM tracks WHERE file_id = ?1)",
        params![
            file_id,
            revision,
            TagStatus::Absent,
            ArtworkStatus::NotPresent,
            keys.title,
            keys.title_sort,
            keys.search
        ],
    )?;
    touched.album((String::new(), String::new(), String::new()));
    Ok(())
}

fn apply_artwork(
    transaction: &Transaction,
    touched: &mut Touched,
    file_id: i64,
    revision: i64,
    artwork: &ArtworkOutcome,
) -> Persisted<()> {
    let track_id: i64 = transaction.query_row(
        "SELECT id FROM tracks WHERE file_id = ?1",
        params![file_id],
        |row| row.get(0),
    )?;
    let artwork_id = store_artwork_asset(transaction, artwork)?;
    touched.stored_track(transaction, track_id)?;
    transaction.execute(
        "UPDATE track_source_metadata SET artwork_status = ?3, artwork_id = ?4
         WHERE track_id = ?1 AND source_revision = ?2",
        params![track_id, revision, artwork.status, artwork_id],
    )?;
    Ok(())
}

/// The database id of the stored artwork, if there is any. Identical images share one row.
fn store_artwork_asset(
    transaction: &Transaction,
    artwork: &ArtworkOutcome,
) -> Persisted<Option<i64>> {
    match (&artwork.status, &artwork.stored) {
        (ArtworkStatus::Stored, Some(asset)) => Ok(Some(transaction.query_row(
            UPSERT_ARTWORK_ASSET,
            params![
                asset.hash,
                asset.mime_type,
                asset.relative_path,
                asset.byte_length as i64
            ],
            |row| row.get(0),
        )?)),
        _ => Ok(None),
    }
}
