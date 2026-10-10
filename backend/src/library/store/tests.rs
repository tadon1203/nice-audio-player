//! The read side over a seeded database: what the catalog lists, how it pages, how playback
//! selections are resolved.

use super::{
    catalog::{album_artists_query, albums_query, artist_albums_query, tracks_query},
    paging::PAGE_SIZE,
    LibraryStore, PlaybackSourceError,
};
use crate::library::{
    database::Database,
    error::StoreError,
    keys::{album_edition_of, SortTags, TrackKeys},
    location::Unavailable,
    models::*,
    summary,
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
            let keys = TrackKeys::build(
                [
                    Some(seed.title),
                    Some(seed.artist),
                    Some(seed.album),
                    seed.album_artist,
                ],
                seed.date,
                &file,
                SortTags::default(),
                &album_edition_of(1, &file),
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
                    "INSERT INTO track_source_metadata(track_id,source_revision,title,artist,album,album_artist,track_number,disc_number,date,duration_ms,tag_status,artwork_status,artwork_id,title_key,artist_key,album_key,album_artist_key,year,title_sort,artist_sort,album_sort,album_artist_sort,search_key,album_dir) VALUES(?1,1,?2,?3,?4,?5,?6,?7,?8,?9,'loaded','notPresent',?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
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
                        keys.year,
                        keys.title_sort,
                        keys.artist_sort,
                        keys.album_sort,
                        keys.album_artist_sort,
                        keys.search,
                        keys.album_folder
                    ],
                )
                .unwrap();
        }
        summary::rebuild(&transaction).unwrap();
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
    assert_eq!((all.items.len(), all.total_count.unwrap_or(0)), (2, 2));
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
    assert_eq!(
        (by_title.items.len(), by_title.total_count.unwrap_or(0)),
        (1, 1)
    );
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
    assert_eq!(
        (artists.items.len(), artists.total_count.unwrap_or(0)),
        (2, 2)
    );
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
        (
            artist_albums.items.len(),
            artist_albums.total_count.unwrap_or(0)
        ),
        (1, 1)
    );
    assert_eq!(artist_albums.items[0].key.title, "Shared");

    let shared_key = LibraryAlbumKey {
        title: "Shared".into(),
        album_artist: "Album Artist".into(),
        album_edition: "1/".into(),
    };
    let details = store.catalog_album_details(shared_key.clone()).unwrap();
    assert_eq!(details.track_count, 2);
    let tracks = store.catalog_album_tracks(shared_key, None).unwrap();
    assert_eq!(
        (tracks.items.len(), tracks.total_count.unwrap_or(0)),
        (2, 2)
    );
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
        album_edition: "1/".into(),
    };

    let blank = LibraryAlbumKey {
        title: " ".into(),
        album_artist: "Album Artist".into(),
        album_edition: "1/".into(),
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
        album_edition: "1/".into(),
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
    fixture.sql(
        "UPDATE track_source_metadata SET title_key='multi.part', title_sort='multi.part', search_key='multi.part'||char(31)||'artist'||char(31)||'album'||char(31)||'artist' WHERE track_id=1",
    );
    let store = &fixture.store;

    let selection = store
        .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, Some("1"))
        .unwrap();
    let ids: Vec<&str> = selection.track_ids.iter().map(String::as_str).collect();
    let tracks = store.playable_tracks(&ids).unwrap();
    let track = tracks[selection.start_index].as_ref().unwrap();
    assert_eq!(track.title, "multi.part");
    assert_eq!(
        track.album_key,
        Some(LibraryAlbumKey {
            title: "Album".into(),
            album_artist: "Artist".into(),
            album_edition: "1/".into()
        })
    );
    assert_eq!(track.album_track_count, Some(1));
    assert_eq!(
        store.playback_for_track("1").unwrap().album_track_count,
        Some(1)
    );
    let restored = store.playable_tracks(&["1", "999", "x"]).unwrap();
    assert_eq!(
        restored.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, false, false],
        "unknown ids come back as holes, in the order asked"
    );

    let by_stem = store
        .catalog_tracks(None, Some("multi.part"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        (by_stem.items.len(), by_stem.total_count.unwrap_or(0)),
        (1, 1)
    );
    assert_eq!(by_stem.items[0].title, "multi.part");
    let by_extension = store
        .catalog_tracks(None, Some("flac"), LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        (
            by_extension.items.len(),
            by_extension.total_count.unwrap_or(0)
        ),
        (0, 0)
    );
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
    assert_eq!(
        selection.track_ids,
        ["3", "1", "2"],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.track_ids[selection.start_index], "2");
    let first = store.playable_tracks(&["3"]).unwrap().remove(0).unwrap();
    assert_eq!(first.album.as_deref(), Some("Album"));

    let filtered = store
        .playback_for_tracks(Some("alp"), LibraryTrackSortKey::Title, ASC, None)
        .unwrap();
    assert_eq!(filtered.track_ids, ["2"]);
    assert_eq!(
        store
            .playable_tracks(&["2"])
            .unwrap()
            .remove(0)
            .unwrap()
            .album_track_count,
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
                .track_ids;
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
    assert_eq!(
        (first.items.len(), first.total_count.unwrap_or(0)),
        (PAGE_SIZE, 106)
    );
    let cursor = first.next_cursor.clone().expect("next cursor");
    let second = store
        .catalog_albums(Some(&cursor), None, TITLE, ASC)
        .unwrap();
    assert_eq!(
        (second.items.len(), second.total_count),
        (6, None),
        "only the first page counts the list"
    );
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
                album_edition: "1/".into(),
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
                album_edition: "1/".into(),
            },
            Some("101"),
        )
        .unwrap();

    assert_eq!(
        (selection.track_ids.len(), selection.start_index),
        (101, 100)
    );
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
        album_edition: "1/".into(),
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
    let ids: Vec<&str> = playback.track_ids.iter().map(String::as_str).collect();
    let years: Vec<_> = store
        .playable_tracks(&ids)
        .unwrap()
        .iter()
        .map(|track| track.as_ref().unwrap().year)
        .collect();
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
        album_edition: "1/".into(),
    };

    let details = fixture.store.catalog_album_details(key.clone()).unwrap();
    let tracks = fixture.store.catalog_album_tracks(key, None).unwrap();

    assert_eq!(details.track_count, 3);
    assert_eq!(tracks.total_count.unwrap_or(0), 3);
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

    let summary = |id: &str| {
        fixture
            .store
            .catalog_tracks(
                None,
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .unwrap()
            .items
            .into_iter()
            .find(|track| track.id == id)
            .unwrap()
    };

    assert_eq!(
        summary("1").album_key,
        Some(LibraryAlbumKey {
            title: "Record".into(),
            album_artist: "Band".into(),
            album_edition: "1/".into()
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
                assert_eq!(
                    page.total_count,
                    cursor.is_none().then_some(330),
                    "only the first page counts the list"
                );
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
    let total_albums = all_albums(store, None).total_count.unwrap_or(0);
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
        .total_count
        .unwrap_or(0);
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
                    first.total_count.unwrap_or(0),
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
    // The named half of each list reads an index range. (The few unnamed albums that follow are
    // sorted; there is one per Album Artist at most.)
    for key in [
        LibraryAlbumSortKey::Title,
        LibraryAlbumSortKey::Artist,
        LibraryAlbumSortKey::Year,
    ] {
        for direction in [ASC, DESC] {
            let query = albums_query(None, key, direction);
            let named: &[usize] = if key == LibraryAlbumSortKey::Year {
                &[0, 2]
            } else {
                &[0]
            };
            for &phase in named {
                for after in [false, true] {
                    plans.push((
                        format!("albums {key:?} {direction:?} phase {phase} after {after}"),
                        query.plan(&connection, phase, after),
                    ));
                }
            }
        }
    }
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        for direction in [ASC, DESC] {
            let query = album_artists_query(None, key, direction);
            for after in [false, true] {
                plans.push((
                    format!("artists {key:?} {direction:?} after {after}"),
                    query.plan(&connection, 0, after),
                ));
            }
        }
    }
    let artist = LibraryAlbumArtistKey {
        name: "Artist".into(),
    };
    // An Album Artist's albums are few, so only their title order is held to an index range.
    for key in [LibraryArtistAlbumSortKey::Title] {
        for direction in [ASC, DESC] {
            let query = artist_albums_query(&artist, key, direction);
            for after in [false, true] {
                plans.push((
                    format!("artist albums {key:?} {direction:?} after {after}"),
                    query.plan(&connection, 0, after),
                ));
            }
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

/// Measurement for the lazy queue (run with `--ignored --nocapture`): what starting playback
/// from a library of this size costs before the first track can load.
#[test]
#[ignore = "measurement, not a check"]
fn starting_from_a_huge_tracks_list_costs_one_narrow_query() {
    for count in [5_000i64, 50_000] {
        let fixture = fixture();
        let seeds: Vec<Seed> = (1..=count)
            .map(|id| {
                Seed::new(
                    id,
                    "Track",
                    "Artist",
                    ["Lp", "Ep", "Single"][id as usize % 3],
                )
            })
            .collect();
        fixture.add_all(&seeds);
        fixture.sql("UPDATE library_files SET availability='available'");
        let started = std::time::Instant::now();
        let selection = fixture
            .store
            .playback_for_tracks(None, LibraryTrackSortKey::Title, ASC, None)
            .unwrap();
        let ids_ms = started.elapsed().as_millis();
        let started = std::time::Instant::now();
        let ids: Vec<&str> = selection
            .track_ids
            .iter()
            .take(251)
            .map(String::as_str)
            .collect();
        let _ = fixture.store.playable_tracks(&ids).unwrap();
        let first_ms = started.elapsed().as_millis();
        println!(
            "{count} tracks: {} ids in {ids_ms} ms, first 251 tracks in {first_ms} ms",
            selection.track_ids.len()
        );
    }
}

static STATEMENTS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

fn record_statement(sql: &str) {
    STATEMENTS.lock().unwrap().push(sql.to_owned());
}

/// The statements `run` executes on the store's read connection.
#[allow(deprecated)] // `trace_v2` takes a closure-less callback too, and this is all a test needs
fn statements_of(fixture: &Fixture, run: impl FnOnce()) -> Vec<String> {
    // The pool hands its idle connection to the next read, which is the store's.
    let mut connection = fixture.database.read().unwrap();
    connection.connection_mut().trace(Some(record_statement));
    drop(connection);
    STATEMENTS.lock().unwrap().clear();
    run();
    let mut connection = fixture.database.read().unwrap();
    connection.connection_mut().trace(None);
    drop(connection);
    std::mem::take(&mut *STATEMENTS.lock().unwrap())
}

fn leak(text: String) -> &'static str {
    Box::leak(text.into_boxed_str())
}

fn many_albums(fixture: &Fixture) {
    let seeds: Vec<Seed> = (1..=250)
        .map(|id| {
            let artist = leak(format!("Artist {id:03}"));
            let mut seed = Seed::new(id, "Song", artist, leak(format!("Album {id:03}")));
            seed.date = Some(["1990", "2004", "1975-02"][id as usize % 3]);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
}

#[test]
fn later_pages_count_nothing_and_album_pages_read_summaries_not_tracks() {
    let fixture = fixture();
    many_albums(&fixture);
    let store = &fixture.store;
    let check = |name: &str, tracks: bool, page: &dyn Fn(Option<&str>) -> Option<String>| {
        let mut first_cursor = None;
        let first = statements_of(&fixture, || first_cursor = page(None));
        let cursor = first_cursor.expect("a second page");
        let second = statements_of(&fixture, || drop(page(Some(&cursor))));
        assert_eq!(first.len(), 2, "{name}: a count and a page: {first:?}");
        assert!(first[0].contains("COUNT(*)"), "{name}: {first:?}");
        assert_eq!(second.len(), 1, "{name}: just the page: {second:?}");
        assert!(!second[0].contains("COUNT("), "{name}: {second:?}");
        for statement in first.iter().chain(&second) {
            assert!(
                !statement.contains("GROUP BY"),
                "{name} aggregates: {statement}"
            );
            assert!(
                tracks || !statement.contains("track_source_metadata"),
                "{name} reads tracks: {statement}"
            );
        }
    };
    for key in [LibraryAlbumSortKey::Title, LibraryAlbumSortKey::Year] {
        check(&format!("albums {key:?}"), false, &|cursor| {
            store
                .catalog_albums(cursor, None, key, ASC)
                .unwrap()
                .next_cursor
        });
    }
    for key in [
        LibraryAlbumArtistSortKey::Artist,
        LibraryAlbumArtistSortKey::AlbumCount,
        LibraryAlbumArtistSortKey::TrackCount,
    ] {
        check(&format!("artists {key:?}"), false, &|cursor| {
            store
                .catalog_album_artists(cursor, None, key, DESC)
                .unwrap()
                .next_cursor
        });
    }
    check("tracks", true, &|cursor| {
        store
            .catalog_tracks(cursor, None, LibraryTrackSortKey::Title, ASC)
            .unwrap()
            .next_cursor
    });
}

#[test]
fn a_filter_folds_kana_and_width_and_still_matches_wildcards_literally() {
    let fixture = fixture();
    let mut yuzu = Seed::new(1, "ユズ", "ゆず", "ユズ Best");
    yuzu.album_artist = Some("ゆず");
    let mut wide = Seed::new(2, "ＡＢＣ", "Half Width", "Wide");
    wide.album_artist = Some("Half Width");
    let mut symbols = Seed::new(3, "100% pure", "Under_score", "Back\\slash");
    symbols.album_artist = Some("Under_score");
    fixture.add_all(&[yuzu, wide, symbols, Seed::new(4, "Plain", "Plain", "Plain")]);
    let store = &fixture.store;
    let tracks = |search: &str| {
        store
            .catalog_tracks(None, Some(search), LibraryTrackSortKey::Title, ASC)
            .unwrap()
            .items
            .into_iter()
            .map(|track| track.title)
            .collect::<Vec<_>>()
    };

    assert_eq!(tracks("ゆず"), ["ユズ"], "hiragana finds katakana");
    assert_eq!(tracks("ユズ"), ["ユズ"]);
    assert_eq!(tracks("ﾕｽﾞ"), ["ユズ"], "half-width katakana");
    assert_eq!(tracks("abc"), ["ＡＢＣ"]);
    assert_eq!(tracks("ＡＢＣ"), ["ＡＢＣ"], "full-width finds full-width");
    assert_eq!(tracks("%"), ["100% pure"]);
    assert_eq!(
        tracks("％"),
        ["100% pure"],
        "a full-width percent is a literal one"
    );
    assert_eq!(tracks("_"), ["100% pure"]);
    assert_eq!(tracks("\\"), ["100% pure"]);
    assert_eq!(tracks("p_re"), Vec::<String>::new(), "_ is not a wildcard");

    let albums = store
        .catalog_albums(None, Some("ゆず"), TITLE, ASC)
        .unwrap();
    assert_eq!(albums.items.len(), 1);
    assert_eq!(albums.items[0].key.title, "ユズ Best");
    let artists = store
        .catalog_album_artists(None, Some("ﾕｽﾞ"), LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!(artists.items.len(), 1);
    assert_eq!(artists.items[0].key.name, "ゆず");
    let none = store
        .catalog_album_artists(None, Some("%"), LibraryAlbumArtistSortKey::Artist, ASC)
        .unwrap();
    assert_eq!(none.items.len(), 0, "% is not a wildcard");
}

#[test]
fn the_scroll_index_follows_the_sort_order_for_mixed_scripts_in_both_directions() {
    let fixture = fixture();
    let titles = [
        "Apple",
        "あおい",
        "アイス",
        "いろは",
        "かな",
        "ガ",
        "漢字",
        "字",
        "Zed",
        "123",
        "(x)",
        "ほし",
        "ユズ",
        "Éclair",
        "ん",
        "Banana",
        "ちゃ",
        "한글",
        "Дом",
    ];
    let seeds: Vec<Seed> = titles
        .into_iter()
        .enumerate()
        .map(|(index, title)| Seed::new(index as i64 + 1, title, "Artist", "Album"))
        .collect();
    fixture.add_all(&seeds);
    let store = &fixture.store;
    for direction in [ASC, DESC] {
        let buckets = store
            .catalog_track_index(None, LibraryTrackSortKey::Title, direction)
            .unwrap();
        let tracks = store
            .catalog_tracks(None, None, LibraryTrackSortKey::Title, direction)
            .unwrap()
            .items;
        // Expanding the buckets gives each row's label, in the list's order.
        let expanded: Vec<&str> = buckets
            .iter()
            .flat_map(|bucket| std::iter::repeat_n(bucket.label.as_str(), bucket.count as usize))
            .collect();
        let labels: Vec<String> = tracks
            .iter()
            .map(|track| {
                crate::library::text::index_label(&crate::library::text::sort_key(
                    &track.title,
                    None,
                ))
            })
            .collect();
        assert_eq!(expanded, labels, "{direction:?}");
        let mut seen: Vec<&str> = buckets.iter().map(|bucket| bucket.label.as_str()).collect();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(
            seen.len(),
            buckets.len(),
            "{direction:?}: one run per label"
        );
    }
    let ascending: Vec<String> = store
        .catalog_track_index(None, LibraryTrackSortKey::Title, ASC)
        .unwrap()
        .into_iter()
        .map(|bucket| bucket.label)
        .collect();
    assert_eq!(
        ascending,
        ["#", "A", "B", "E", "Z", "Д", "あ", "か", "た", "は", "や", "わ", "漢", "한"],
        "symbols and digits, Latin, other scripts, kana rows, kanji as one bucket"
    );
    assert!(
        store
            .catalog_track_index(None, LibraryTrackSortKey::Duration, ASC)
            .unwrap()
            .is_empty(),
        "a list ordered by length has no letters"
    );
}

#[test]
fn the_scroll_index_of_albums_and_artists_counts_what_the_list_holds() {
    let fixture = fixture();
    let mut seeds = Vec::new();
    for (index, name) in ["Aa", "Ab", "いろは", "ユズ", "漢"].into_iter().enumerate() {
        let mut seed = Seed::new(index as i64 + 1, "T", name, name);
        seed.date = (index % 2 == 0).then_some("2001");
        seeds.push(seed);
    }
    fixture.add_all(&seeds);
    let store = &fixture.store;
    let pairs = |buckets: Vec<LibraryIndexBucket>| {
        buckets
            .into_iter()
            .map(|bucket| (bucket.label, bucket.count))
            .collect::<Vec<_>>()
    };
    let expected = |labels: &[(&str, u64)]| -> Vec<(String, u64)> {
        labels
            .iter()
            .map(|(label, count)| ((*label).to_owned(), *count))
            .collect()
    };

    let by_name = expected(&[("A", 2), ("あ", 1), ("や", 1), ("漢", 1)]);
    assert_eq!(
        pairs(store.catalog_album_index(None, TITLE, ASC).unwrap()),
        by_name
    );
    assert_eq!(
        pairs(
            store
                .catalog_album_artist_index(None, LibraryAlbumArtistSortKey::Artist, ASC)
                .unwrap()
        ),
        by_name
    );
    assert_eq!(
        pairs(store.catalog_album_index(None, TITLE, DESC).unwrap()),
        expected(&[("漢", 1), ("や", 1), ("あ", 1), ("A", 2)])
    );
    assert_eq!(
        pairs(
            store
                .catalog_album_index(None, LibraryAlbumSortKey::Year, ASC)
                .unwrap()
        ),
        expected(&[("2001", 3), ("?", 2)]),
        "years, then the undated"
    );
    assert!(store
        .catalog_album_artist_index(None, LibraryAlbumArtistSortKey::TrackCount, ASC)
        .unwrap()
        .is_empty());
    let filtered = store.catalog_album_index(Some("ゆず"), TITLE, ASC).unwrap();
    assert_eq!(
        pairs(filtered),
        expected(&[("や", 1)]),
        "the filter narrows it"
    );
}

#[test]
fn jumping_to_a_letter_in_a_huge_list_reads_only_the_target_region() {
    let fixture = fixture();
    let seeds: Vec<Seed> = (1..=50_000i64)
        .map(|id| {
            let letter = (b'A' + ((id - 1) / 2_000) as u8) as char;
            let mut seed = Seed::new(
                id,
                leak(format!("{letter}{id:05}")),
                leak(format!("Artist {}", id / 10)),
                leak(format!("Album {}", id / 10)),
            );
            seed.track = Some(id % 10);
            seed
        })
        .collect();
    fixture.add_all(&seeds);
    let store = &fixture.store;
    let buckets = store
        .catalog_track_index(None, LibraryTrackSortKey::Title, ASC)
        .unwrap();
    assert_eq!(
        buckets.iter().map(|bucket| bucket.count).sum::<u64>(),
        50_000
    );
    let target = buckets
        .iter()
        .position(|bucket| bucket.label == "M")
        .unwrap();
    let skip: u64 = buckets[..target].iter().map(|bucket| bucket.count).sum();

    let mut page = None;
    let statements = statements_of(&fixture, || {
        page = Some(
            store
                .catalog_tracks_from(None, skip, None, LibraryTrackSortKey::Title, ASC)
                .unwrap(),
        );
    });
    let page = page.unwrap();

    assert_eq!(page.items.len(), PAGE_SIZE);
    assert_eq!(page.items[0].title, "M24001", "the first M");
    assert_eq!(page.total_count, Some(50_000));
    assert!(page.next_cursor.is_some());
    assert!(
        statements.len() <= 4,
        "count, the row before, the page: {statements:?}"
    );
    let continued = store
        .catalog_tracks(
            page.next_cursor.as_deref(),
            None,
            LibraryTrackSortKey::Title,
            ASC,
        )
        .unwrap();
    assert_eq!(continued.items[0].title, "M24101");
}
