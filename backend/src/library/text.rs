//! How the Library compares and orders names, so the sort order, the filter and the letter index
//! of a list agree with each other for Japanese as well as Latin titles. It also holds the
//! normalized facts a track is filed under (`TrackKeys`), which are computed here once, when a
//! track is written, and read back from their columns.
//!
//! Every name is *folded*: NFKC (full-width and half-width forms become one), katakana become
//! hiragana, letters lowercase, Latin accents drop. A name is sorted by its folded form (or the
//! tag's `SortOrder`, folded), searched by it, and filed in the letter index by its first character.
//! Kanji have no reading to sort by, so they sort by code point and share one index entry.
//!
//! Unknown is the empty string: the backend never returns display strings (ARCHITECTURE).

use crate::ids::AlbumId;
use std::ffi::OsStr;
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

/// Put in front of a sort key that starts with something other than a letter or a digit, so
/// symbols come first as one block instead of being scattered between the scripts.
const SYMBOL_PREFIX: char = '\u{1}';

/// Separates the names in a search key; no search text can contain it.
pub(crate) const SEARCH_SEPARATOR: char = '\u{1f}';

/// The label of names that have no value to be filed by.
pub(crate) const UNKNOWN_LABEL: &str = "?";

/// The one entry of every kanji.
pub(crate) const KANJI_LABEL: &str = "漢";

/// The folded form of `text`: what two names are compared by when they are searched.
pub(crate) fn fold(text: &str) -> String {
    let mut folded = String::with_capacity(text.len());
    for c in text.trim().nfkc() {
        // A Latin letter with its accent loses the accent; kana keep their dakuten.
        let plain = if c.is_ascii() {
            c
        } else {
            let mut parts = c.nfd();
            match (parts.next(), parts.next()) {
                (Some(base), Some(mark)) if base.is_ascii_alphabetic() && is_mark(mark) => base,
                _ => c,
            }
        };
        folded.extend(hiragana(plain).to_lowercase());
    }
    folded
}

fn is_mark(c: char) -> bool {
    ('\u{300}'..='\u{36f}').contains(&c)
}

/// Katakana as the hiragana they are read as; anything else as it is.
fn hiragana(c: char) -> char {
    match c {
        '\u{30a1}'..='\u{30f6}' | '\u{30fd}' | '\u{30fe}' => {
            char::from_u32(c as u32 - 0x60).unwrap_or(c)
        }
        _ => c,
    }
}

/// What a name sorts by: its `SortOrder` tag when it has one, else the name, folded. An unknown
/// name (`""`) has no sort key, whatever the tag says, and sorts last.
pub(crate) fn sort_key(name: &str, sort_tag: Option<&str>) -> String {
    if name.trim().is_empty() {
        return String::new();
    }
    let source = sort_tag
        .filter(|tag| !tag.trim().is_empty())
        .unwrap_or(name);
    let mut key = fold(source);
    if !key.chars().next().is_some_and(char::is_alphanumeric) {
        key.insert(0, SYMBOL_PREFIX);
    }
    key
}

/// The search key of several names: their folded forms in a row.
pub(crate) fn search_key(names: &[&str]) -> String {
    names
        .iter()
        .map(|name| fold(name))
        .collect::<Vec<_>>()
        .join(&SEARCH_SEPARATOR.to_string())
}

/// What a search text is matched against a search key as: folded.
pub(crate) fn search_text(search: &str) -> String {
    fold(search)
}

