//! Phase three: write what was found to the database, in batches so each batch is one commit.

use std::cell::Cell;

use rusqlite::{params, Connection, OptionalExtension};

use super::discover::DiscoveredFile;
use super::inspect::{ArtworkOutcome, ArtworkStatus, InspectedFile};
use crate::library::service::now;

const SELECT_EXISTING_FILE: &str = "
    SELECT f.id, f.source_revision, f.modification_key, f.inspection_status,
           COALESCE(m.artwork_status, '')
    FROM library_files f
    LEFT JOIN tracks t ON t.file_id = f.id
    LEFT JOIN track_source_metadata m ON m.track_id = t.id AND m.source_revision = f.source_revision
    WHERE f.root_id = ?1 AND f.relative_path = ?2";

const TOUCH_FILE: &str = "
    UPDATE library_files
    SET seen_generation = ?2, availability = 'available', updated_at_ms = ?3
    WHERE id = ?1";

const REVISE_FILE: &str = "
    UPDATE library_files
    SET byte_length = ?2, modification_key = ?3, source_revision = ?4, seen_generation = ?5,
        availability = 'available', inspection_status = 'pending', updated_at_ms = ?6
    WHERE id = ?1";

const INSERT_FILE: &str = "
    INSERT INTO library_files(root_id, relative_path, file_name, extension, byte_length,
                              modification_key, source_revision, seen_generation, availability,
                              inspection_status, updated_at_ms)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, 'available', 'pending', ?8)";

const UPSERT_ARTWORK_ASSET: &str = "
    INSERT INTO artwork_assets(content_hash, mime_type, relative_path, byte_length, created_at_ms)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(content_hash) DO UPDATE SET content_hash = excluded.content_hash
    RETURNING id";

const UPSERT_SOURCE_METADATA: &str = "
    INSERT INTO track_source_metadata(
        track_id, source_revision, title, artist, album, album_artist, track_number, track_total,
        disc_number, disc_total, genre, date, duration_ms, file_format, codec, sample_rate,
        channel_count, bit_depth, bitrate_kbps, tag_status, artwork_status, artwork_id,
        updated_at_ms)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
            ?20, ?21, ?22, ?23)
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
        artwork_id = excluded.artwork_id, updated_at_ms = excluded.updated_at_ms";

/// Any database failure. The scan stops on it; the details stay out of the IPC surface.
#[derive(Debug)]
pub(super) struct PersistError;

impl From<rusqlite::Error> for PersistError {
    fn from(_: rusqlite::Error) -> Self {
        Self
    }
}

type Persisted<T> = Result<T, PersistError>;

/// What a discovered file needs after it is reconciled with the database.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Work {
    Nothing,
    /// Unchanged, but its artwork could not be stored last time.
    RetryArtwork,
    /// New or changed.
    Inspect,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct Reconciled {
    pub file_id: i64,
    pub revision: i64,
    pub work: Work,
}

pub(super) struct LibraryWriter {
    connection: Connection,
    in_batch: Cell<bool>,
}

impl LibraryWriter {
    pub fn new(connection: Connection) -> Self {
        Self {
            connection,
            in_batch: Cell::new(false),
        }
    }

    /// Starts a new pass over a root and returns its generation number.
    pub fn begin_scan(&self, root_id: i64) -> Persisted<i64> {
        Ok(self.connection.query_row(
            "UPDATE library_roots
             SET scan_generation = scan_generation + 1, last_scan_started_at_ms = ?2,
                 updated_at_ms = ?2
             WHERE id = ?1 RETURNING scan_generation",
            params![root_id, now()],
            |row| row.get(0),
        )?)
    }

    /// Opens a transaction. Everything until `commit_batch` is one commit; if the writer is
    /// dropped first (a failure), it is rolled back.
    pub fn begin_batch(&self) -> Persisted<()> {
        if !self.in_batch.get() {
            self.connection.execute_batch("BEGIN IMMEDIATE")?;
            self.in_batch.set(true);
        }
        Ok(())
    }

    pub fn commit_batch(&self) -> Persisted<()> {
        if self.in_batch.replace(false) {
            self.connection.execute_batch("COMMIT")?;
        }
        Ok(())
    }

