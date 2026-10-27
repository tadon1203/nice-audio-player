//! Artwork as the Library reads it: the paths of the content-addressed image files under the
//! application data directory, the request that serves them, and the accent color. The files are
//! written by `sync/artwork.rs`.
//!
//! An image is stored as `artwork/<shard>/<hash>.<ext>` and its thumbnail beside it as
//! `artwork/<shard>/<hash>.thumb.jpg`, where the shard is the first two hash digits. Both paths
//! follow from the hash and the MIME type, so the database holds neither.

use crate::ids::ArtworkHash;
use crate::library::errors::Result;
use crate::library::storage::Database;
use crate::library::storage::columns::sql_text_enum;
use image::{ImageReader, imageops::FilterType};
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use std::{fs, io::Cursor, path::Path};

/// The longest edge of the image the accent color is computed from.
const SAMPLE_EDGE: u32 = 32;

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
            .find(|mime_type| mime_type.extension() == extension)
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

/// The artwork a row names, from its hash, its type and whether its thumbnail exists. A row with no
/// artwork has no hash, so the join gives `None`.
pub(crate) fn artwork_ref(
    hash: Option<String>,
    mime_type: Option<ArtworkMimeType>,
    has_thumbnail: Option<bool>,
) -> Option<ArtworkRef> {
    let hash = ArtworkHash::try_from(hash?).ok()?;
    Some(ArtworkRef::new(&hash, mime_type?, has_thumbnail?))
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
pub(crate) enum Requested {
    Original(ArtworkMimeType),
    Thumbnail,
}

/// Validates a request path from the protocol. Anything that is not an artwork path is `None`.
pub(crate) fn parse_request(relative: &str) -> Option<(ArtworkHash, Requested)> {
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
pub(crate) fn serve_artwork(data_dir: &Path, relative: &str) -> Option<ServedArtwork> {
    let (hash, requested) = parse_request(relative)?;
    let (path, mime_type) = match requested {
        Requested::Original(mime_type) => (original_path(&hash, mime_type), mime_type.as_str()),
        Requested::Thumbnail => (thumbnail_path(&hash), "image/jpeg"),
    };
    let bytes = fs::read(data_dir.join(path)).ok()?;
    Some(ServedArtwork { bytes, mime_type })
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDirectory;

    fn hash_of(bytes: &[u8]) -> ArtworkHash {
        ArtworkHash::try_from(blake3::hash(bytes).to_hex().to_string()).unwrap()
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
        let directory = TestDirectory::new();
        let hash = ArtworkHash::try_from("ab".repeat(32)).unwrap();
        fs::create_dir_all(directory.path().join("artwork/ab")).unwrap();
        let original = original_path(&hash, ArtworkMimeType::Png);
        fs::write(directory.path().join(&original), b"original").unwrap();
        let thumb = thumbnail_path(&hash);

        assert_eq!(
            serve_artwork(directory.path(), &thumb),
            None,
            "no thumbnail file yet"
        );
        fs::write(directory.path().join(&thumb), b"thumb").unwrap();
        let served = serve_artwork(directory.path(), &thumb).unwrap();
        assert_eq!(
            (served.bytes.as_slice(), served.mime_type),
            (&b"thumb"[..], "image/jpeg")
        );
        let full = serve_artwork(directory.path(), &original).unwrap();
        assert_eq!(
            (full.bytes.as_slice(), full.mime_type),
            (&b"original"[..], "image/png")
        );

        fs::write(directory.path().join("secret.png"), b"x").unwrap();
        for bad in [
            "artwork/../secret.png".to_owned(),
            format!("artwork/aa/{}.png", hash.as_str()),
            format!("artwork/ab/{}.jpg", "AB".repeat(32)),
            format!("artwork/ab/{}.gif", hash.as_str()),
            format!("artwork/ab/{}.thumb.png", hash.as_str()),
            format!("asset/artwork/ab/{}.png", hash.as_str()),
        ] {
            assert!(serve_artwork(directory.path(), &bad).is_none(), "{bad}");
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