/// Where the first character of a sort key is filed in the letter index. Labels follow the sort
/// order: symbols and digits `#`, Latin letters, the rows of the kana (か for が), other scripts
/// letter by letter, and all kanji as one `漢`. Names without a key are `?`, which sort last.
pub(crate) fn index_label(sort_key: &str) -> String {
    let Some(first) = sort_key.chars().next() else {
        return UNKNOWN_LABEL.into();
    };
    match first {
        SYMBOL_PREFIX | '0'..='9' => "#".into(),
        'a'..='z' => first.to_ascii_uppercase().to_string(),
        '\u{3041}'..='\u{3049}' | '\u{304a}' => "あ".into(),
        '\u{304b}'..='\u{3054}' => "か".into(),
        '\u{3055}'..='\u{305e}' => "さ".into(),
        '\u{305f}'..='\u{3069}' => "た".into(),
        '\u{306a}'..='\u{306e}' => "な".into(),
        '\u{306f}'..='\u{307d}' => "は".into(),
        '\u{307e}'..='\u{3082}' => "ま".into(),
        '\u{3083}'..='\u{3088}' => "や".into(),
        '\u{3089}'..='\u{308e}' => "ら".into(),
        // The rest of the hiragana block and what follows it (ー), still before the kanji.
        '\u{308f}'..='\u{30ff}' => "わ".into(),
        '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}' | '\u{f900}'..='\u{faff}' => {
            KANJI_LABEL.into()
        }
        '\u{ac00}'..='\u{d7a3}' => "한".into(),
        other => other.to_uppercase().collect(),
    }
}

/// The `SortOrder` tags of a track (`TITLESORT`, `ARTISTSORT`, `ALBUMSORT`, `ALBUMARTISTSORT`).
#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct SortTags<'a> {
    pub title: Option<&'a str>,
    pub artist: Option<&'a str>,
    pub album: Option<&'a str>,
    pub album_artist: Option<&'a str>,
}

/// The keys of one track's metadata row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TrackKeys {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub year: Option<i32>,
    /// What each name sorts by (see `sort_key`); `""` for an unknown one.
    pub title_sort: String,
    pub artist_sort: String,
    pub album_sort: String,
    pub album_artist_sort: String,
    /// The folded names the filter looks in.
    pub search: String,
    /// Which printing of the album the track is on (see [`album_edition_of`]), `""` for a track
    /// with no album.
    pub album_directory: String,
    /// The album the track is on (see `AlbumId`); a track with no album has the ID of an empty
    /// title in an empty directory.
    pub album_id: String,
}

impl TrackKeys {
    pub(crate) fn new(
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        album_artist: Option<&str>,
        date: Option<&str>,
        file_name: &str,
    ) -> Self {
        Self::build(
            [title, artist, album, album_artist],
            date,
            file_name,
            SortTags::default(),
            "",
            "",
        )
    }

    /// All the keys. `album_directory` is the album's edition (see [`album_edition_of`]) and
    /// `directory_path` the absolute path of its directory. Both are kept only when the track has an album.
    pub(crate) fn build(
        [title, artist, album, album_artist]: [Option<&str>; 4],
        date: Option<&str>,
        file_name: &str,
        sort: SortTags<'_>,
        album_directory: &str,
        directory_path: &str,
    ) -> Self {
        let title_key = title_key(title, file_name);
        let artist_key = text_key(artist);
        let album_key = text_key(album);
        let album_artist_key = album_artist_key(album_artist, artist);
        // An Album Artist that falls back to the artist falls back to its sort order too.
        let album_artist_sort_tag = if text_key(album_artist).is_empty() {
            sort.artist
        } else {
            sort.album_artist
        };
        let album_directory = if album_key.is_empty() {
            String::new()
        } else {
            album_directory.to_owned()
        };
        let album_path = if album_key.is_empty() {
            String::new()
        } else {
            absolute_directory(directory_path, &album_directory)
        };
        let album_id = AlbumId::of(&album_artist_key, &album_key, OsStr::new(&album_path));
        Self {
            title_sort: sort_key(&title_key, sort.title),
            artist_sort: sort_key(&artist_key, sort.artist),
            album_sort: sort_key(&album_key, sort.album),
            album_artist_sort: sort_key(&album_artist_key, album_artist_sort_tag),
            search: track_search_key(&title_key, &artist_key, &album_key, &album_artist_key),
            album_directory,
            album_id: album_id.to_hex(),
            title: title_key,
            artist: artist_key,
            album: album_key,
            album_artist: album_artist_key,
            year: date.and_then(year_of),
        }
    }
}

