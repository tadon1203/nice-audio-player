//! The read side over a seeded database: what the catalog lists, how it pages, how playback
//! selections are resolved.

use super::{
    catalog::{album_artists_query, albums_query, tracks_query},
    paging::PAGE_SIZE,
    LibraryStore, PlaybackSourceError,
};
use crate::library::{
    database::Database, error::StoreError, keys::TrackKeys, location::Unavailable, models::*,
};
use crate::test_support::TestDirectory;
use rusqlite::params;
use std::collections::HashSet;
use std::path::PathBuf;

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    database: Database,
    store: LibraryStore,
}

/// One track to put in the database, with the tags the scanner would have read.
#[derive(Clone, Copy)]
struct Seed<'a> {
    id: i64,
    title: &'a str,
    artist: &'a str,
    album: &'a str,
    album_artist: Option<&'a str>,
    disc: Option<i64>,
    track: Option<i64>,
    artwork: Option<i64>,
    date: Option<&'a str>,
    duration_ms: Option<i64>,
}

impl<'a> Seed<'a> {
    fn new(id: i64, title: &'a str, artist: &'a str, album: &'a str) -> Self {
        Self {
            id,
            title,
            artist,
            album,
            album_artist: Some(artist),
            disc: Some(1),
            track: Some(id),
            artwork: None,
            date: None,
            duration_ms: Some(1_000),
        }
    }
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let database = Database::initialize(&directory.file("data")).expect("database");
    database
        .write()
        .unwrap()
        .execute(
            "INSERT INTO library_roots(id,path,enabled,scan_generation) VALUES(1,?1,1,0)",
            params![music.to_string_lossy()],
        )
        .unwrap();
    Fixture {
        store: LibraryStore::new(database.clone()),
        _directory: directory,
        music,
        database,
    }
}

impl Fixture {
    fn add(&self, seed: Seed<'_>) {
        self.add_all(&[seed]);
    }

    /// Writes tracks the way the scanner does: the tags, and the keys computed from them.
    fn add_all(&self, seeds: &[Seed<'_>]) {
        let mut connection = self.database.write().unwrap();
        let transaction = connection.transaction().unwrap();
        for seed in seeds {
            let file = format!("{}.wav", seed.id);
            let keys = TrackKeys::new(
                Some(seed.title),
                Some(seed.artist),
                Some(seed.album),
                seed.album_artist,
                seed.date,
                &file,
            );
            transaction
                .execute(
                    "INSERT INTO library_files(id,root_id,relative_path,file_name,extension,modification_key,source_revision,seen_generation,availability,inspection_status) VALUES(?1,1,?2,?2,'wav','1',1,1,'available','indexed')",
                    params![seed.id, file],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO tracks(id,file_id) VALUES(?1,?1)",
                    params![seed.id],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,date,duration_ms,tag_status,artwork_status,artwork_id,title_key,artist_key,album_key,album_artist_key,year) VALUES(?1,1,?2,?3,?4,?5,?6,?7,?8,?9,'loaded','notPresent',?10,?11,?12,?13,?14,?15)",
                    params![
                        seed.id,
                        seed.title,
                        seed.artist,
                        seed.album,
                        seed.album_artist,
                        seed.track,
                        seed.disc,
                        seed.date,
                        seed.duration_ms,
                        seed.artwork,
                        keys.title,
                        keys.artist,
                        keys.album,
                        keys.album_artist,
                        keys.year
                    ],
                )
                .unwrap();
        }
        transaction.commit().unwrap();
    }

    fn add_artwork(&self, id: i64, mime: &str, fill: char) -> String {
        let hash = fill.to_string().repeat(64);
        let extension = if mime == "image/png" { "png" } else { "jpg" };
        self.database
            .write()
            .unwrap()
            .execute(
                "INSERT INTO artwork_assets(id,content_hash,mime_type,relative_path,byte_length) VALUES(?1,?2,?3,?4,1)",
                params![id, hash, mime, format!("artwork/{0}{0}/{1}.{2}", fill, hash, extension)],
            )
            .unwrap();
        hash
    }

    fn sql(&self, sql: &str) {
        self.database.write().unwrap().execute(sql, []).unwrap();
    }

    /// Creates the audio files of tracks 1..=`count` so playback can find them.
    fn touch_audio(&self, ids: impl IntoIterator<Item = i64>) {
        for id in ids {
            std::fs::write(self.music.join(format!("{id}.wav")), []).unwrap();
        }
    }
}

