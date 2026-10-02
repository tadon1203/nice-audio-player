//! Artwork storage: content-addressed files under the application data directory, and the
//! reference the catalog and playback items hand to the renderer.

use super::status::sql_text_enum;
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{Cursor, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

/// The longest edge of a thumbnail, in pixels.
pub const THUMBNAIL_EDGE: u32 = 512;
const THUMBNAIL_QUALITY: u8 = 85;

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtworkMimeType {
    Jpeg,
    Png,
}

sql_text_enum!(ArtworkMimeType {
    Jpeg => "image/jpeg",
    Png => "image/png",
});

impl ArtworkMimeType {
    pub fn extension(self) -> &'static str {
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

/// Stored artwork as the renderer addresses it. Shared by the library catalog and playback items.
#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkRef {
    pub content_hash: String,
    pub mime_type: ArtworkMimeType,
    pub relative_path: String,
}

/// Where an image lives below the data directory: `artwork/<first two hash digits>/<hash>.<ext>`.
/// The only way a path is formatted or recognized as canonical.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtworkPath {
    hash: String,
    mime_type: ArtworkMimeType,
}

impl ArtworkPath {
    pub fn new(hash: String, mime_type: ArtworkMimeType) -> Self {
        Self { hash, mime_type }
    }

    pub fn parse(relative: &str) -> Option<Self> {
        let mut parts = relative.split('/');
        let (Some("artwork"), Some(shard), Some(file), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            return None;
        };
        let (hash, extension) = file.rsplit_once('.')?;
        let path = Self {
            hash: hash.to_owned(),
            mime_type: ArtworkMimeType::from_extension(extension)?,
        };
        (is_hash(hash) && path.shard() == shard).then_some(path)
    }

    /// `relative` is the canonical path of exactly this hash and type.
    pub fn is_canonical(hash: &str, mime_type: ArtworkMimeType, relative: &str) -> bool {
        Self::parse(relative).is_some_and(|path| path.hash == hash && path.mime_type == mime_type)
    }

    fn shard(&self) -> &str {
        &self.hash[..2]
    }

    /// The thumbnail of this image, stored next to it: `artwork/<shard>/<hash>.thumb.jpg`.
    pub fn thumbnail(&self) -> String {
        thumbnail_path(&self.hash)
    }
}

/// Where the thumbnail of the artwork with this hash lives below the data directory.
pub fn thumbnail_path(hash: &str) -> String {
    format!("artwork/{}/{hash}.thumb.jpg", &hash[..2])
}

/// The hash of a thumbnail's file name (`<hash>.thumb.jpg`), when it is one.
pub fn thumbnail_hash(file_name: &str) -> Option<&str> {
    file_name
        .strip_suffix(".thumb.jpg")
        .filter(|hash| is_hash(hash))
}

impl std::fmt::Display for ArtworkPath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "artwork/{}/{}.{}",
            self.shard(),
            self.hash,
            self.mime_type.extension()
        )
    }
}

fn is_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Debug, Clone)]
pub struct StoredArtwork {
    pub hash: String,
    pub mime_type: ArtworkMimeType,
    pub relative_path: String,
    pub byte_length: u64,
}

#[derive(Debug, Clone, Copy)]
pub enum ArtworkMaterializeError {
    Io,
}

pub fn materialize(
    root: &Path,
    bytes: &[u8],
    mime_type: ArtworkMimeType,
) -> Result<StoredArtwork, ArtworkMaterializeError> {
    let hash = blake3::hash(bytes).to_hex().to_string();
    let relative_path = ArtworkPath::new(hash.clone(), mime_type).to_string();
    let final_path = root.join(&relative_path);
    let stored = |byte_length| StoredArtwork {
        hash: hash.clone(),
        mime_type,
        relative_path: relative_path.clone(),
        byte_length,
    };
    if final_path.exists() {
        let size = fs::metadata(&final_path)
            .map_err(|_| ArtworkMaterializeError::Io)?
            .len();
        if size != bytes.len() as u64 {
            return Err(ArtworkMaterializeError::Io);
        }
        return Ok(stored(size));
    }
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|_| ArtworkMaterializeError::Io)?;
    }
    let temp_path = final_path.with_extension(format!(
        "{}.tmp-{}-{}",
        mime_type.extension(),
        std::process::id(),
        TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|_| ArtworkMaterializeError::Io)?;
        file.write_all(bytes)
            .map_err(|_| ArtworkMaterializeError::Io)?;
        file.flush().map_err(|_| ArtworkMaterializeError::Io)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
        return Err(ArtworkMaterializeError::Io);
    }
    if fs::rename(&temp_path, &final_path).is_err() {
        // Another writer stored the same content first.
        let stored_by_another = fs::metadata(&final_path)
            .ok()
            .filter(|metadata| metadata.len() == bytes.len() as u64);
        let _ = fs::remove_file(&temp_path);
        return stored_by_another
            .map(|metadata| stored(metadata.len()))
            .ok_or(ArtworkMaterializeError::Io);
    }
    Ok(stored(bytes.len() as u64))
}