    /// Records that `file` was seen in this generation and decides what it still needs.
    pub fn reconcile(
        &self,
        root_id: i64,
        generation: i64,
        file: &DiscoveredFile,
    ) -> Persisted<Reconciled> {
        let existing: Option<(i64, i64, String, String, String)> = self
            .connection
            .query_row(
                SELECT_EXISTING_FILE,
                params![root_id, file.relative],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()?;
        let unchanged = |modification_key: &str| modification_key == file.modification_key;
        match existing {
            Some((id, revision, key, status, artwork_status))
                if unchanged(&key) && status == "indexed" && artwork_status == "storeFailed" =>
            {
                self.touch(id, generation)?;
                Ok(Reconciled {
                    file_id: id,
                    revision,
                    work: Work::RetryArtwork,
                })
            }
            Some((id, revision, key, status, _)) if unchanged(&key) && status != "pending" => {
                self.touch(id, generation)?;
                Ok(Reconciled {
                    file_id: id,
                    revision,
                    work: Work::Nothing,
                })
            }
            Some((id, revision, ..)) => {
                let next = revision + 1;
                self.connection.execute(
                    REVISE_FILE,
                    params![
                        id,
                        file.byte_length as i64,
                        file.modification_key,
                        next,
                        generation,
                        now()
                    ],
                )?;
                Ok(Reconciled {
                    file_id: id,
                    revision: next,
                    work: Work::Inspect,
                })
            }
            None => {
                self.connection.execute(
                    INSERT_FILE,
                    params![
                        root_id,
                        file.relative,
                        file.file_name,
                        file.extension,
                        file.byte_length as i64,
                        file.modification_key,
                        generation,
                        now()
                    ],
                )?;
                Ok(Reconciled {
                    file_id: self.connection.last_insert_rowid(),
                    revision: 1,
                    work: Work::Inspect,
                })
            }
        }
    }

    fn touch(&self, file_id: i64, generation: i64) -> Persisted<()> {
        self.connection
            .execute(TOUCH_FILE, params![file_id, generation, now()])?;
        Ok(())
    }

    /// Stores an inspected file: it becomes playable and its track keeps its identity across
    /// revisions.
    pub fn store_inspected(
        &self,
        file: &DiscoveredFile,
        reconciled: &Reconciled,
        inspected: &InspectedFile,
    ) -> Persisted<()> {
        let connection = &self.connection;
        connection.execute(
            "UPDATE library_files SET inspection_status = 'indexed' WHERE id = ?1",
            params![reconciled.file_id],
        )?;
        connection.execute(
            "INSERT OR IGNORE INTO tracks(file_id, created_at_ms) VALUES (?1, ?2)",
            params![reconciled.file_id, now()],
        )?;
        let track_id: i64 = connection.query_row(
            "SELECT id FROM tracks WHERE file_id = ?1",
            params![reconciled.file_id],
            |row| row.get(0),
        )?;
        let artwork_id = self.store_artwork_asset(&inspected.artwork)?;
        let tags = &inspected.tags;
        let info = &inspected.audio.info;
        connection.execute(
            UPSERT_SOURCE_METADATA,
            params![
                track_id,
                reconciled.revision,
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
                inspected.tag_status.as_str(),
                inspected.artwork.status.as_str(),
                artwork_id,
                now()
            ],
        )?;
        Ok(())
    }

    /// The file could not be decoded: it stays listed, unplayable.
    pub fn mark_unsupported(&self, file_id: i64) -> Persisted<()> {
        self.connection.execute(
            "UPDATE library_files
             SET inspection_status = 'unsupported', inspection_error_code = 'unsupportedFormat'
             WHERE id = ?1",
            params![file_id],
        )?;
        Ok(())
    }

    /// Applies artwork to a file that is otherwise up to date.
    pub fn apply_artwork(
        &self,
        reconciled: &Reconciled,
        artwork: &ArtworkOutcome,
    ) -> Persisted<()> {
        let track_id: i64 = self.connection.query_row(
            "SELECT id FROM tracks WHERE file_id = ?1",
            params![reconciled.file_id],
            |row| row.get(0),
        )?;
        let artwork_id = self.store_artwork_asset(artwork)?;
        self.connection.execute(
            "UPDATE track_source_metadata
             SET artwork_status = ?3, artwork_id = ?4, updated_at_ms = ?5
             WHERE track_id = ?1 AND source_revision = ?2",
            params![
                track_id,
                reconciled.revision,
                artwork.status.as_str(),
                artwork_id,
                now()
            ],
        )?;
        Ok(())
    }

    /// The database id of the stored artwork, if there is any. Identical images share one row.
    fn store_artwork_asset(&self, artwork: &ArtworkOutcome) -> Persisted<Option<i64>> {
        match (&artwork.status, &artwork.stored) {
            (ArtworkStatus::Stored, Some(asset)) => Ok(Some(self.connection.query_row(
                UPSERT_ARTWORK_ASSET,
                params![
                    asset.hash,
                    asset.mime_type,
                    asset.relative_path,
                    asset.byte_length as i64,
                    now()
                ],
                |row| row.get(0),
            )?)),
            _ => Ok(None),
        }
    }

    /// After a complete pass: files not seen this generation are missing (kept, not deleted).
    pub fn finish_root(&self, root_id: i64, generation: i64) -> Persisted<()> {
        self.connection.execute(
            "UPDATE library_files SET availability = 'missing'
             WHERE root_id = ?1 AND seen_generation < ?2",
            params![root_id, generation],
        )?;
        self.connection.execute(
            "UPDATE library_roots
             SET last_successful_scan_at_ms = ?2, last_scan_error_code = NULL
             WHERE id = ?1",
            params![root_id, now()],
        )?;
        Ok(())
    }
}