const TITLE: LibraryAlbumSortKey = LibraryAlbumSortKey::Title;
const ASC: LibrarySortDirection = LibrarySortDirection::Ascending;
const DESC: LibrarySortDirection = LibrarySortDirection::Descending;

fn all_albums(store: &LibraryStore, search: Option<&str>) -> LibraryAlbumPage {
    store.catalog_albums(None, search, TITLE, ASC).unwrap()
}

#[test]
fn albums_keep_their_identity_and_take_the_cover_of_their_first_track_with_artwork() {
    let fixture = fixture();
    fixture.add_artwork(1, "image/jpeg", 'a');
    let second = fixture.add_artwork(2, "image/png", 'b');
    let mut one = Seed::new(1, "First", "Artist", "Shared");
    (one.album_artist, one.disc, one.track, one.artwork) =
        (Some("Album Artist"), Some(2), Some(1), Some(1));
    let mut two = Seed::new(2, "Needle", "Artist", "Shared");
    (two.album_artist, two.disc, two.track, two.artwork) =
        (Some("Album Artist"), Some(1), Some(2), Some(2));
    let mut other = Seed::new(3, "Percent %", "Other", "Other %_\\ album");
    (other.album_artist, other.disc, other.track) = (Some("Other artist"), None, None);
    fixture.add_all(&[one, two, other]);
    let store = &fixture.store;

    let all = all_albums(store, None);
    assert_eq!((all.items.len(), all.total_count), (2, 2));
    let shared = all
        .items
        .iter()
        .find(|album| album.key.title == "Shared")
        .unwrap();
    assert_eq!(shared.key.album_artist, "Album Artist");
    let cover = shared.artwork.as_ref().expect("a cover");
    assert_eq!(
        (cover.content_hash.as_str(), cover.mime_type),
        (
            second.as_str(),
            crate::library::artwork::ArtworkMimeType::Png
        ),
        "disc 1 comes before disc 2"
    );

    assert!(
        all_albums(store, Some("Needle")).items.is_empty(),
        "albums are not found by a track title"
    );
    let by_title = all_albums(store, Some("Shared"));
    assert_eq!((by_title.items.len(), by_title.total_count), (1, 1));
    for literal in ["%", "_", "\\"] {
        let found = all_albums(store, Some(literal));
        assert_eq!(
            found.items.len(),
            1,
            "{literal:?} is searched for literally"
        );
        assert_eq!(found.items[0].key.title, "Other %_\\ album");
    }
    let by_artist = all_albums(store, Some("Album Artist"));
    assert_eq!(by_artist.items[0].key.album_artist, "Album Artist");

    let artists = store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!((artists.items.len(), artists.total_count), (2, 2));
    assert_eq!(
        (artists.items[0].album_count, artists.items[0].track_count),
        (1, 2)
    );
    let artist_albums = store
        .catalog_artist_albums(
            LibraryAlbumArtistKey {
                name: "Album Artist".into(),
            },
            None,
            LibraryArtistAlbumSortKey::Year,
            ASC,
        )
        .unwrap();
    assert_eq!(
        (artist_albums.items.len(), artist_albums.total_count),
        (1, 1)
    );
    assert_eq!(artist_albums.items[0].key.title, "Shared");

    let shared_key = LibraryAlbumKey {
        title: "Shared".into(),
        album_artist: "Album Artist".into(),
    };
    let details = store.catalog_album_details(shared_key.clone()).unwrap();
    assert_eq!(details.track_count, 2);
    let tracks = store.catalog_album_tracks(shared_key, None).unwrap();
    assert_eq!((tracks.items.len(), tracks.total_count), (2, 2));
    assert_eq!(
        tracks
            .items
            .iter()
            .map(|track| track.id.as_str())
            .collect::<Vec<_>>(),
        ["2", "1"],
        "disc 1 first"
    );
    assert_eq!(
        store
            .catalog_albums(Some("not-json"), None, TITLE, ASC)
            .err(),
        Some(StoreError::InvalidCursor)
    );
}