/// What a track's filter looks in: its title, artist, album and Album Artist, folded. The one
/// place that lists them, for the scanner and for the compilations that refile a track.
pub(crate) fn track_search_key(
    title: &str,
    artist: &str,
    album: &str,
    album_artist: &str,
) -> String {
    search_key(&[title, artist, album, album_artist])
}

/// The printing of an album a file belongs to: its directory, or the directory above it when it is a
/// disc directory ("CD1", "Disc 2"), so one album on several discs stays one album while the same
/// title and artist in two directories (an original and a remaster) are two.
pub(crate) fn album_edition_of(directory_id: i64, relative_path: &str) -> String {
    let directory = relative_path
        .rsplit_once('/')
        .map_or("", |(directory, _)| directory);
    let directory = match directory.rsplit_once('/') {
        Some((parent, last)) if is_disc_directory(last) => parent,
        None if is_disc_directory(directory) => "",
        _ => directory,
    };
    format!("{directory_id}/{directory}")
}

/// The absolute directory of an album edition: the library directory's path, `/`, then the album directory
/// below it. `/` is written on every platform, so the text is the same in Rust and in SQL
/// (`album_id()` joins them the same way).
pub(crate) fn absolute_directory(directory_path: &str, album_directory: &str) -> String {
    let relative = album_directory
        .split_once('/')
        .map_or("", |(_, relative)| relative);
    format!("{directory_path}/{relative}")
}

