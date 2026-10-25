//! The read side over a seeded database: the lists and their pages, the letter indexes, the
//! Library version, and how playback selections are resolved.

use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, DirectoryId, TrackId};
use crate::library::database::Database;
use crate::library::models::*;
use crate::library::text::{SortTags, TrackKeys, album_edition_of};
use crate::library::tracks::{PlaybackLookupError, PlaybackSourceError};
use crate::library::{Library, summary};
use crate::test_support::{TestDirectory, null_notifier, state_store_for_tests};
use rusqlite::params;
use std::path::PathBuf;

/// The track with this rowid, for tests that name tracks by ID.
fn track_id_of(rowid: i64) -> TrackId {
    TrackId::try_from_rowid(rowid).expect("test track IDs are above zero")
}

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    database: Database,
    library: Library,
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
    let library = Library::open(
        &directory.file("data"),
        state_store_for_tests(null_notifier()),
    )
    .expect("library");
    let database = library.database.clone();
    database
        .write()
        .unwrap()
        .execute(
            "INSERT INTO directories(id,path,enabled,scan_generation) VALUES(1,?1,1,0)",
            params![music.to_string_lossy()],
        )
        .unwrap();
    Fixture {
        _directory: directory,
        music,
        database,
        library,
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
                &self.music.to_string_lossy(),
            );
            transaction
                .execute(
                    "INSERT INTO library_files(id,directory_id,relative_path,file_name,extension,modification_key,source_revision,seen_generation,availability,inspection_status) VALUES(?1,1,?2,?2,'wav','1',1,1,'available','indexed')",
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
                    "INSERT INTO track_source_metadata(track_id,source_revision,tag_title,tag_artist,tag_album,tag_album_artist,track_number,disc_number,date,duration_ms,tag_status,artwork_status,artwork_id,title,artist,album,album_artist,year,title_sort,artist_sort,album_sort,album_artist_sort,search_text,album_id,album_directory) VALUES(?1,1,?2,?3,?4,?5,?6,?7,?8,?9,'loaded','notPresent',?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
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
                        keys.album_id,
                        keys.album_directory
                    ],
                )
                .unwrap();
        }
        summary::rebuild(&transaction).unwrap();
        transaction.commit().unwrap();
    }

    fn sql(&self, sql: &str) {
        self.database.write().unwrap().execute(sql, []).unwrap();
    }

    /// Creates the audio files of tracks `ids` so playback can find them.
    fn touch_audio(&self, ids: impl IntoIterator<Item = i64>) {
        for id in ids {
            std::fs::write(self.music.join(format!("{id}.wav")), []).unwrap();
        }
    }

    fn tracks(
        &self,
        search: Option<&str>,
        sort: TrackSortKey,
        direction: SortDirection,
    ) -> Page<TrackRow> {
        self.library
            .list_tracks(&request(search, sort, direction, 0, 1_000))
            .unwrap()
    }

    fn albums(&self, search: Option<&str>, sort: AlbumSortKey) -> Page<AlbumRow> {
        self.library
            .list_albums(&request(search, sort, SortDirection::Ascending, 0, 1_000))
            .unwrap()
    }
}

const ASC: SortDirection = SortDirection::Ascending;
const DESC: SortDirection = SortDirection::Descending;

fn request<K>(
    search: Option<&str>,
    sort: K,
    direction: SortDirection,
    offset: u32,
    limit: u32,
) -> ListRequest<K> {
    ListRequest {
        search: search.map(str::to_owned),
        sort,
        direction,
        offset,
        limit,
    }
}

/// The rowids of a track page's rows, in order.
fn track_rowids(page: &Page<TrackRow>) -> Vec<i64> {
    page.items.iter().map(|row| row.core.id.rowid()).collect()
}

#[test]
fn unknown_values_come_last_in_both_directions() {
    let fixture = fixture();
    fixture.add_all(&[
        Seed::new(1, "One", "Beta", "x"),
        Seed::new(2, "Two", "", "x"),
        Seed::new(3, "Three", "Alpha", "x"),
    ]);

    let ascending = fixture.tracks(None, TrackSortKey::Artist, ASC);
    let descending = fixture.tracks(None, TrackSortKey::Artist, DESC);

    assert_eq!(track_rowids(&ascending), [3, 1, 2]);
    assert_eq!(track_rowids(&descending), [1, 3, 2], "unknown still last");
}