#[test]
fn an_album_is_found_playable_and_reported_missing_by_its_key() {
    let fixture = fixture();
    fixture.touch_audio([1, 2, 3]);
    let mut one = Seed::new(1, "One", "Artist", "Shared");
    one.album_artist = Some("Album Artist");
    let mut two = Seed::new(2, "Two", "Artist", "Shared");
    two.album_artist = Some("Album Artist");
    fixture.add_all(&[one, two, Seed::new(3, "Three", "Other", "Elsewhere")]);
    let store = &fixture.store;
    let shared = LibraryAlbumKey {
        title: "Shared".into(),
        album_artist: "Album Artist".into(),
    };

    let blank = LibraryAlbumKey {
        title: " ".into(),
        album_artist: "Album Artist".into(),
    };
    assert_eq!(
        store.playback_for_album(&blank, None).err(),
        Some(PlaybackSourceError::InvalidAlbumKey)
    );
    assert_eq!(
        store.playback_for_album(&shared, Some("3")).err(),
        Some(PlaybackSourceError::TrackNotMember)
    );
    assert_eq!(
        store.playback_for_album(&shared, Some("not-an-id")).err(),
        Some(PlaybackSourceError::InvalidTrackId)
    );
    let missing = LibraryAlbumKey {
        title: "Nope".into(),
        album_artist: "Nobody".into(),
    };
    assert_eq!(
        store.playback_for_album(&missing, None).err(),
        Some(PlaybackSourceError::AlbumNotFound)
    );

    fixture.sql("UPDATE library_files SET availability='missing' WHERE id IN (1,2)");
    assert_eq!(
        store.playback_for_album(&shared, Some("1")).err(),
        Some(PlaybackSourceError::TrackUnavailable)
    );
    assert_eq!(
        store.playback_for_album(&shared, None).err(),
        Some(PlaybackSourceError::NoPlayableTracks)
    );
}

#[test]
fn a_track_without_a_title_is_named_after_its_file_in_playback_and_in_search() {
    let fixture = fixture();
    fixture.touch_audio([1]);
    fixture.add(Seed::new(1, "", "Artist", "Album"));
    fixture.sql(
        "UPDATE library_files SET file_name='multi.part.flac', relative_path='1.wav' WHERE id=1",
    );
    // The scanner derives the title from the file name; do the same for this renamed file.
    fixture.sql("UPDATE track_source_metadata SET title_key='multi.part' WHERE track_id=1");
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, Some("1"))
        .unwrap();
    let track = &selection.tracks[selection.start_index];
    assert_eq!(track.title, "multi.part");
    assert_eq!(
        track.album_key,
        Some(LibraryAlbumKey {
            title: "Album".into(),
            album_artist: "Artist".into()
        })
    );
    assert_eq!(track.album_track_count, Some(1));
    assert_eq!(
        store.playback_for_track("1").unwrap().album_track_count,
        Some(1)
    );
    let restored = store
        .playback_for_track_ids(&["1".to_owned(), "999".to_owned()], Some("1"))
        .unwrap();
    assert_eq!(restored.tracks.len(), 1, "unknown ids are left out");

    let by_stem = store
        .catalog_tracks(None, Some("multi.part"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!((by_stem.items.len(), by_stem.total_count), (1, 1));
    assert_eq!(by_stem.items[0].title, "multi.part");
    let by_extension = store
        .catalog_tracks(None, Some("flac"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!((by_extension.items.len(), by_extension.total_count), (0, 0));
}

#[test]
fn track_playback_follows_the_list_order_and_skips_tracks_that_cannot_play() {
    let fixture = fixture();
    fixture.touch_audio(1..=4);
    for (id, title) in [(1, "Bravo"), (2, "Alpha"), (3, "Charlie"), (4, "Delta")] {
        fixture.add(Seed::new(id, title, "Artist", "Album"));
    }
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=4");
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(None, LibraryTrackSortKey::Title, DESC, Some("2"))
        .unwrap();
    let titles: Vec<_> = selection.tracks.iter().map(|t| t.title.as_str()).collect();
    assert_eq!(
        titles,
        ["Charlie", "Bravo", "Alpha"],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.tracks[selection.start_index].track_id, "2");
    assert_eq!(selection.tracks[0].album.as_deref(), Some("Album"));

    let filtered = store
        .playback_for_tracks(Some("alp"), LibraryTrackSortKey::Title, ASC, None)
        .unwrap();
    assert_eq!(filtered.tracks.len(), 1);
    assert_eq!(
        filtered.tracks[0].album_track_count,
        Some(4),
        "an album is counted whole, whatever the filter shows of it"
    );
    assert_eq!(
        store
            .playback_for_tracks(Some("alp"), LibraryTrackSortKey::Title, ASC, Some("1"))
            .err(),
        Some(PlaybackSourceError::TrackNotMember)
    );
    assert_eq!(
        store
            .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, Some("4"))
            .err(),
        Some(PlaybackSourceError::TrackUnavailable)
    );
}

#[test]
fn playing_what_the_list_shows_holds_for_every_sort_and_direction() {
    let fixture = fixture();
    let seeds: Vec<Seed> = (1..=40)
        .map(|id| {
            let mut seed = Seed::new(
                id,
                ["Zed", "alpha", "Mid"][id as usize % 3],
                ["", "Beta", "gamma"][id as usize % 3],
                ["Lp", "", "ep"][id as usize % 3],
            );
            seed.duration_ms = (id % 4 != 0).then_some(id * 37 % 11);
            seed
        })
        .collect();
    fixture.touch_audio(1..=40);
    fixture.add_all(&seeds);
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let listed: Vec<String> = fixture
                .store
                .catalog_tracks(None, None, key, direction)
                .unwrap()
                .items
                .into_iter()
                .map(|track| track.id)
                .collect();
            let played: Vec<String> = fixture
                .store
                .playback_for_tracks(None, key, direction, None)
                .unwrap()
                .tracks
                .into_iter()
                .map(|track| track.track_id)
                .collect();
            assert_eq!(played, listed, "{key:?} {direction:?}");
        }
    }
}