/// Writes the thumbnail of a stored image unless it exists. The original is never touched.
pub fn ensure_thumbnail(
    root: &Path,
    original: &ArtworkPath,
) -> Result<(), ArtworkMaterializeError> {
    let final_path = root.join(original.thumbnail());
    if final_path.exists() {
        return Ok(());
    }
    let bytes =
        fs::read(root.join(original.to_string())).map_err(|_| ArtworkMaterializeError::Io)?;
    let decoded = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| ArtworkMaterializeError::Io)?
        .decode()
        .map_err(|_| ArtworkMaterializeError::Io)?;
    let decoded = if decoded.width() > THUMBNAIL_EDGE || decoded.height() > THUMBNAIL_EDGE {
        decoded.resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, FilterType::Lanczos3)
    } else {
        decoded
    };
    let mut encoded = Vec::new();
    JpegEncoder::new_with_quality(&mut encoded, THUMBNAIL_QUALITY)
        .encode_image(&decoded.to_rgb8())
        .map_err(|_| ArtworkMaterializeError::Io)?;
    let temp_path = final_path.with_extension(format!(
        "jpg.tmp-{}-{}",
        std::process::id(),
        TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let written =
        fs::write(&temp_path, &encoded).and_then(|()| fs::rename(&temp_path, &final_path));
    if written.is_err() {
        let _ = fs::remove_file(&temp_path);
        // Another writer may have stored it first.
        return if final_path.exists() {
            Ok(())
        } else {
            Err(ArtworkMaterializeError::Io)
        };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        image::DynamicImage::new_rgb8(width, height)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    #[test]
    fn a_thumbnail_is_made_next_to_an_untouched_original() {
        let root = std::env::temp_dir().join(format!("nap-thumb-{}", std::process::id()));
        let bytes = png(1200, 800);
        let stored = materialize(&root, &bytes, ArtworkMimeType::Png).unwrap();
        let original = ArtworkPath::parse(&stored.relative_path).unwrap();

        ensure_thumbnail(&root, &original).unwrap();
        ensure_thumbnail(&root, &original).unwrap();

        let thumb = image::open(root.join(original.thumbnail())).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (512, 341));
        assert_eq!(fs::read(root.join(&stored.relative_path)).unwrap(), bytes);
        assert_eq!(
            thumbnail_hash(&format!("{}.thumb.jpg", stored.hash)),
            Some(stored.hash.as_str())
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_small_image_is_not_enlarged() {
        let root = std::env::temp_dir().join(format!("nap-thumb-small-{}", std::process::id()));
        let stored = materialize(&root, &png(100, 100), ArtworkMimeType::Png).unwrap();
        let original = ArtworkPath::parse(&stored.relative_path).unwrap();
        ensure_thumbnail(&root, &original).unwrap();
        let thumb = image::open(root.join(original.thumbnail())).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (100, 100));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_canonical_path_is_formatted_and_parsed_by_one_type() {
        let hash = "ab".to_owned() + &"c".repeat(62);
        let path = ArtworkPath::new(hash.clone(), ArtworkMimeType::Png);
        let text = path.to_string();
        assert_eq!(text, format!("artwork/ab/{hash}.png"));
        assert_eq!(ArtworkPath::parse(&text), Some(path));
        assert!(ArtworkPath::is_canonical(
            &hash,
            ArtworkMimeType::Png,
            &text
        ));
        assert!(!ArtworkPath::is_canonical(
            &hash,
            ArtworkMimeType::Jpeg,
            &text
        ));
    }

    #[test]
    fn a_path_that_is_not_content_addressed_is_not_canonical() {
        let hash = "ab".to_owned() + &"c".repeat(62);
        for bad in [
            format!("artwork/cd/{hash}.png"),
            format!("artwork/ab/{hash}.gif"),
            format!("artwork/ab/../{hash}.png"),
            format!("other/ab/{hash}.png"),
            format!("artwork/ab/{}.png", &hash[..63]),
            "artwork/ab/x.png".to_owned(),
        ] {
            assert_eq!(ArtworkPath::parse(&bad), None, "{bad}");
        }
    }
}
