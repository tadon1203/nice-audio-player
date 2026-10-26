//! Artwork: the content-addressed image files under the application data directory, the thumbnail
//! made when a file is scanned, the accent color, and the collection of files that no row owns.
//!
//! An image is stored as `artwork/<shard>/<hash>.<ext>` and its thumbnail beside it as
//! `artwork/<shard>/<hash>.thumb.jpg`, where the shard is the first two hash digits. Both paths
//! follow from the hash and the MIME type, so the database holds neither.

use super::{database::Database, sql_text_enum};
use crate::Result;
use crate::ids::ArtworkHash;
use image::{ImageReader, codecs::jpeg::JpegEncoder, imageops::FilterType};
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Cursor, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

/// The longest edge of a thumbnail, in pixels.
const THUMBNAIL_EDGE: u32 = 512;
const THUMBNAIL_QUALITY: u8 = 85;
/// The longest edge of the image the accent color is computed from.
const SAMPLE_EDGE: u32 = 32;

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ArtworkMimeType {
    Jpeg,
    Png,
}

sql_text_enum!(ArtworkMimeType {
    Jpeg => "image/jpeg",
    Png => "image/png",
});

impl ArtworkMimeType {
    fn extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
        }
    }

    fn from_extension(extension: &str) -> Option<Self> {
        [Self::Jpeg, Self::Png]
            .into_iter()
            .find(|mime| mime.extension() == extension)
    }
}

/// Stored artwork as the Renderer addresses it: two paths relative to the artwork protocol root.
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkRef {
    /// The original image.
    pub path: String,
    /// The thumbnail. It is the original when no thumbnail could be made.
    pub thumb_path: String,
}

impl ArtworkRef {
    pub(crate) fn new(hash: &ArtworkHash, mime_type: ArtworkMimeType, has_thumbnail: bool) -> Self {
        let path = original_path(hash, mime_type);
        let thumb_path = if has_thumbnail {
            thumbnail_path(hash)
        } else {
            path.clone()
        };
        Self { path, thumb_path }
    }
}

fn shard(hash: &ArtworkHash) -> &str {
    &hash.as_str()[..2]
}

/// The original image, relative to the data directory.
pub(crate) fn original_path(hash: &ArtworkHash, mime_type: ArtworkMimeType) -> String {
    format!(
        "artwork/{}/{}.{}",
        shard(hash),
        hash.as_str(),
        mime_type.extension()
    )
}

/// The thumbnail, relative to the data directory.
pub(crate) fn thumbnail_path(hash: &ArtworkHash) -> String {
    format!("artwork/{}/{}.thumb.jpg", shard(hash), hash.as_str())
}

/// The hash of the stored original image a relative path names, or `None` for any other path.
pub(crate) fn hash_of_original(relative: &str) -> Option<ArtworkHash> {
    match parse_request(relative)? {
        (hash, Requested::Original(_)) => Some(hash),
        (_, Requested::Thumbnail) => None,
    }
}

/// An image the artwork protocol answers a request with.
#[derive(Debug, PartialEq, Eq)]
pub struct ServedArtwork {
    pub bytes: Vec<u8>,
    pub mime_type: &'static str,
}

/// What an artwork request names. A request is served only when its path is exactly the one
/// `original_path` or `thumbnail_path` writes for its hash.
#[derive(Debug, PartialEq, Eq)]
enum Requested {
    Original(ArtworkMimeType),
    Thumbnail,
}

/// Validates a request path from the protocol. Anything that is not an artwork path is `None`.
fn parse_request(relative: &str) -> Option<(ArtworkHash, Requested)> {
    let mut parts = relative.split('/');
    let (Some("artwork"), Some(shard), Some(file), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return None;
    };
    let (hash, requested) = if let Some(hash) = file.strip_suffix(".thumb.jpg") {
        (hash, Requested::Thumbnail)
    } else {
        let (hash, extension) = file.rsplit_once('.')?;
        (
            hash,
            Requested::Original(ArtworkMimeType::from_extension(extension)?),
        )
    };
    let hash = ArtworkHash::try_from(hash.to_owned()).ok()?;
    (shard == self::shard(&hash)).then_some((hash, requested))
}

