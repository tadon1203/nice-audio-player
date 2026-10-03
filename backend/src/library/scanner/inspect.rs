//! Phase two: read everything a file has to tell, without touching the database. Files are
//! independent here, so a batch is inspected on several threads.

use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};

use super::discover::DiscoveredFile;
use crate::containment::contain;
use crate::library::artwork::{self, StoredArtwork};
use crate::library::status::{ArtworkStatus, TagStatus};
use crate::media::{
    inspection::{inspect_audio_file, InspectedAudioFile, Undecodable},
    metadata::{read_source_metadata, ArtworkRead, SourceMetadata},
};

const MAX_INSPECTION_THREADS: usize = 4;

/// Embedded artwork after it was read and, when there was some, written to the artwork store.
#[derive(Debug, Clone)]
pub(super) struct ArtworkOutcome {
    pub status: ArtworkStatus,
    pub stored: Option<StoredArtwork>,
}

impl ArtworkOutcome {
    fn from_read(read: &ArtworkRead, data_dir: &Path) -> Self {
        let stored = match read {
            ArtworkRead::Selected { bytes, mime_type } => {
                artwork::materialize(data_dir, bytes, *mime_type)
                    .ok()
                    .inspect(|stored| {
                        if let Some(path) = artwork::ArtworkPath::parse(&stored.relative_path) {
                            // Best effort: until one exists the original is served.
                            let _ = artwork::ensure_thumbnail(data_dir, &path);
                        }
                    })
            }
            _ => None,
        };
        let status = match (read, &stored) {
            (ArtworkRead::NotPresent, _) => ArtworkStatus::NotPresent,
            (ArtworkRead::Unavailable, _) => ArtworkStatus::Unavailable,
            (ArtworkRead::Invalid, _) => ArtworkStatus::Invalid,
            (ArtworkRead::Selected { .. }, Some(_)) => ArtworkStatus::Stored,
            (ArtworkRead::Selected { .. }, None) => ArtworkStatus::StoreFailed,
        };
        Self { status, stored }
    }
}

/// Reads and stores only the artwork, for a file whose earlier attempt to store it failed.
pub(super) fn read_artwork(path: &Path, data_dir: &Path) -> ArtworkOutcome {
    let read = match contain("library.read_artwork", || read_source_metadata(path)) {
        Some(Ok(Some(metadata))) => metadata.artwork,
        Some(Ok(None)) => ArtworkRead::NotPresent,
        Some(Err(_)) | None => ArtworkRead::Unavailable,
    };
    ArtworkOutcome::from_read(&read, data_dir)
}

pub(super) struct InspectedFile {
    pub audio: InspectedAudioFile,
    pub tag_status: TagStatus,
    /// Empty when the file has no tags or they could not be read.
    pub tags: SourceMetadata,
    pub artwork: ArtworkOutcome,
    pub bitrate_kbps: Option<i64>,
    /// `None` when the file could not be read for it (see `identity.rs`).
    pub content_hash: Option<String>,
}

/// Reads a file. One that cannot be decoded is kept in the library but is not playable.
pub(super) fn inspect(
    file: &DiscoveredFile,
    data_dir: &Path,
) -> Result<InspectedFile, Undecodable> {
    let audio = inspect_audio_file(&file.path, &file.extension)?;
    let (tag_status, tags, artwork_read) = match read_source_metadata(&file.path) {
        Ok(Some(tags)) => {
            let artwork = tags.artwork.clone();
            (TagStatus::Loaded, tags, artwork)
        }
        Ok(None) => (
            TagStatus::Absent,
            SourceMetadata::default(),
            ArtworkRead::NotPresent,
        ),
        Err(_) => (
            TagStatus::Failed,
            SourceMetadata::default(),
            ArtworkRead::Unavailable,
        ),
    };
    Ok(InspectedFile {
        bitrate_kbps: average_bitrate_kbps(file.byte_length, audio.info.duration_ms)
            .map(|value| value as i64),
        artwork: ArtworkOutcome::from_read(&artwork_read, data_dir),
        content_hash: super::identity::content_hash(&file.path).ok(),
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

/// Inspects `files` in parallel and returns the results in the same order. An entry is `None`
/// when the scan was cancelled before its file was reached.
pub(super) fn inspect_all(
    files: &[DiscoveredFile],
    data_dir: &Path,
    cancel: &AtomicBool,
) -> Vec<Option<Result<InspectedFile, Undecodable>>> {
    let results: Vec<Mutex<Option<Result<InspectedFile, Undecodable>>>> =
        files.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism()
        .map_or(1, usize::from)
        .min(MAX_INSPECTION_THREADS)
        .min(files.len());
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                if cancel.load(Ordering::Acquire) {
                    return;
                }
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(file) = files.get(index) else {
                    return;
                };
                // A file that panics a parser is a file that cannot be read, not a dead scan.
                let result = contain("library.inspect", || inspect(file, data_dir))
                    .unwrap_or(Err(Undecodable));
                *results[index].lock().expect("inspection result lock") = Some(result);
            });
        }
    });
    results
        .into_iter()
        .map(|slot| slot.into_inner().expect("inspection result lock"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::average_bitrate_kbps;

    #[test]
    fn bitrate_is_rounded_and_absent_without_a_duration() {
        assert_eq!(average_bitrate_kbps(1_000_000, Some(8_000)), Some(1_000));
        assert_eq!(average_bitrate_kbps(1_000_000, Some(0)), None);
        assert_eq!(average_bitrate_kbps(1_000_000, None), None);
    }
}
