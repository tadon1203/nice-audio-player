use image::{imageops::FilterType, ImageReader};
use std::io::Cursor;

const SAMPLE_EDGE: u32 = 32;

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
    use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};

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
        let blue = u8::from_str_radix(&color[5..7], 16).expect("blue channel");
        let red = u8::from_str_radix(&color[1..3], 16).expect("red channel");
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
}
