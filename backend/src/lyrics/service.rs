use super::{
    lrc::{self, LrcParse},
    model::{LyricsDocument, LyricsResolution, LyricsSourceKind, LyricsTrackContext},
};
use crate::media::lyrics::read_embedded_lyrics;
use std::{fs, path::PathBuf};

type ParsedLyrics = (Option<String>, super::model::LyricsContent);

enum LocalSource {
    Missing,
    Failed,
    Resolved(ParsedLyrics),
}

#[derive(Clone, Copy)]
pub struct LyricsService;
impl LyricsService {
    pub fn resolve(&self, context: LyricsTrackContext) -> LyricsResolution {
        let sidecar = read_sidecar(&context);
        let embedded = match read_embedded_lyrics(&context.source) {
            Ok(Some(lyrics)) => LocalSource::Resolved(lyrics),
            Ok(None) => LocalSource::Missing,
            Err(_) => LocalSource::Failed,
        };
        let sidecar_file_name = sidecar_path(&context.source)
            .file_name()
            .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
        resolve_local_sources(context.track_id, sidecar_file_name, sidecar, embedded)
    }
}

fn resolve_local_sources(
    track_id: String,
    sidecar_file_name: String,
    sidecar: LocalSource,
    embedded: LocalSource,
) -> LyricsResolution {
    match (sidecar, embedded) {
        (LocalSource::Resolved((language, content)), _) => LyricsResolution::Resolved {
            track_id,
            document: LyricsDocument {
                source: LyricsSourceKind::Sidecar,
                language,
                content,
            },
            notice: None,
        },
        (LocalSource::Failed, LocalSource::Resolved((language, content))) => {
            LyricsResolution::Resolved {
                track_id,
                document: LyricsDocument {
                    source: LyricsSourceKind::Embedded,
                    language,
                    content,
                },
                notice: Some(super::model::LyricsResolutionNotice::SidecarFailedUsingEmbedded),
            }
        }
        (LocalSource::Missing, LocalSource::Resolved((language, content))) => {
            LyricsResolution::Resolved {
                track_id,
                document: LyricsDocument {
                    source: LyricsSourceKind::Embedded,
                    language,
                    content,
                },
                notice: None,
            }
        }
        (LocalSource::Missing, LocalSource::Missing) => LyricsResolution::NotFound { track_id },
        _ => LyricsResolution::SourceFailed {
            track_id,
            sidecar_file_name,
        },
    }
}

fn read_sidecar(context: &LyricsTrackContext) -> LocalSource {
    let candidate = sidecar_path(&context.source);
    match fs::metadata(&candidate) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => LocalSource::Missing,
        Err(_) => LocalSource::Failed,
        Ok(metadata) if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 => {
            LocalSource::Failed
        }
        Ok(_) => dunce::canonicalize(candidate)
            .ok()
            .filter(|path| path.starts_with(&context.root))
            .and_then(read_text)
            .map(|text| match lrc::parse(&text) {
                LrcParse::Parsed(language, content) => LocalSource::Resolved((language, content)),
                LrcParse::Empty | LrcParse::Malformed => LocalSource::Failed,
            })
            .unwrap_or(LocalSource::Failed),
    }
}
fn sidecar_path(source: &std::path::Path) -> PathBuf {
    source.with_extension("lrc")
}
fn read_text(path: PathBuf) -> Option<String> {
    decode_text(&fs::read(path).ok()?)
}