fn is_disc_directory(name: &str) -> bool {
    let name = name.trim().to_lowercase();
    let Some(rest) = ["disc", "disk", "cd"]
        .iter()
        .find_map(|prefix| name.strip_prefix(prefix))
    else {
        return false;
    };
    let rest = rest.trim_start_matches([' ', '_', '-', '.']);
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    (1..=2).contains(&digits)
        && rest
            .get(digits..)
            .is_some_and(|tail| !tail.starts_with(char::is_alphanumeric))
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
    fn folding_unifies_kana_width_case_and_accents() {
        assert_eq!(fold("ユズ"), "ゆず");
        assert_eq!(fold("ﾕｽﾞ"), "ゆず");
        assert_eq!(fold("ＡＢＣ　１２３"), "abc 123");
        assert_eq!(fold("  Beyoncé "), "beyonce");
        assert_eq!(fold("が"), "が", "dakuten stay");
        assert_eq!(fold("ヴ"), "ゔ");
        assert_eq!(fold("100％"), "100%");
    }

    #[test]
    fn sort_keys_prefer_the_sort_order_tag_and_put_symbols_first() {
        assert_eq!(sort_key("The Band", Some("Band, The")), "band, the");
        assert_eq!(sort_key("The Band", None), "the band");
        assert_eq!(sort_key("The Band", Some("  ")), "the band");
        assert_eq!(sort_key("", Some("Tag")), "", "unknown has no key");
        assert_eq!(sort_key("(Intro)", None), "\u{1}(intro)");
        let mut names = [
            "Zebra",
            "ユズ",
            "あい",
            "漢字",
            "apple",
            "(x)",
            "9 lives",
            "いろは",
            "Éclair",
        ];
        names.sort_by_key(|name| sort_key(name, None));
        assert_eq!(
            names,
            [
                "(x)",
                "9 lives",
                "apple",
                "Éclair",
                "Zebra",
                "あい",
                "いろは",
                "ユズ",
                "漢字"
            ]
        );
    }

    #[test]
    fn index_labels_follow_the_sort_order_and_never_go_backwards() {
        let mut names = vec![
            "Zebra",
            "ゆず",
            "ユズ",
            "あい",
            "漢字",
            "字",
            "apple",
            "(x)",
            "9 lives",
            "いろは",
            "がっこう",
            "ざ",
            "ちゃ",
            "つ",
            "ほ",
            "ぱ",
            "ん",
            "わ",
            "ー",
            "한글",
            "Бабочка",
            "Éclair",
            "",
            "ゃ",
            "ゎ",
            "ぁ",
        ];
        names.sort_by_key(|name| sort_key(name, None));
        let labels: Vec<String> = names
            .iter()
            .map(|name| index_label(&sort_key(name, None)))
            .collect();
        let mut merged: Vec<&str> = Vec::new();
        for label in &labels {
            if merged.last() != Some(&label.as_str()) {
                merged.push(label);
            }
        }
        // Each label is one contiguous run: no label appears twice.
        let mut seen = merged.clone();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), merged.len(), "{merged:?}");
        assert_eq!(
            merged.first(),
            Some(&"?"),
            "the unnamed sort first by key but is filed apart"
        );
    }

    #[test]
    fn kana_rows_and_kanji_have_fixed_labels() {
        let label = |name: &str| index_label(&sort_key(name, None));
        assert_eq!(label("がっこう"), "か");
        assert_eq!(label("ガッコウ"), "か");
        assert_eq!(label("ぱ"), "は");
        assert_eq!(label("ちゃ"), "た");
        assert_eq!(label("ん"), "わ");
        assert_eq!(label("漢字"), "漢");
        assert_eq!(label("字"), "漢");
        assert_eq!(label("1st"), "#");
        assert_eq!(label("(x)"), "#");
        assert_eq!(label("Zebra"), "Z");
        assert_eq!(label(""), "?");
    }

    #[test]
    fn search_keys_hold_every_name_folded() {
        assert_eq!(
            search_key(&["ユズ", "A", ""]),
            "ゆず\u{1f}a\u{1f}".to_owned()
        );
        assert_eq!(search_text(" ﾕｽﾞ "), "ゆず");
    }

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
    fn an_album_edition_is_a_directory_and_a_disc_directory_belongs_to_its_parent() {
        assert_eq!(
            album_edition_of(1, "Artist/Album/01.flac"),
            "1/Artist/Album"
        );
        assert_eq!(
            album_edition_of(1, "Artist/Album/CD1/01.flac"),
            "1/Artist/Album"
        );
        assert_eq!(
            album_edition_of(1, "Artist/Album/Disc 02/01.flac"),
            "1/Artist/Album"
        );
        assert_eq!(album_edition_of(2, "01.flac"), "2/");
        assert_eq!(album_edition_of(1, "CD1/01.flac"), "1/");
        assert_eq!(
            album_edition_of(1, "Artist/Album (2011 Remaster)/01.flac"),
            "1/Artist/Album (2011 Remaster)"
        );
        assert_eq!(
            album_edition_of(1, "Artist/CD Collection/01.flac"),
            "1/Artist/CD Collection"
        );
    }

    #[test]
    fn sort_keys_come_from_the_sort_tags_and_an_unnamed_track_has_none() {
        let keys = TrackKeys::build(
            [Some("ユズ"), Some("The Band"), None, None],
            None,
            "x.flac",
            SortTags {
                artist: Some("Band, The"),
                ..SortTags::default()
            },
            "1/d",
            "C:/Music",
        );
        assert_eq!(keys.title_sort, "ゆず");
        assert_eq!(keys.artist_sort, "band, the");
        assert_eq!(
            keys.album_artist_sort, "band, the",
            "the artist's order carries over"
        );
        assert_eq!(keys.album_sort, "");
        assert_eq!(keys.album_directory, "", "no album, no album_directory");
        assert_eq!(keys.search, "ゆず\u{1f}the band\u{1f}\u{1f}the band");
    }

    #[test]
    fn identity_keeps_case() {
        assert_ne!(text_key(Some("Case")), text_key(Some("case")));
    }

    #[test]
    fn a_disc_directory_with_a_multibyte_suffix_is_not_one_and_does_not_panic() {
        assert!(!is_disc_directory("disc 1é"));
        assert!(is_disc_directory("disc 1"));
    }
}