#[test]
fn album_pages_cover_every_album_once_and_refuse_a_foreign_cursor() {
    let fixture = fixture();
    let mut seeds: Vec<Seed> = Vec::new();
    let names: Vec<String> = (1..=105).map(|id| format!("Album {id:03}")).collect();
    for (index, name) in names.iter().enumerate() {
        seeds.push(Seed::new(index as i64 + 1, "Track", "Artist", name));
    }
    seeds.push(Seed::new(106, "Other track", "Other artist", "Other album"));
    fixture.add_all(&seeds);
    let store = &fixture.store;

    let first = store.catalog_albums(None, None, TITLE, ASC).unwrap();
    assert_eq!((first.items.len(), first.total_count), (PAGE_SIZE, 106));
    let cursor = first.next_cursor.clone().expect("next cursor");
    let second = store
        .catalog_albums(Some(&cursor), None, TITLE, ASC)
        .unwrap();
    assert_eq!((second.items.len(), second.total_count), (6, 106));
    assert!(second.next_cursor.is_none());
    assert!(second.items[0].key.title > first.items[PAGE_SIZE - 1].key.title);
    let keys: HashSet<_> = first
        .items
        .iter()
        .chain(&second.items)
        .map(|album| album.key.clone())
        .collect();
    assert_eq!(keys.len(), 106, "every album exactly once");

    assert_eq!(
        store
            .catalog_albums(Some(&cursor), Some("different"), TITLE, ASC)
            .err(),
        Some(StoreError::InvalidCursor),
        "another search"
    );
    assert_eq!(
        store
            .catalog_albums(Some(&cursor), None, LibraryAlbumSortKey::Artist, ASC)
            .err(),
        Some(StoreError::InvalidCursor),
        "another sort"
    );
    assert_eq!(
        store.catalog_albums(Some(&cursor), None, TITLE, DESC).err(),
        Some(StoreError::InvalidCursor),
        "another direction"
    );
    let artist = |name: &str| LibraryAlbumArtistKey { name: name.into() };
    let artist_page = store
        .catalog_artist_albums(
            artist("Artist"),
            None,
            LibraryArtistAlbumSortKey::Title,
            ASC,
        )
        .unwrap();
    let artist_cursor = artist_page.next_cursor.expect("artist continuation");
    assert_eq!(
        store
            .catalog_artist_albums(
                artist("Other artist"),
                Some(&artist_cursor),
                LibraryArtistAlbumSortKey::Title,
                ASC
            )
            .err(),
        Some(StoreError::InvalidCursor),
        "another Album Artist"
    );
    let detail = store.catalog_artist(artist("Artist")).unwrap();
    assert_eq!((detail.album_count, detail.track_count), (105, 105));
}