/// Decodes a sidecar file. A byte-order mark or valid UTF-8 is taken at its word; anything else
/// is a legacy encoding (`.lrc` files for Japanese music are often Shift_JIS), which is detected
/// from the bytes. Bytes that do not decode cleanly in the detected encoding fail the source.
fn decode_text(bytes: &[u8]) -> Option<String> {
    if let Some(rest) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8(rest.to_vec()).ok();
    }
    if let Some(rest) = bytes.strip_prefix(&[0xff, 0xfe]) {
        return decode_utf16(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xfe, 0xff]) {
        return decode_utf16(rest, false);
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Some(text.to_owned());
    }
    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, chardetng::Utf8Detection::Deny);
    encoding
        .decode_without_bom_handling_and_without_replacement(bytes)
        .map(std::borrow::Cow::into_owned)
}
fn decode_utf16(bytes: &[u8], little: bool) -> Option<String> {
    let units = bytes.as_chunks::<2>().0.iter().map(|pair| {
        if little {
            u16::from_le_bytes([pair[0], pair[1]])
        } else {
            u16::from_be_bytes([pair[0], pair[1]])
        }
    });
    String::from_utf16(&units.collect::<Vec<_>>()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(text: &str) -> LocalSource {
        LocalSource::Resolved((
            None,
            super::super::model::LyricsContent::Plain {
                lines: vec![text.to_string()],
            },
        ))
    }

    #[test]
    fn prefers_a_valid_sidecar_over_embedded_lyrics() {
        let resolution = resolve_local_sources(
            "1".to_string(),
            "song.lrc".to_string(),
            plain("sidecar"),
            plain("embedded"),
        );
        let LyricsResolution::Resolved {
            document, notice, ..
        } = resolution
        else {
            panic!("expected a resolved document")
        };
        assert!(matches!(document.source, LyricsSourceKind::Sidecar));
        assert!(notice.is_none());
    }

    #[test]
    fn falls_back_to_embedded_lyrics_when_the_sidecar_is_broken() {
        let resolution = resolve_local_sources(
            "1".to_string(),
            "song.lrc".to_string(),
            LocalSource::Failed,
            plain("embedded"),
        );
        let LyricsResolution::Resolved {
            document, notice, ..
        } = resolution
        else {
            panic!("expected embedded fallback")
        };
        assert!(matches!(document.source, LyricsSourceKind::Embedded));
        assert!(matches!(
            notice,
            Some(super::super::model::LyricsResolutionNotice::SidecarFailedUsingEmbedded)
        ));
    }

    #[test]
    fn distinguishes_missing_local_sources_from_failed_ones() {
        assert!(matches!(
            resolve_local_sources(
                "1".to_string(),
                "song.lrc".to_string(),
                LocalSource::Missing,
                LocalSource::Missing
            ),
            LyricsResolution::NotFound { .. }
        ));
        assert!(matches!(
            resolve_local_sources(
                "1".to_string(),
                "song.lrc".to_string(),
                LocalSource::Failed,
                LocalSource::Missing
            ),
            LyricsResolution::SourceFailed { .. }
        ));
    }

    #[test]
    fn the_sidecar_name_swaps_only_the_final_extension() {
        let sidecar = sidecar_path(std::path::Path::new("/m/a.b/c.d.mp3"));
        assert_eq!(sidecar.file_name().unwrap(), "c.d.lrc");
    }

    #[test]
    fn reads_utf8_utf16_and_legacy_encoded_sidecars() {
        let directory = std::env::temp_dir().join(format!(
            "nice-audio-player-lyrics-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir(&directory).expect("create test directory");
        let utf8 = directory.join("utf8.lrc");
        let utf16 = directory.join("utf16.lrc");
        let legacy = directory.join("legacy.lrc");
        fs::write(&utf8, b"[00:01]Hello").expect("write UTF-8 sidecar");
        fs::write(&utf16, [0xff, 0xfe, b'H', 0, b'i', 0]).expect("write UTF-16 sidecar");
        let (shift_jis, _, _) = encoding_rs::SHIFT_JIS.encode(
            "[00:01]こんにちは、世界
[00:05]夜空の向こうへ",
        );
        fs::write(&legacy, &shift_jis).expect("write legacy sidecar");

        assert_eq!(read_text(utf8), Some("[00:01]Hello".to_string()));
        assert_eq!(read_text(utf16), Some("Hi".to_string()));
        assert_eq!(
            read_text(legacy),
            Some(
                "[00:01]こんにちは、世界
[00:05]夜空の向こうへ"
                    .to_string()
            )
        );

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn treats_a_malformed_sidecar_as_a_failed_source() {
        let directory = std::env::temp_dir().join(format!(
            "nice-audio-player-lyrics-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir(&directory).expect("create test directory");
        let source = directory.join("track.mp3");
        fs::write(&source, []).expect("write source placeholder");
        fs::write(directory.join("track.lrc"), b"[00:60]invalid").expect("write sidecar");
        let context = LyricsTrackContext {
            track_id: "1".to_string(),
            source: dunce::canonicalize(source).expect("canonical source"),
            root: dunce::canonicalize(&directory).expect("canonical root"),
        };

        assert!(matches!(read_sidecar(&context), LocalSource::Failed));

        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
