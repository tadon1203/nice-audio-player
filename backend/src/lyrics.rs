//! The lyrics of a track: a `.lrc` sidecar beside the audio file, or lyrics embedded in its tags.
//! A sidecar that is present but unusable falls back to the embedded lyrics.

use std::borrow::Cow;
use std::fs;
use std::path::Path;

use lofty::{config::ParseOptions, file::TaggedFileExt, probe::Probe, tag::ItemKey};

use crate::library::tracks::PlayableTrack;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LyricsTimedLine {
    pub start_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LyricsContent {
    Plain { lines: Vec<String> },
    Timed { lines: Vec<LyricsTimedLine> },
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LyricsNotice {
    SidecarFailedUsingEmbedded,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Lyrics {
    Found {
        content: LyricsContent,
        notice: Option<LyricsNotice>,
    },
    NotFound,
    SourceFailed {
        /// The name of the sidecar file the track looks for, without its directory.
        sidecar_file_name: String,
    },
}

/// What one lyrics source held: lyrics, nothing at all, or something that could not be read.
enum LocalSource {
    Found(LyricsContent),
    Missing,
    Failed,
}

/// Resolves the lyrics of `track`: its sidecar first, then its embedded lyrics.
pub fn load(track: &PlayableTrack) -> Lyrics {
    let audio = &track.file.path;
    let sidecar = audio.with_extension("lrc");
    let sidecar_file_name = sidecar
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    combine(
        read_sidecar(&sidecar),
        read_embedded(audio),
        sidecar_file_name,
    )
}

fn combine(sidecar: LocalSource, embedded: LocalSource, sidecar_file_name: String) -> Lyrics {
    match (sidecar, embedded) {
        (LocalSource::Failed, LocalSource::Found(content)) => {
            found(content, Some(LyricsNotice::SidecarFailedUsingEmbedded))
        }
        (LocalSource::Found(content), _) | (LocalSource::Missing, LocalSource::Found(content)) => {
            found(content, None)
        }
        (LocalSource::Missing, LocalSource::Missing) => Lyrics::NotFound,
        _ => Lyrics::SourceFailed { sidecar_file_name },
    }
}

fn found(content: LyricsContent, notice: Option<LyricsNotice>) -> Lyrics {
    Lyrics::Found { content, notice }
}

fn read_sidecar(path: &Path) -> LocalSource {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return LocalSource::Missing,
        Err(_) => return LocalSource::Failed,
    };
    match decode_text(&bytes).map(|text| parse_lrc(&text)) {
        Some(LrcParse::Parsed(content)) => LocalSource::Found(content),
        Some(LrcParse::Empty | LrcParse::Malformed) | None => LocalSource::Failed,
    }
}

/// Decodes a sidecar file. A byte-order mark or valid UTF-8 is taken at its word; anything else
/// is a legacy encoding (`.lrc` files for Japanese music are often `Shift_JIS`), which is detected
/// from the bytes. Bytes that do not decode cleanly in the detected encoding fail the source.
fn decode_text(bytes: &[u8]) -> Option<String> {
    if let Some((encoding, bom_length)) = encoding_rs::Encoding::for_bom(bytes) {
        return encoding
            .decode_without_bom_handling_and_without_replacement(&bytes[bom_length..])
            .map(Cow::into_owned);
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Some(text.to_owned());
    }
    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, chardetng::Utf8Detection::Deny);
    encoding
        .decode_without_bom_handling_and_without_replacement(bytes)
        .map(Cow::into_owned)
}

/// The lyrics embedded in the audio file's tags. A tag that is present but holds nothing usable
/// fails the source; a file without lyrics tags is missing them.
fn read_embedded(path: &Path) -> LocalSource {
    let tagged = match Probe::open(path).and_then(|probe| {
        probe
            .options(ParseOptions::new().read_properties(false))
            .read()
    }) {
        Ok(tagged) => tagged,
        Err(cause) => {
            log::warn!("media.lyrics.read_failed cause={cause}");
            return LocalSource::Failed;
        }
    };
    let mut saw_lyrics = false;
    for tag in tagged.tags() {
        if let Some(value) = tag.get_string(ItemKey::Lyrics) {
            saw_lyrics = true;
            match parse_lrc(value) {
                LrcParse::Parsed(content) => return LocalSource::Found(content),
                LrcParse::Empty => {}
                LrcParse::Malformed => return LocalSource::Failed,
            }
            if let Some(content) = parse_plain(value) {
                return LocalSource::Found(content);
            }
        }
        if let Some(value) = tag.get_string(ItemKey::UnsyncLyrics) {
            saw_lyrics = true;
            if let Some(content) = parse_plain(value) {
                return LocalSource::Found(content);
            }
        }
    }
    if saw_lyrics {
        LocalSource::Failed
    } else {
        LocalSource::Missing
    }
}

enum LrcParse {
    Parsed(LyricsContent),
    Empty,
    Malformed,
}

fn parse_lrc(input: &str) -> LrcParse {
    // Some taggers store plain, unsynced lyrics in the frame that LRC uses (for
    // example, FLAC `LYRICS`). If no line starts with `[`, the input is not LRC.
    // Do not pass it to the LRC parser. The parser fails with an internal "Eof"
    // error, which looks the same as malformed LRC. Return `Empty` so that the
    // caller falls back to plain-text lyrics.
    if !input.lines().any(|line| line.trim_start().starts_with('[')) {
        return LrcParse::Empty;
    }
    let Ok(lyrics) = lrc_rs::SyncedLyrics::parse(input) else {
        return LrcParse::Malformed;
    };
    if lyrics.lines.is_empty() {
        return LrcParse::Empty;
    }
    let lines = lyrics
        .lines
        .into_iter()
        .map(|line| LyricsTimedLine {
            start_ms: line.timestamp.as_millis().try_into().unwrap_or(u64::MAX),
            text: line
                .segments
                .into_iter()
                .map(|segment| segment.content)
                .collect::<String>(),
        })
        .collect();
    LrcParse::Parsed(LyricsContent::Timed { lines })
}

fn parse_plain(input: &str) -> Option<LyricsContent> {
    let lines: Vec<String> = input
        .lines()
        .map(|line| line.trim_end_matches('\r').to_owned())
        .collect();
    lines
        .iter()
        .any(|line| !line.trim().is_empty())
        .then_some(LyricsContent::Plain { lines })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDirectory;

    fn plain(text: &str) -> LocalSource {
        LocalSource::Found(LyricsContent::Plain {
            lines: vec![text.to_owned()],
        })
    }

    #[test]
    fn prefers_a_valid_sidecar_over_embedded_lyrics() {
        let lyrics = combine(plain("sidecar"), plain("embedded"), "song.lrc".to_owned());
        let Lyrics::Found { notice, .. } = lyrics else {
            panic!("expected found lyrics")
        };
        assert!(notice.is_none());
    }

    #[test]
    fn falls_back_to_embedded_lyrics_when_the_sidecar_is_broken() {
        let lyrics = combine(
            LocalSource::Failed,
            plain("embedded"),
            "song.lrc".to_owned(),
        );
        assert!(matches!(
            lyrics,
            Lyrics::Found {
                notice: Some(LyricsNotice::SidecarFailedUsingEmbedded),
                ..
            }
        ));
    }

    #[test]
    fn distinguishes_missing_local_sources_from_failed_ones() {
        assert!(matches!(
            combine(
                LocalSource::Missing,
                LocalSource::Missing,
                "song.lrc".to_owned()
            ),
            Lyrics::NotFound
        ));
        assert!(matches!(
            combine(
                LocalSource::Failed,
                LocalSource::Missing,
                "song.lrc".to_owned()
            ),
            Lyrics::SourceFailed { .. }
        ));
    }

    #[test]
    fn the_sidecar_name_swaps_only_the_final_extension() {
        let sidecar = Path::new("/m/a.b/c.d.mp3").with_extension("lrc");
        assert_eq!(sidecar.file_name().unwrap(), "c.d.lrc");
    }

    #[test]
    fn reads_utf8_utf16_and_legacy_encoded_sidecars() {
        let directory = TestDirectory::new();
        let utf8 = directory.file("utf8.lrc");
        let utf16 = directory.file("utf16.lrc");
        let legacy = directory.file("legacy.lrc");
        fs::write(&utf8, b"[00:01]Hello").expect("write UTF-8 sidecar");
        fs::write(&utf16, [0xff, 0xfe, b'H', 0, b'i', 0]).expect("write UTF-16 sidecar");
        let (shift_jis, _, _) = encoding_rs::SHIFT_JIS.encode(
            "[00:01]こんにちは、世界
[00:05]夜空の向こうへ",
        );
        fs::write(&legacy, &shift_jis).expect("write legacy sidecar");

        assert_eq!(
            decode_text(&fs::read(utf8).unwrap()),
            Some("[00:01]Hello".to_owned())
        );
        assert_eq!(
            decode_text(&fs::read(utf16).unwrap()),
            Some("Hi".to_owned())
        );
        assert_eq!(
            decode_text(&fs::read(legacy).unwrap()),
            Some(
                "[00:01]こんにちは、世界
[00:05]夜空の向こうへ"
                    .to_owned()
            )
        );
    }

    #[test]
    fn treats_a_malformed_sidecar_as_a_failed_source() {
        let directory = TestDirectory::new();
        let sidecar = directory.file("track.lrc");
        fs::write(&sidecar, "[00:0é]invalid").expect("write sidecar");
        assert!(matches!(read_sidecar(&sidecar), LocalSource::Failed));
        assert!(matches!(
            read_sidecar(&directory.file("missing.lrc")),
            LocalSource::Missing
        ));
    }

    #[test]
    fn parses_timed_and_plain_lyrics() {
        let LrcParse::Parsed(LyricsContent::Timed { lines }) = parse_lrc("[00:01.20]Hello") else {
            panic!("expected timed lyrics")
        };
        assert_eq!(lines[0].start_ms, 1_200);
        let Some(LyricsContent::Plain { lines }) = parse_plain("First\nSecond") else {
            panic!("expected plain lyrics")
        };
        assert_eq!(lines, ["First", "Second"]);
    }

    #[test]
    fn treats_bracket_free_text_as_not_lrc_instead_of_malformed() {
        assert!(matches!(
            parse_lrc("Hey, baby (hey)\nOoh, ooh\nOh, yeah"),
            LrcParse::Empty
        ));
    }

    #[test]
    fn blank_text_has_no_plain_lyrics() {
        assert!(
            parse_plain(
                " 
	"
            )
            .is_none()
        );
    }

    #[test]
    fn joins_a2_segments_into_their_line_text() {
        let LrcParse::Parsed(LyricsContent::Timed { lines }) =
            parse_lrc("[00:01.00] <00:01.10>A <00:01.20>B")
        else {
            panic!("expected timed lyrics")
        };
        assert_eq!(lines[0].start_ms, 1_000);
        assert_eq!(lines[0].text, "A B");
    }
}