#[test]
fn a_page_is_a_window_and_the_total_counts_the_whole_filtered_list() {
    let fixture = fixture();
    let titles: Vec<String> = (1..=10).map(|id| format!("Title {id:02}")).collect();
    let seeds: Vec<Seed<'_>> = titles
        .iter()
        .zip(1..)
        .map(|(title, id)| Seed::new(id, title, "Artist", "Album"))
        .collect();
    fixture.add_all(&seeds);

    let window = fixture
        .library
        .list_tracks(&request(None, TrackSortKey::Title, ASC, 3, 2))
        .unwrap();
    assert_eq!(track_rowids(&window), [4, 5]);
    assert_eq!(window.total, 10);

    let filtered = fixture
        .library
        .list_tracks(&request(Some("title 0"), TrackSortKey::Title, ASC, 0, 2))
        .unwrap();
    assert_eq!(filtered.total, 9, "the search counts what it matches");
    assert_eq!(track_rowids(&filtered), [1, 2]);
}

#[test]
fn the_search_is_folded_and_matches_anywhere_in_a_value() {
    let fixture = fixture();
    fixture.add_all(&[
        Seed::new(1, "ユズ", "Band", "x"),
        Seed::new(2, "Other", "Yuzu Fan", "x"),
        Seed::new(3, "Nothing", "Band", "x"),
    ]);

    let found = fixture.tracks(Some("ゆず"), TrackSortKey::Title, ASC);
    assert_eq!(track_rowids(&found), [1]);
    let by_artist = fixture.tracks(Some("yuzu"), TrackSortKey::Title, ASC);
    assert_eq!(track_rowids(&by_artist), [2]);
    assert_eq!(
        fixture.tracks(Some("%"), TrackSortKey::Title, ASC).total,
        0,
        "a wildcard is matched literally"
    );
}

#[test]
fn the_letter_index_counts_each_label_from_its_start_and_marks_unknown_last() {
    let fixture = fixture();
    fixture.add_all(&[
        Seed::new(1, "A", "Apple", "x"),
        Seed::new(2, "B", "Apricot", "x"),
        Seed::new(3, "C", "Banana", "x"),
        Seed::new(4, "D", "", "x"),
    ]);

    let entries = fixture
        .library
        .track_index(&request(None, TrackSortKey::Artist, ASC, 0, 0))
        .unwrap();

    assert_eq!(
        entries,
        [
            LetterIndexEntry {
                label: "A".into(),
                kind: LetterIndexEntryKind::Letter,
                start: 0,
                count: 2,
            },
            LetterIndexEntry {
                label: "B".into(),
                kind: LetterIndexEntryKind::Letter,
                start: 2,
                count: 1,
            },
            LetterIndexEntry {
                label: "?".into(),
                kind: LetterIndexEntryKind::Unknown,
                start: 3,
                count: 1,
            },
        ]
    );
}

#[test]
fn the_letter_index_of_a_descending_list_runs_in_the_list_order() {
    let fixture = fixture();
    fixture.add_all(&[
        Seed::new(1, "A", "Apple", "x"),
        Seed::new(2, "B", "Banana", "x"),
        Seed::new(3, "C", "Cherry", "x"),
    ]);

    let entries = fixture
        .library
        .artist_index(&request(None, ArtistSortKey::Artist, DESC, 0, 0))
        .unwrap();

    let labels: Vec<(&str, u32)> = entries
        .iter()
        .map(|entry| (entry.label.as_str(), entry.start))
        .collect();
    assert_eq!(labels, [("C", 0), ("B", 1), ("A", 2)]);
}

#[test]
fn a_list_by_duration_has_no_letter_index() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "A", "Apple", "x"));

    let entries = fixture
        .library
        .track_index(&request(None, TrackSortKey::Duration, ASC, 0, 0))
        .unwrap();
    assert_eq!(entries, []);
}

