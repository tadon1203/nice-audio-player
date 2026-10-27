//! Artwork storage at scan time: writes an image and its thumbnail into the artwork store, and
//! deletes the files that no row owns. The paths and the reading side are in `read/artwork.rs`.

use crate::ids::ArtworkHash;
use crate::library::read::artwork::{
    ArtworkMimeType, original_path, parse_request, thumbnail_path,
};
use crate::library::storage::Database;
use crate::library::storage::columns::ArtworkStatus;
use anyhow::{Context, Result};
use image::{ImageReader, codecs::jpeg::JpegEncoder, imageops::FilterType};
use rusqlite::params;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Cursor, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// The longest edge of a thumbnail, in pixels.
const THUMBNAIL_EDGE: u32 = 512;
const THUMBNAIL_QUALITY: u8 = 85;

/// A stored image: its hash, its type and whether a thumbnail was made beside it.
#[derive(Debug, Clone)]
pub(crate) struct StoredArtwork {
    pub hash: ArtworkHash,
    pub mime_type: ArtworkMimeType,
    pub byte_length: u64,
    pub has_thumbnail: bool,
}

/// Stores an image and its thumbnail, at scan time. A thumbnail that cannot be made leaves
/// `has_thumbnail` false: the original is then the thumbnail.
pub(crate) fn store_artwork(
    directory: &Path,
    bytes: &[u8],
    mime_type: ArtworkMimeType,
) -> Result<StoredArtwork> {
    let hash = blake3::hash(bytes).to_hex().to_string();
    // A blake3 hex digest is 64 lowercase hex digits, which is what an artwork hash is.
    let hash = ArtworkHash::try_from(hash).expect("a blake3 hex digest is an artwork hash");
    write_atomically(&directory.join(original_path(&hash, mime_type)), bytes)?;
    let has_thumbnail = match thumbnail(bytes) {
        Ok(encoded) => write_atomically(&directory.join(thumbnail_path(&hash)), &encoded).is_ok(),
        Err(cause) => {
            log::debug!("library.artwork.thumbnail_failed cause={cause:#}");
            false
        }
    };
    Ok(StoredArtwork {
        hash,
        mime_type,
        byte_length: bytes.len() as u64,
        has_thumbnail,
    })
}

/// The 512-pixel JPEG of an image. An image smaller than that is not enlarged.
fn thumbnail(bytes: &[u8]) -> Result<Vec<u8>> {
    let decoded = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .context("the image format cannot be read")?
        .decode()
        .context("the image cannot be decoded")?;
    let decoded = if decoded.width() > THUMBNAIL_EDGE || decoded.height() > THUMBNAIL_EDGE {
        decoded.resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, FilterType::Lanczos3)
    } else {
        decoded
    };
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, THUMBNAIL_QUALITY)
        .encode_image(&decoded.to_rgb8())
        .context("the thumbnail cannot be encoded")?;
    Ok(encoded)
}

