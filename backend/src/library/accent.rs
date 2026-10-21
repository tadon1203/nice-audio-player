use super::{artwork::ArtworkPath, database::Database, error::StoreError};
use crate::ids::ArtworkHash;
use image::{ImageReader, imageops::FilterType};
use rusqlite::{OptionalExtension, params};
use std::io::Cursor;

const SAMPLE_EDGE: u32 = 32;

/// The accent color of stored artwork, computed on first request and cached in its row. Writes
/// only the one cached value, in its own short transaction.
pub fn artwork_accent(
    database: &Database,
    hash: &ArtworkHash,
) -> Result<Option<String>, StoreError> {
    let row: Option<(i64, String, Option<String>)> = database
        .read()?
        .query_row(
            "SELECT id, relative_path, accent FROM artwork_assets WHERE content_hash = ?1",
            params![hash.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((id, relative_path, accent)) = row else {
        return Ok(None);
    };
    if accent.is_some() {
        return Ok(accent);
    }
    if ArtworkPath::parse(&relative_path).is_none() {
        return Ok(None);
    }
    let Ok(bytes) = std::fs::read(database.data_dir().join(&relative_path)) else {
        return Ok(None);
    };
    let Some(color) = representative_color(&bytes) else {
        return Ok(None);
    };
    database.write()?.execute(
        "UPDATE artwork_assets SET accent = ?2 WHERE id = ?1",
        params![id, color],
    )?;
    Ok(Some(color))
}

/// Picks a representative color for artwork as `#rrggbb`. The UI uses it for
/// backgrounds only, so it favors saturated pixels over the plain average and
/// falls back to the average for grayscale artwork.
pub fn representative_color(bytes: &[u8]) -> Option<String> {
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
    use image::{ExtendedColorType, ImageEncoder, codecs::png::PngEncoder};

    fn png(width: u32, height: u32, fill: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
        let mut raw = Vec::new();
        for y in 0..height {
            for x in 0..width {
                raw.extend_from_slice(&fill(x, y));
            }
        }
        let mut out = Vec::new();
        PngEncoder::new(&mut out)
            .write_image(&raw, width, height, ExtendedColorType::Rgb8)
            .expect("encode png");
        out
    }

    #[test]
    fn returns_the_fill_color_for_flat_artwork() {
        let bytes = png(8, 8, |_, _| [200, 40, 40]);
        assert_eq!(representative_color(&bytes).as_deref(), Some("#c82828"));
    }

    #[test]
    fn prefers_saturated_pixels_over_a_gray_background() {
        let bytes = png(
            16,
            16,
            |x, _| if x < 12 { [128, 128, 128] } else { [0, 0, 255] },
        );
        let color = representative_color(&bytes).expect("color");
        let blue = u8::from_str_radix(
            color.get(5..7).expect("a #rrggbb color has blue digits"),
            16,
        )
        .expect("blue channel");
        let red = u8::from_str_radix(color.get(1..3).expect("a #rrggbb color has red digits"), 16)
            .expect("red channel");
        assert!(blue > red + 40, "{color} should lean blue");
    }

    #[test]
    fn falls_back_to_the_average_for_grayscale_artwork() {
        let bytes = png(8, 8, |_, _| [100, 100, 100]);
        assert_eq!(representative_color(&bytes).as_deref(), Some("#646464"));
    }

    #[test]
    fn rejects_bytes_that_are_not_an_image() {
        assert_eq!(representative_color(b"not an image"), None);
    }

    #[test]
    fn an_accent_is_computed_once_then_read_from_the_database() {
        let directory = crate::test_support::TestDirectory::new();
        let database = Database::initialize(&directory.file("data")).expect("database");
        let hash = ArtworkHash::try_from("d".repeat(64)).unwrap();
        let relative = format!("artwork/dd/{}.png", hash.as_str());
        std::fs::create_dir_all(database.data_dir().join("artwork/dd")).unwrap();
        std::fs::write(
            database.data_dir().join(&relative),
            png(4, 4, |_, _| [200, 40, 40]),
        )
        .unwrap();
        database
            .write()
            .unwrap()
            .execute(
                "INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length) VALUES(1,?1,'image/png',?2,1)",
                params![hash.as_str(), relative],
            )
            .unwrap();

        assert_eq!(
            artwork_accent(&database, &hash).unwrap().as_deref(),
            Some("#c82828")
        );
        std::fs::remove_file(database.data_dir().join(&relative)).unwrap();
        assert_eq!(
            artwork_accent(&database, &hash).unwrap().as_deref(),
            Some("#c82828"),
            "cached in the database"
        );
        let unknown = ArtworkHash::try_from("e".repeat(64)).unwrap();
        assert_eq!(artwork_accent(&database, &unknown).unwrap(), None);
    }
}
