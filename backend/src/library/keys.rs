//! The normalized facts the Library files a track under. They are computed here, once, when a
//! track is written (and when migration 0002 backfills old rows), and the catalog reads them
//! back from their columns, so every view agrees on what an album, an Album Artist or a year is.
//!
//! Unknown is the empty string: the backend never returns display strings (CONTRIBUTING).

use std::path::Path;

/// The keys of one track's metadata row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrackKeys {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<i32>,
}

impl TrackKeys {
    pub fn new(
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        album_artist: Option<&str>,
        date: Option<&str>,
        file_name: &str,
    ) -> Self {
        Self {
            title: title_key(title, file_name),
            artist: text_key(artist),
            album: text_key(album),
            album_artist: album_artist_key(album_artist, artist),
            year: date.and_then(year_of),
        }
    }
}

/// A tag value with its surrounding space removed; unknown is `""`. Identity is
/// case-sensitive: "Case" and "case" are two albums.
pub(crate) fn text_key(value: Option<&str>) -> String {
    value.map_or("", str::trim).to_owned()
}

/// The artist an album is filed under: its Album Artist tag, else the track's artist.
pub(crate) fn album_artist_key(album_artist: Option<&str>, artist: Option<&str>) -> String {
    [album_artist, artist]
        .into_iter()
        .map(|value| text_key(value))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

/// What a track is called: its title tag, else its file name without the extension.
pub(crate) fn title_key(title: Option<&str>, file_name: &str) -> String {
    let title = text_key(title);
    if !title.is_empty() {
        return title;
    }
    Path::new(file_name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(file_name)
        .to_owned()
}

/// The year of a tag date (`2019`, `2019-05`, `2019-05-03`): its first four characters, when they
/// are digits from 1000 to 9999. Anything else, `0000` included, is no year.
pub(crate) fn year_of(date: &str) -> Option<i32> {
    let year = date.trim().get(..4)?;
    if !year.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    year.parse()
        .ok()
        .filter(|year| (1000..=9999).contains(year))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_year_is_four_digits_from_1000_to_9999() {
        assert_eq!(year_of("2019"), Some(2019));
        assert_eq!(year_of(" 2019-05-03"), Some(2019));
        assert_eq!(year_of("1000"), Some(1000));
        assert_eq!(year_of("9999-12"), Some(9999));
        for none in [
            "0000",
            "0999",
            "19",
            "n/a",
            "+123",
            "-123",
            "日本語日本語",
            "",
        ] {
            assert_eq!(year_of(none), None, "{none:?}");
        }
    }

    #[test]
    fn the_effective_album_artist_falls_back_to_the_artist() {
        assert_eq!(album_artist_key(Some(" Band "), Some("Singer")), "Band");
        assert_eq!(album_artist_key(Some("  "), Some("Singer")), "Singer");
        assert_eq!(album_artist_key(None, Some(" Singer")), "Singer");
        assert_eq!(album_artist_key(None, None), "");
    }

    #[test]
    fn a_title_falls_back_to_the_file_name_without_its_extension() {
        assert_eq!(title_key(Some(" Song "), "01.flac"), "Song");
        assert_eq!(title_key(Some(""), "multi.part.flac"), "multi.part");
        assert_eq!(title_key(None, "plain"), "plain");
    }

    #[test]
    fn identity_keeps_case() {
        assert_ne!(text_key(Some("Case")), text_key(Some("case")));
    }
}
