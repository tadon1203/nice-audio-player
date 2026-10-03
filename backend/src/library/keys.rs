//! The normalized facts the Library files a track under. They are computed here, once, when a
//! track is written (and when a migration backfills old rows), and the catalog reads them back
//! from their columns, so every view agrees on what an album, an Album Artist or a year is.
//!
//! Unknown is the empty string: the backend never returns display strings (CONTRIBUTING).

use super::text;
use std::path::Path;

/// The SortOrder tags of a track (`TITLESORT`, `ARTISTSORT`, `ALBUMSORT`, `ALBUMARTISTSORT`).
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
    /// What each name sorts by (see `text.rs`); `""` for an unknown one.
    pub title_sort: String,
    pub artist_sort: String,
    pub album_sort: String,
    pub album_artist_sort: String,
    /// The folded names the filter looks in.
    pub search: String,
    /// Which printing of the album the track is on, `""` for a track with no album.
    pub album_dir: String,
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
        Self::build(
            [title, artist, album, album_artist],
            date,
            file_name,
            SortTags::default(),
            "",
        )
    }

    /// All the keys. `edition` is the album's directory (see [`edition_of`]), kept only when the
    /// track has an album.
    pub fn build(
        [title, artist, album, album_artist]: [Option<&str>; 4],
        date: Option<&str>,
        file_name: &str,
        sort: SortTags<'_>,
        edition: &str,
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
        Self {
            title_sort: text::sort_key(&title_key, sort.title),
            artist_sort: text::sort_key(&artist_key, sort.artist),
            album_sort: text::sort_key(&album_key, sort.album),
            album_artist_sort: text::sort_key(&album_artist_key, album_artist_sort_tag),
            search: track_search_key(&title_key, &artist_key, &album_key, &album_artist_key),
            album_dir: if album_key.is_empty() {
                String::new()
            } else {
                edition.to_owned()
            },
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
    text::search_key(&[title, artist, album, album_artist])
}

/// The printing of an album a file belongs to: its folder, or the folder above it when it is a
/// disc folder ("CD1", "Disc 2"), so one album on several discs stays one album while the same
/// title and artist in two folders (an original and a remaster) are two.
pub(crate) fn edition_of(root_id: i64, relative_path: &str) -> String {
    let directory = relative_path
        .rsplit_once('/')
        .map_or("", |(directory, _)| directory);
    let directory = match directory.rsplit_once('/') {
        Some((parent, last)) if is_disc_folder(last) => parent,
        None if is_disc_folder(directory) => "",
        _ => directory,
    };
    format!("{root_id}/{directory}")
}

fn is_disc_folder(name: &str) -> bool {
    let name = name.trim().to_lowercase();
    let Some(rest) = ["disc", "disk", "cd"]
        .iter()
        .find_map(|prefix| name.strip_prefix(prefix))
    else {
        return false;
    };
    let rest = rest.trim_start_matches([' ', '_', '-', '.']);
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    (1..=2).contains(&digits) && !rest[digits..].starts_with(char::is_alphanumeric)
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
    fn an_edition_is_a_folder_and_a_disc_folder_belongs_to_its_parent() {
        assert_eq!(edition_of(1, "Artist/Album/01.flac"), "1/Artist/Album");
        assert_eq!(edition_of(1, "Artist/Album/CD1/01.flac"), "1/Artist/Album");
        assert_eq!(
            edition_of(1, "Artist/Album/Disc 02/01.flac"),
            "1/Artist/Album"
        );
        assert_eq!(edition_of(2, "01.flac"), "2/");
        assert_eq!(edition_of(1, "CD1/01.flac"), "1/");
        assert_eq!(
            edition_of(1, "Artist/Album (2011 Remaster)/01.flac"),
            "1/Artist/Album (2011 Remaster)"
        );
        assert_eq!(
            edition_of(1, "Artist/CD Collection/01.flac"),
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
        );
        assert_eq!(keys.title_sort, "ゆず");
        assert_eq!(keys.artist_sort, "band, the");
        assert_eq!(
            keys.album_artist_sort, "band, the",
            "the artist's order carries over"
        );
        assert_eq!(keys.album_sort, "");
        assert_eq!(keys.album_dir, "", "no album, no edition");
        assert_eq!(keys.search, "ゆず\u{1f}the band\u{1f}\u{1f}the band");
    }

    #[test]
    fn identity_keeps_case() {
        assert_ne!(text_key(Some("Case")), text_key(Some("case")));
    }
}