#[test]
fn an_album_is_case_sensitive_and_a_missing_album_artist_is_the_artist() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "Upper", "Performer", "Case"));
    fixture.add(Seed::new(2, "Lower", "Performer", "case"));
    let mut fallback = Seed::new(3, "Fallback", "Fallback Artist", "Fallback album");
    fallback.album_artist = None;
    fixture.add(fallback);
    let store = &fixture.store;

    let albums = all_albums(store, None);
    let performer: Vec<_> = albums
        .items
        .iter()
        .filter(|album| album.key.album_artist == "Performer")
        .map(|album| album.key.title.as_str())
        .collect();
    assert_eq!(performer, ["Case", "case"]);
    assert_eq!(albums.items.len(), 3);
    let tracks_of = |title: &str, artist: &str| {
        store
            .catalog_album_details(LibraryAlbumKey {
                title: title.into(),
                album_artist: artist.into(),
            })
            .unwrap()
            .track_count
    };
    assert_eq!(tracks_of("Case", "Performer"), 1);
    assert_eq!(tracks_of("case", "Performer"), 1);
    assert_eq!(tracks_of("Fallback album", "Fallback Artist"), 1);
    let artist = store
        .catalog_artist(LibraryAlbumArtistKey {
            name: "Fallback Artist".into(),
        })
        .unwrap();
    assert_eq!((artist.album_count, artist.track_count), (1, 1));
}

#[test]
fn an_album_artist_shows_only_the_cover_of_its_first_album() {
    let fixture = fixture();
    fixture.add_artwork(1, "image/jpeg", 'c');
    fixture.add(Seed::new(1, "First", "Artist", "Album 1"));
    let mut later = Seed::new(2, "Later", "Artist", "Album 2");
    later.artwork = Some(1);
    fixture.add(later);

    let artists = fixture
        .store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();

    assert_eq!((artists.items.len(), artists.items[0].track_count), (1, 2));
    assert!(artists.items[0].artwork.is_none());
    let artist = fixture
        .store
        .catalog_artist(LibraryAlbumArtistKey {
            name: "Artist".into(),
        })
        .unwrap();
    assert!(artist.artwork.is_none());
}

#[test]
fn an_album_playback_sequence_is_complete_beyond_one_page() {
    let fixture = fixture();
    fixture.touch_audio(1..=101);
    let seeds: Vec<Seed> = (1..=101)
        .map(|id| Seed::new(id, "Track", "Artist", "Long Album"))
        .collect();
    fixture.add_all(&seeds);

    let selection = fixture
        .store
        .playback_for_album(
            &LibraryAlbumKey {
                title: "Long Album".into(),
                album_artist: "Artist".into(),
            },
            Some("101"),
        )
        .unwrap();

    assert_eq!((selection.tracks.len(), selection.start_index), (101, 100));
}

#[test]
fn a_year_is_the_same_on_the_grid_the_details_header_and_in_playback() {
    let fixture = fixture();
    fixture.touch_audio([1, 2, 3, 4]);
    let dated = |id, date| {
        let mut seed = Seed::new(
            id,
            "Track",
            "Artist",
            ["Dated", "Dated", "Placeholder", "Odd"][id as usize - 1],
        );
        seed.date = Some(date);
        seed
    };
    fixture.add_all(&[
        dated(1, "1999-05-03"),
        dated(2, "0000-01-01"),
        dated(3, "0000"),
        dated(4, "12"),
    ]);
    let store = &fixture.store;
    let key = |title: &str| LibraryAlbumKey {
        title: title.into(),
        album_artist: "Artist".into(),
    };

    let grid = all_albums(store, None);
    let year_of = |title: &str| {
        grid.items
            .iter()
            .find(|album| album.key.title == title)
            .unwrap()
            .year
    };
    assert_eq!(year_of("Dated"), Some(1999));
    assert_eq!(year_of("Placeholder"), None, "0000 is no year");
    assert_eq!(year_of("Odd"), None, "two digits are no year");
    assert_eq!(
        store
            .catalog_album_details(key("Dated"))
            .unwrap()
            .summary
            .year,
        Some(1999)
    );
    assert_eq!(
        store
            .catalog_album_details(key("Placeholder"))
            .unwrap()
            .summary
            .year,
        None
    );
    let playback = store.playback_for_album(&key("Dated"), None).unwrap();
    let years: Vec<_> = playback.tracks.iter().map(|track| track.year).collect();
    assert_eq!(
        years,
        [Some(1999), None],
        "the track with the placeholder date has no year"
    );
}