/// The image for a relative path below the data directory, or `None` when the path is not an
/// artwork path or no file exists.
pub(crate) fn serve(data_dir: &Path, relative: &str) -> Option<ServedArtwork> {
    let (hash, requested) = parse_request(relative)?;
    let (path, mime_type) = match requested {
        Requested::Original(mime_type) => (original_path(&hash, mime_type), mime_type.as_str()),
        Requested::Thumbnail => (thumbnail_path(&hash), "image/jpeg"),
    };
    let bytes = fs::read(data_dir.join(path)).ok()?;
    Some(ServedArtwork { bytes, mime_type })
}

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
pub(crate) fn store(
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
            log::debug!("library.artwork.thumbnail_failed cause={cause}");
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
fn thumbnail(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let decoded = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|cause| cause.to_string())?
        .decode()
        .map_err(|cause| cause.to_string())?;
    let decoded = if decoded.width() > THUMBNAIL_EDGE || decoded.height() > THUMBNAIL_EDGE {
        decoded.resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, FilterType::Lanczos3)
    } else {
        decoded
    };
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, THUMBNAIL_QUALITY)
        .encode_image(&decoded.to_rgb8())
        .map_err(|cause| cause.to_string())?;
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

/// The accent color of stored artwork, computed on first request and cached in its row. Writes
/// only the one cached value, in its own short transaction.
pub(crate) fn artwork_accent(database: &Database, hash: &ArtworkHash) -> Result<Option<String>> {
    let row: Option<(ArtworkMimeType, Option<String>)> = database
        .read()?
        .query_row(
            "SELECT mime, accent FROM artwork WHERE hash = ?1",
            params![hash.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((mime_type, accent)) = row else {
        return Ok(None);
    };
    if accent.is_some() {
        return Ok(accent);
    }
    let Ok(bytes) = fs::read(database.data_dir().join(original_path(hash, mime_type))) else {
        return Ok(None);
    };
    let Some(color) = representative_color(&bytes) else {
        return Ok(None);
    };
    database.write()?.execute(
        "UPDATE artwork SET accent = ?2 WHERE hash = ?1",
        params![hash.as_str(), color],
    )?;
    Ok(Some(color))
}

/// Picks a representative color for artwork as `#rrggbb`. The UI uses it for
/// backgrounds only, so it favors saturated pixels over the plain average and
/// falls back to the average for grayscale artwork.
fn representative_color(bytes: &[u8]) -> Option<String> {
    let decoded = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;
    let sample = decoded
        .resize(SAMPLE_EDGE, SAMPLE_EDGE, FilterType::Triangle)
        .to_rgb8();
    let pixels: Vec<[u8; 3]> = sample.pixels().map(|pixel| pixel.0).collect();
    weighted_average(&pixels)
}

fn weighted_average(pixels: &[[u8; 3]]) -> Option<String> {
    if pixels.is_empty() {
        return None;
    }
    let (mut total, mut sums) = (0.0_f64, [0.0_f64; 3]);
    for pixel in pixels {
        let max = f64::from(*pixel.iter().max()?);
        let min = f64::from(*pixel.iter().min()?);
        let saturation = if max == 0.0 { 0.0 } else { (max - min) / max };
        let weight = 0.05 + saturation * saturation;
        total += weight;
        for (sum, channel) in sums.iter_mut().zip(pixel) {
            *sum += weight * f64::from(*channel);
        }
    }
    let [r, g, b] = sums.map(|sum| (sum / total).round().clamp(0.0, 255.0) as u8);
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}

/// Collects the artwork store's garbage. An image whose file is gone or has another size is
/// forgotten: its tracks keep no artwork and are marked `storeFailed`, so the next scan of their
/// files stores it again. An image no track uses is deleted, and so is every file no row owns.
pub(crate) fn collect(database: &Database) -> Result<()> {
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
                params![hash.as_str(), crate::library::ArtworkStatus::StoreFailed],
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
        .collect::<Result<Vec<_>, _>>()?;
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
    use crate::test_support::TestDirectory;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        image::DynamicImage::new_rgb8(width, height)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn hash_of(bytes: &[u8]) -> ArtworkHash {
        ArtworkHash::try_from(blake3::hash(bytes).to_hex().to_string()).unwrap()
    }

    #[test]
    fn a_thumbnail_is_made_next_to_an_untouched_original() {
        let directory = TestDirectory::new();
        let bytes = png(1200, 800);
        let stored = store(directory.path(), &bytes, ArtworkMimeType::Png).unwrap();

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
        let stored = store(directory.path(), &png(100, 100), ArtworkMimeType::Png).unwrap();
        let thumb = image::open(directory.path().join(thumbnail_path(&stored.hash))).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (100, 100));
    }

    #[test]
    fn a_thumbnail_that_cannot_be_made_leaves_the_original_as_the_thumbnail() {
        let directory = TestDirectory::new();
        let bytes = b"\x89PNG\r\n\x1a\nnot really a png";
        let stored = store(directory.path(), bytes, ArtworkMimeType::Png).unwrap();

        assert!(!stored.has_thumbnail);
        assert!(!directory.path().join(thumbnail_path(&stored.hash)).exists());
        let reference = ArtworkRef::new(&stored.hash, stored.mime_type, stored.has_thumbnail);
        assert_eq!(reference.thumb_path, reference.path);
    }

    #[test]
    fn a_path_is_derived_from_the_hash_and_the_type() {
        let hash = ArtworkHash::try_from("ab".to_owned() + &"c".repeat(62)).unwrap();
        assert_eq!(
            original_path(&hash, ArtworkMimeType::Png),
            format!("artwork/ab/{}.png", hash.as_str())
        );
        assert_eq!(
            thumbnail_path(&hash),
            format!("artwork/ab/{}.thumb.jpg", hash.as_str())
        );
        assert_eq!(hash_of(b"x").as_str().len(), 64);
    }

    #[test]
    fn a_stored_original_and_its_thumbnail_are_served_and_nothing_else_is() {
        let dir = TestDirectory::new();
        let hash = ArtworkHash::try_from("ab".repeat(32)).unwrap();
        fs::create_dir_all(dir.path().join("artwork/ab")).unwrap();
        let original = original_path(&hash, ArtworkMimeType::Png);
        fs::write(dir.path().join(&original), b"original").unwrap();
        let thumb = thumbnail_path(&hash);

        assert_eq!(serve(dir.path(), &thumb), None, "no thumbnail file yet");
        fs::write(dir.path().join(&thumb), b"thumb").unwrap();
        let served = serve(dir.path(), &thumb).unwrap();
        assert_eq!(
            (served.bytes.as_slice(), served.mime_type),
            (&b"thumb"[..], "image/jpeg")
        );
        let full = serve(dir.path(), &original).unwrap();
        assert_eq!(
            (full.bytes.as_slice(), full.mime_type),
            (&b"original"[..], "image/png")
        );

        fs::write(dir.path().join("secret.png"), b"x").unwrap();
        for bad in [
            "artwork/../secret.png".to_owned(),
            format!("artwork/aa/{}.png", hash.as_str()),
            format!("artwork/ab/{}.jpg", "AB".repeat(32)),
            format!("artwork/ab/{}.gif", hash.as_str()),
            format!("artwork/ab/{}.thumb.png", hash.as_str()),
            format!("asset/artwork/ab/{}.png", hash.as_str()),
        ] {
            assert!(serve(dir.path(), &bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_hash_must_be_64_lowercase_hex_digits_to_be_an_artwork_path() {
        let hash = "ab".to_owned() + &"c".repeat(62);
        assert!(parse_request(&format!("artwork/ab/{hash}.png")).is_some());
        assert!(parse_request(&format!("artwork/cd/{hash}.png")).is_none());
        assert!(parse_request(&format!("artwork/ab/{}.png", "AB".repeat(32))).is_none());
        assert!(parse_request(&format!("artwork/ab/{}.png", &hash[..63])).is_none());
    }

    #[test]
    fn colors_come_from_saturated_pixels_and_not_from_a_gray_background() {
        let flat = png_fill(8, 8, [200, 40, 40]);
        assert_eq!(representative_color(&flat).as_deref(), Some("#c82828"));

        let mixed = png_fill_with(
            16,
            16,
            |x, _| {
                if x < 12 { [128, 128, 128] } else { [0, 0, 255] }
            },
        );
        let color = representative_color(&mixed).expect("color");
        assert!(
            u8::from_str_radix(&color[5..7], 16).unwrap()
                > u8::from_str_radix(&color[1..3], 16).unwrap() + 40,
            "{color} should lean blue"
        );
        let grey = png_fill(8, 8, [100, 100, 100]);
        assert_eq!(representative_color(&grey).as_deref(), Some("#646464"));
        assert_eq!(representative_color(b"not an image"), None);
    }

    fn png_fill(width: u32, height: u32, color: [u8; 3]) -> Vec<u8> {
        png_fill_with(width, height, |_, _| color)
    }

    fn png_fill_with(width: u32, height: u32, fill: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
        use image::ImageEncoder;
        let mut raw = Vec::new();
        for y in 0..height {
            for x in 0..width {
                raw.extend_from_slice(&fill(x, y));
            }
        }
        let mut out = Vec::new();
        image::codecs::png::PngEncoder::new(&mut out)
            .write_image(&raw, width, height, image::ExtendedColorType::Rgb8)
            .expect("encode png");
        out
    }
}