#[test]
fn an_album_list_by_year_is_indexed_by_year_with_the_undated_last() {
    let fixture = fixture();
    let mut dated = Seed::new(1, "A", "Band", "First");
    dated.date = Some("1990");
    let mut later = Seed::new(2, "B", "Band", "Second");
    later.date = Some("2004");
    fixture.add_all(&[dated, later, Seed::new(3, "C", "Band", "Third")]);

    let entries = fixture
        .library
        .album_index(&request(None, AlbumSortKey::Year, DESC, 0, 0))
        .unwrap();

    assert_eq!(
        entries
            .iter()
            .map(|entry| (entry.label.as_str(), entry.kind, entry.start, entry.count))
            .collect::<Vec<_>>(),
        [
            ("2004", LetterIndexEntryKind::Letter, 0, 1),
            ("1990", LetterIndexEntryKind::Letter, 1, 1),
            ("?", LetterIndexEntryKind::Unknown, 2, 1),
        ]
    );
}

#[test]
fn a_page_carries_the_version_it_was_read_at() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "A", "Apple", "x"));

    let page = fixture.tracks(None, TrackSortKey::Title, ASC);

    assert_eq!(page.version, fixture.library.version());
}

#[test]
fn the_version_changes_when_a_directory_is_disabled_and_when_missing_tracks_are_deleted() {
    let fixture = fixture();
    fixture.add(Seed::new(1, "A", "Apple", "x"));
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=1");
    let before = fixture.library.version();

    fixture
        .library
        .set_directory_enabled(DirectoryId::try_from_rowid(1).unwrap(), false)
        .unwrap();
    let after_disable = fixture.library.version();
    assert!(after_disable > before);

    assert_eq!(fixture.library.delete_missing().unwrap(), 1);
    assert!(fixture.library.version() > after_disable);
    assert_eq!(fixture.tracks(None, TrackSortKey::Title, ASC).total, 0);
}

#[test]
fn the_version_changes_when_a_directory_is_added() {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let library = Library::open(
        &directory.file("data"),
        state_store_for_tests(null_notifier()),
    )
    .expect("library");
    let before = library.version();

    library.add_directory(music).expect("add");

    assert!(library.version() > before);
}

#[test]
fn a_track_with_an_album_tag_carries_the_album_and_album_artist_ids() {
    let fixture = fixture();
    fixture.touch_audio([1, 2]);
    let mut filed = Seed::new(1, "Song", "Singer", "Record");
    filed.album_artist = Some("Band");
    fixture.add_all(&[filed, Seed::new(2, "Single", "Singer", "")]);
    let library = &fixture.library;

    let filed = library.playback_for_track(track_id_of(1)).unwrap();
    let album_id = filed.track.album.as_ref().unwrap().album.id;
    assert_eq!(
        library.album_details(album_id).unwrap().track_count,
        1,
        "the ID opens the album the playback names"
    );
    assert_eq!(
        filed.track.album.as_ref().unwrap().album.artist,
        ArtistRef {
            id: ArtistId::of("Band"),
            name: "Band".to_owned()
        }
    );
    let single = library.playback_for_track(track_id_of(2)).unwrap();
    assert_eq!(single.track.album, None, "no album tag, no album");
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
        "UPDATE track_source_metadata SET title='multi.part', title_sort='multi.part', search_text='multi.part'||char(31)||'artist'||char(31)||'album'||char(31)||'artist' WHERE track_id=1",
    );
    let library = &fixture.library;

    let selection = library
        .playback_for_tracks(None, TrackSortKey::Title, ASC, Some(track_id_of(1)))
        .unwrap();
    let tracks = library.playable_tracks(&selection.track_ids).unwrap();
    let track = tracks[selection.start_index].as_ref().unwrap();
    assert_eq!(track.track.core.title, "multi.part");
    let album = track
        .track
        .album
        .as_ref()
        .expect("a track with an album tag has an album");
    assert_eq!(album.album.artist.id, ArtistId::of("Artist"));
    assert_eq!(album.track_count, 1);
    let restored = library
        .playable_tracks(&[track_id_of(1), track_id_of(999)])
        .unwrap();
    assert_eq!(
        restored.iter().map(Option::is_some).collect::<Vec<_>>(),
        [true, false],
        "unknown ids come back as holes, in the order asked"
    );

    let by_stem = fixture.tracks(Some("multi.part"), TrackSortKey::Title, ASC);
    assert_eq!((by_stem.items.len(), by_stem.total), (1, 1));
    assert_eq!(by_stem.items[0].core.title, "multi.part");
    let by_extension = fixture.tracks(Some("flac"), TrackSortKey::Title, ASC);
    assert_eq!((by_extension.items.len(), by_extension.total), (0, 0));
}