#[test]
fn album_details_count_the_tracks_once_and_name_the_first_playable_one() {
    let fixture = fixture();
    let mut one = Seed::new(1, "One", "Artist", "Album");
    one.duration_ms = Some(1_000);
    let mut two = Seed::new(2, "Two", "Artist", "Album");
    two.duration_ms = Some(2_500);
    let mut three = Seed::new(3, "Three", "Artist", "Album");
    three.duration_ms = Some(500);
    fixture.add_all(&[one, two, three]);
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=1");
    let key = LibraryAlbumKey {
        title: "Album".into(),
        album_artist: "Artist".into(),
    };

    let details = fixture.store.catalog_album_details(key.clone()).unwrap();
    let tracks = fixture.store.catalog_album_tracks(key, None).unwrap();

    assert_eq!(details.track_count, 3);
    assert_eq!(tracks.total_count, 3);
    assert_eq!(details.duration_ms, Some(4_000));
    assert_eq!(
        details.first_playable_track_id.as_deref(),
        Some("2"),
        "track 1 is missing"
    );
}

#[test]
fn a_track_summary_carries_the_key_of_the_album_the_catalog_files_it_under() {
    let fixture = fixture();
    let mut filed = Seed::new(1, "Song", "Singer", " Record ");
    filed.album_artist = Some(" Band ");
    fixture.add_all(&[filed, Seed::new(2, "Single", "Singer", "")]);

    let summary = |id| fixture.store.track_by_id(id).unwrap().unwrap();

    assert_eq!(
        summary("1").album_key,
        Some(LibraryAlbumKey {
            title: "Record".into(),
            album_artist: "Band".into()
        })
    );
    assert_eq!(summary("2").album_key, None, "no album tag, no album");
    let key = summary("1").album_key.unwrap();
    assert_eq!(
        fixture
            .store
            .catalog_album_details(key)
            .unwrap()
            .track_count,
        1,
        "the key opens the album the catalog lists"
    );
}

/// Every page of a list, in order.
fn walk<T>(page: impl FnMut(Option<&str>) -> (Vec<T>, Option<String>)) -> Vec<T> {
    walk_from(None, page)
}

/// Every page of a list after `cursor`, in order.
fn walk_from<T>(
    mut cursor: Option<String>,
    mut page: impl FnMut(Option<&str>) -> (Vec<T>, Option<String>),
) -> Vec<T> {
    let mut items = Vec::new();
    loop {
        let (page_items, next) = page(cursor.as_deref());
        items.extend(page_items);
        match next {
            Some(next) => cursor = Some(next),
            None => return items,
        }
    }
}

fn varied_library(fixture: &Fixture) {
    let artists = ["", "beta", "Gamma", "alpha", "Beta"];
    let albums = ["Lp", "", "ep", "LP", "Zeta"];
    let titles: Vec<String> = (1..=330)
        .map(|id| format!("Title {}", id * 7 % 330))
        .collect();
    let seeds: Vec<Seed> = (1..=330)
        .map(|id| {
            let mut seed = Seed::new(
                id,
                &titles[id as usize - 1],
                artists[id as usize % 5],
                albums[id as usize % 5],
            );
            seed.album_artist = (id % 4 != 0).then_some(artists[id as usize % 5]);
            seed.duration_ms = (id % 3 != 0).then_some(id * 13 % 200);
            seed.date =
                (id % 6 != 0).then_some(["1990", "2004", "0000", "1975-02"][id as usize % 4]);
            seed.disc = (id % 7 != 0).then_some(id % 2 + 1);
            seed.track = (id % 5 != 0).then_some(id);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
}

#[test]
fn tracks_page_through_every_sort_and_direction_with_unknown_values_last() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let tracks = walk(|cursor| {
                let page = store.catalog_tracks(cursor, None, key, direction).unwrap();
                assert_eq!(page.total_count, 330);
                (page.items, page.next_cursor)
            });
            let ids: HashSet<_> = tracks.iter().map(|track| track.id.clone()).collect();
            assert_eq!(
                (tracks.len(), ids.len()),
                (330, 330),
                "{key:?} {direction:?}: every track once"
            );
            let unknown = |track: &LibraryTrackSummary| match key {
                LibraryTrackSortKey::Title => false,
                LibraryTrackSortKey::Artist => track.artist.is_none(),
                LibraryTrackSortKey::Album => track.album.is_none(),
                LibraryTrackSortKey::Duration => track.duration_ms.is_none(),
            };
            let first_unknown = tracks.iter().position(unknown).unwrap_or(tracks.len());
            assert!(
                tracks[first_unknown..].iter().all(unknown),
                "{key:?} {direction:?}: unknown last"
            );
            let names: Vec<String> = tracks[..first_unknown]
                .iter()
                .map(|track| match key {
                    LibraryTrackSortKey::Title => track.title.to_lowercase(),
                    LibraryTrackSortKey::Artist => track.artist.clone().unwrap().to_lowercase(),
                    LibraryTrackSortKey::Album => track.album.clone().unwrap().to_lowercase(),
                    LibraryTrackSortKey::Duration => format!("{:08}", track.duration_ms.unwrap()),
                })
                .collect();
            let mut sorted = names.clone();
            sorted.sort();
            if direction == DESC {
                sorted.reverse();
            }
            assert_eq!(names, sorted, "{key:?} {direction:?}: in order");
        }
    }
}

