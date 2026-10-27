use super::*;

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

    fixture.library.delete_missing_tracks().unwrap();
    assert!(fixture.library.version() > after_disable);
    assert_eq!(fixture.tracks(None, TrackSortKey::Title, ASC).total, 0);
}

#[test]
fn the_version_changes_when_a_directory_is_added() {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let library = Library::open(&directory.file("data"), null_messages()).expect("library");
    let before = library.version();

    library.add_directory(music).expect("add");

    assert!(library.version() > before);
}
