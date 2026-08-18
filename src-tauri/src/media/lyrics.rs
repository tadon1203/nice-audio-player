use crate::lyrics::{
    lrc::{self, LrcParse},
    model::LyricsContent,
};
use lofty::{config::ParseOptions, file::TaggedFileExt, probe::Probe, tag::ItemKey};

/// Converts Lofty tag data into the provider-neutral Lyrics domain.
/// No Lofty frame or tag types leave this module.
pub fn read_embedded_lyrics(
    path: &std::path::Path,
) -> Result<Option<(Option<String>, LyricsContent)>, ()> {
    let tagged = Probe::open(path)
        .map_err(|_| ())?
        .options(ParseOptions::new().read_properties(false))
        .read()
        .map_err(|_| ())?;
    let mut saw_lyrics = false;
    for tag in tagged.tags().iter().chain(tagged.primary_tag()) {
        if let Some(value) = tag.get_string(ItemKey::Lyrics) {
            saw_lyrics = true;
            match lrc::parse(value) {
                LrcParse::Parsed(language, content) => return Ok(Some((language, content))),
                LrcParse::Empty => {}
                LrcParse::Malformed => return Err(()),
            }
            if let Some(parsed) = lrc::parse_plain(value) {
                return Ok(Some(parsed));
            }
        }
        if let Some(value) = tag.get_string(ItemKey::UnsyncLyrics) {
            saw_lyrics = true;
            if let Some(parsed) = lrc::parse_plain(value) {
                return Ok(Some(parsed));
            }
        }
    }
    if saw_lyrics {
        Err(())
    } else {
        Ok(None)
    }
}