#[test]
fn track_playback_follows_the_list_order_and_skips_tracks_that_cannot_play() {
    let fixture = fixture();
    fixture.touch_audio(1..=4);
    for (id, title) in [(1, "Bravo"), (2, "Alpha"), (3, "Charlie"), (4, "Delta")] {
        fixture.add(Seed::new(id, title, "Artist", "Album"));
    }
    fixture.sql("UPDATE library_files SET availability='missing' WHERE id=4");
    let library = &fixture.library;

    let selection = library
        .playback_for_tracks(None, TrackSortKey::Title, DESC, Some(track_id_of(2)))
        .unwrap();
    assert_eq!(
        selection.track_ids,
        [track_id_of(3), track_id_of(1), track_id_of(2)],
        "sorted as listed, missing skipped"
    );
    assert_eq!(selection.track_ids[selection.start_index], track_id_of(2));

    let filtered = library
        .playback_for_tracks(Some("alp"), TrackSortKey::Title, ASC, None)
        .unwrap();
    assert_eq!(filtered.track_ids, [track_id_of(2)]);
    assert_eq!(
        library
            .playable_tracks(&[track_id_of(2)])
            .unwrap()
            .remove(0)
            .unwrap()
            .track
            .album
            .unwrap()
            .track_count,
        4,
        "an album is counted whole, whatever the filter shows of it"
    );
    assert_eq!(
        library
            .playback_for_tracks(Some("alp"), TrackSortKey::Title, ASC, Some(track_id_of(1)))
            .err(),
        Some(PlaybackLookupError::Source(
            PlaybackSourceError::TrackNotMember
        ))
    );
    assert_eq!(
        library
            .playback_for_tracks(None, TrackSortKey::Title, ASC, Some(track_id_of(4)))
            .err(),
        Some(PlaybackLookupError::Common(CommandError::TrackUnavailable))
    );
}

#[test]
fn playing_what_the_list_shows_holds_for_every_sort_and_direction() {
    let fixture = fixture();
    let seeds: Vec<Seed<'_>> = (1..=40)
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
    for sort in [
        TrackSortKey::Title,
        TrackSortKey::Artist,
        TrackSortKey::Album,
        TrackSortKey::Duration,
    ] {
        for direction in [ASC, DESC] {
            let listed = track_rowids(&fixture.tracks(None, sort, direction));
            let played: Vec<i64> = fixture
                .library
                .playback_for_tracks(None, sort, direction, None)
                .unwrap()
                .track_ids
                .iter()
                .map(|id| id.rowid())
                .collect();
            assert_eq!(played, listed, "{sort:?} {direction:?}");
        }
    }
}

#[test]
fn an_album_playback_sequence_is_complete_beyond_one_page() {
    let fixture = fixture();
    fixture.touch_audio(1..=101);
    let seeds: Vec<Seed<'_>> = (1..=101)
        .map(|id| Seed::new(id, "Track", "Artist", "Long Album"))
        .collect();
    fixture.add_all(&seeds);

    let album_id: AlbumId = fixture.albums(None, AlbumSortKey::Title).items[0].id;

    let selection = fixture
        .library
        .playback_for_album_id(album_id, Some(track_id_of(101)))
        .unwrap();

    assert_eq!(
        (selection.track_ids.len(), selection.start_index),
        (101, 100)
    );
    assert_eq!(
        fixture.library.list_album_tracks(album_id).unwrap().len(),
        101,
        "an album's tracks are listed whole"
    );
}