#[test]
fn albums_and_album_artists_page_through_every_sort_and_direction() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    let total_albums = all_albums(store, None).total_count;
    for key in [
        LibraryAlbumSortKey::Title,
        LibraryAlbumSortKey::Artist,
        LibraryAlbumSortKey::Year,
    ] {
        for direction in [ASC, DESC] {
            let albums = walk(|cursor| {
                let page = store.catalog_albums(cursor, None, key, direction).unwrap();
                (page.items, page.next_cursor)
            });
            let keys: HashSet<_> = albums.iter().map(|album| album.key.clone()).collect();
            assert_eq!(albums.len() as u64, total_albums, "{key:?} {direction:?}");
            assert_eq!(
                keys.len(),
                albums.len(),
                "{key:?} {direction:?}: every album once"
            );
            if key == LibraryAlbumSortKey::Year {
                let first_without = albums
                    .iter()
                    .position(|album| album.year.is_none())
                    .unwrap_or(albums.len());
                assert!(
                    albums[first_without..]
                        .iter()
                        .all(|album| album.year.is_none()),
                    "{direction:?}: no year last"
                );
                let years: Vec<_> = albums[..first_without]
                    .iter()
                    .map(|album| album.year.unwrap())
                    .collect();
                assert!(years.windows(2).all(|pair| if direction == ASC {
                    pair[0] <= pair[1]
                } else {
                    pair[0] >= pair[1]
                }));
            }
        }
    }
    let total_artists = store
        .catalog_album_artists(None, None, LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap()
        .total_count;
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        for direction in [ASC, DESC] {
            let artists = walk(|cursor| {
                let page = store
                    .catalog_album_artists(cursor, None, key, direction)
                    .unwrap();
                (page.items, page.next_cursor)
            });
            let names: HashSet<_> = artists
                .iter()
                .map(|artist| artist.key.name.clone())
                .collect();
            assert_eq!(
                (artists.len() as u64, names.len()),
                (total_artists, artists.len()),
                "{key:?} {direction:?}"
            );
            assert_eq!(
                artists.iter().map(|artist| artist.track_count).sum::<u64>(),
                330
            );
        }
    }
    for artist in ["beta", "Gamma", ""] {
        for key in [
            LibraryArtistAlbumSortKey::Title,
            LibraryArtistAlbumSortKey::Year,
        ] {
            for direction in [ASC, DESC] {
                let name = LibraryAlbumArtistKey {
                    name: artist.into(),
                };
                let first = store
                    .catalog_artist_albums(name.clone(), None, key, direction)
                    .unwrap();
                let albums = walk(|cursor| {
                    let page = store
                        .catalog_artist_albums(name.clone(), cursor, key, direction)
                        .unwrap();
                    (page.items, page.next_cursor)
                });
                assert_eq!(
                    albums.len() as u64,
                    first.total_count,
                    "{artist:?} {key:?} {direction:?}"
                );
            }
        }
    }
}