/// Writes `bytes` to a temporary file beside `path`, then renames it over `path`, so a reader never
/// sees half a file. The temporary file is removed when either step fails.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<()> {
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(std::io::Error::from(std::io::ErrorKind::InvalidInput).into());
    };
    fs::create_dir_all(parent)?;
    let temp_path = parent.join(format!(
        "{}.tmp-{}-{}",
        name.to_string_lossy(),
        std::process::id(),
        TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let written = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .and_then(|mut file| file.write_all(bytes).and_then(|()| file.flush()))
        .and_then(|()| fs::rename(&temp_path, path));
    if let Err(cause) = written {
        remove_file_quietly(&temp_path);
        return Err(cause.into());
    }
    Ok(())
}

/// Removes a file on a best-effort basis: a file that is not there is not an error.
fn remove_file_quietly(path: &Path) {
    if let Err(cause) = fs::remove_file(path)
        && cause.kind() != std::io::ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
}

/// Collects the artwork store's garbage. An image whose file is gone or has another size is
/// forgotten: its tracks keep no artwork and are marked `storeFailed`, so the next scan of their
/// files stores it again. An image no track uses is deleted, and so is every file no row owns.
pub(crate) fn delete_unreferenced_artwork(database: &Database) -> Result<()> {
    let data_dir = database.data_dir();
    let mut connection = database.write()?;
    let transaction = connection.transaction()?;
    let rows = stored_rows(&transaction)?;
    for (hash, mime_type, _) in &rows {
        let intact = fs::metadata(data_dir.join(original_path(hash, *mime_type)))
            .is_ok_and(|metadata| metadata.is_file());
        if !intact {
            transaction.execute(
                "UPDATE track_source_metadata SET artwork_hash = NULL, artwork_status = ?2
                 WHERE artwork_hash = ?1",
                params![hash.as_str(), ArtworkStatus::StoreFailed],
            )?;
            transaction.execute(
                "DELETE FROM artwork WHERE hash = ?1",
                params![hash.as_str()],
            )?;
        }
    }
    transaction.execute(
        "DELETE FROM artwork
         WHERE hash NOT IN (SELECT artwork_hash FROM track_source_metadata WHERE artwork_hash IS NOT NULL)",
        [],
    )?;
    let live: HashSet<String> = stored_rows(&transaction)?
        .into_iter()
        .flat_map(|(hash, mime_type, has_thumbnail)| {
            let mut paths = vec![original_path(&hash, mime_type)];
            if has_thumbnail {
                paths.push(thumbnail_path(&hash));
            }
            paths
        })
        .collect();
    transaction.commit()?;
    remove_unowned_files(data_dir, &live);
    Ok(())
}

fn stored_rows(
    connection: &rusqlite::Connection,
) -> Result<Vec<(ArtworkHash, ArtworkMimeType, bool)>> {
    let mut statement = connection.prepare("SELECT hash, mime, has_thumbnail FROM artwork")?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, ArtworkMimeType>(1)?,
                row.get::<_, bool>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // A stored hash was validated when it was written, so one that fails here is skipped.
    Ok(rows
        .into_iter()
        .filter_map(|(hash, mime_type, has_thumbnail)| {
            let hash = ArtworkHash::try_from(hash).ok()?;
            Some((hash, mime_type, has_thumbnail))
        })
        .collect())
}

/// Deletes the files in the artwork store that no row owns, and the temporary files of a write
/// that did not finish.
fn remove_unowned_files(data_dir: &Path, live: &HashSet<String>) {
    let Ok(shards) = fs::read_dir(data_dir.join("artwork")) else {
        return;
    };
    for shard in shards.flatten() {
        let Ok(entries) = fs::read_dir(shard.path()) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let relative = format!("artwork/{}/{name}", shard.file_name().to_string_lossy());
            let temporary = name.contains(".tmp-");
            let unowned = parse_request(&relative).is_some() && !live.contains(&relative);
            if temporary || unowned {
                remove_file_quietly(&path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::read::artwork::ArtworkRef;
    use crate::test_support::TestDirectory;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        image::DynamicImage::new_rgb8(width, height)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn a_thumbnail_is_made_next_to_an_untouched_original() {
        let directory = TestDirectory::new();
        let bytes = png(1200, 800);
        let stored = store_artwork(directory.path(), &bytes, ArtworkMimeType::Png).unwrap();

        assert!(stored.has_thumbnail);
        let thumb = image::open(directory.path().join(thumbnail_path(&stored.hash))).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (512, 341));
        assert_eq!(
            fs::read(
                directory
                    .path()
                    .join(original_path(&stored.hash, stored.mime_type))
            )
            .unwrap(),
            bytes
        );
    }

    #[test]
    fn a_small_image_is_not_enlarged() {
        let directory = TestDirectory::new();
        let stored = store_artwork(directory.path(), &png(100, 100), ArtworkMimeType::Png).unwrap();
        let thumb = image::open(directory.path().join(thumbnail_path(&stored.hash))).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (100, 100));
    }

    #[test]
    fn a_thumbnail_that_cannot_be_made_leaves_the_original_as_the_thumbnail() {
        let directory = TestDirectory::new();
        let bytes = b"\x89PNG\r\n\x1a\nnot really a png";
        let stored = store_artwork(directory.path(), bytes, ArtworkMimeType::Png).unwrap();

        assert!(!stored.has_thumbnail);
        assert!(!directory.path().join(thumbnail_path(&stored.hash)).exists());
        let reference = ArtworkRef::new(&stored.hash, stored.mime_type, stored.has_thumbnail);
        assert_eq!(reference.thumb_path, reference.path);
    }
}