#[test]
fn a_write_between_two_pages_neither_repeats_nor_skips_a_track() {
    let fixture = fixture();
    varied_library(&fixture);
    let store = &fixture.store;
    let first = store
        .catalog_tracks(None, None, LibraryTrackSortKey::Title, ASC)
        .unwrap();
    let last_of_first = first.items.last().unwrap().title.clone();

    // A scan lands tracks before and after the page boundary while the listener scrolls.
    fixture.add(Seed::new(1_000, "A before everything", "New", "New"));
    fixture.add(Seed::new(1_001, "zz after everything", "New", "New"));
    let rest = walk_from(first.next_cursor.clone(), |cursor| {
        let page = store
            .catalog_tracks(cursor, None, LibraryTrackSortKey::Title, ASC)
            .unwrap();
        (page.items, page.next_cursor)
    });

    let seen: HashSet<_> = first
        .items
        .iter()
        .chain(&rest)
        .map(|track| track.id.clone())
        .collect();
    assert_eq!(seen.len(), first.items.len() + rest.len(), "no track twice");
    assert!(
        !seen.contains("1000"),
        "inserted before the cursor, so not in the pages after it"
    );
    assert!(
        seen.contains("1001"),
        "inserted after the cursor, so reached"
    );
    assert!(rest
        .iter()
        .all(|track| track.title.to_lowercase() > last_of_first.to_lowercase()));
}

#[test]
fn the_name_sorted_lists_read_an_index_range_not_the_whole_table() {
    let fixture = fixture();
    varied_library(&fixture);
    let connection = fixture.database.read().unwrap();
    let mut plans: Vec<(String, Vec<String>)> = Vec::new();
    for key in [
        LibraryTrackSortKey::Title,
        LibraryTrackSortKey::Artist,
        LibraryTrackSortKey::Album,
        LibraryTrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let query = tracks_query(None, key, direction);
            for (phase, _) in query.ordering.phases.iter().enumerate() {
                for after in [false, true] {
                    plans.push((
                        format!("tracks {key:?} {direction:?} phase {phase} after {after}"),
                        query.plan(&connection, phase, after),
                    ));
                }
            }
        }
    }
    for key in [LibraryAlbumSortKey::Title, LibraryAlbumSortKey::Artist] {
        for direction in [ASC, DESC] {
            let query = albums_query(None, key, direction);
            for after in [false, true] {
                plans.push((
                    format!("albums {key:?} {direction:?} after {after}"),
                    query.plan(&connection, 0, after),
                ));
            }
        }
    }
    for direction in [ASC, DESC] {
        let query = album_artists_query(None, LibraryAlbumArtistSortKey::Artist, direction);
        for after in [false, true] {
            plans.push((
                format!("artists {direction:?} after {after}"),
                query.plan(&connection, 0, after),
            ));
        }
    }
    for (name, plan) in plans {
        let plan = plan.join(" | ");
        assert!(
            !plan.contains("FOR ORDER BY") && !plan.contains("FOR GROUP BY"),
            "{name} sorts: {plan}"
        );
        assert!(
            plan.contains("USING INDEX") || plan.contains("USING COVERING INDEX"),
            "{name} does not use an index: {plan}"
        );
    }
}

#[test]
fn a_track_location_is_found_by_id_and_stays_inside_its_root() {
    let fixture = fixture();
    fixture.touch_audio([1]);
    fixture.add(Seed::new(1, "Song", "Artist", "Album"));
    fixture.add(Seed::new(2, "Gone", "Artist", "Album"));
    fixture.add(Seed::new(3, "Escaping", "Artist", "Album"));
    fixture.sql("UPDATE library_files SET relative_path='../outside.wav' WHERE id=3");
    std::fs::write(fixture.music.parent().unwrap().join("outside.wav"), []).unwrap();
    let store = &fixture.store;

    let file = store.track_location("1").unwrap().existing().unwrap();
    assert!(file.path.ends_with("1.wav") && file.path.starts_with(&file.root));
    assert_eq!(
        store.track_location("2").unwrap().existing(),
        Err(Unavailable),
        "its file is gone"
    );
    assert_eq!(
        store.track_location("3").unwrap().existing(),
        Err(Unavailable),
        "it leaves the root"
    );
    assert_eq!(
        store.track_location("99").err(),
        Some(StoreError::TrackNotFound)
    );
    assert_eq!(store.track_location("x").err(), Some(StoreError::InvalidId));
}

#[test]
fn track_properties_list_the_tags_and_the_files_path() {
    let fixture = fixture();
    let mut seed = Seed::new(1, "Song", "Singer", "Record");
    seed.date = Some("2001-02-03");
    fixture.add(seed);

    let properties = fixture
        .store
        .track_properties("1")
        .unwrap()
        .expect("properties");

    assert_eq!(properties.title.as_deref(), Some("Song"));
    assert_eq!(properties.date.as_deref(), Some("2001-02-03"));
    assert!(properties.path.ends_with("1.wav") && properties.path.contains("music"));
    assert!(fixture.store.track_properties("99").unwrap().is_none());
}
