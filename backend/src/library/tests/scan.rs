//! End-to-end scans of real (tiny) audio files against a real database.

use crate::library::database::Database;
use crate::library::directories;
use crate::library::models::{ScanFailure, ScanState, ScanStatus};
use crate::messages::{StateValue, Versioned};
use crate::test_support::{TestDirectory, hub_for_tests, null_message_listener, write_pcm_i16_wav};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64};

pub(super) struct Fixture {
    _directory: TestDirectory,
    pub(super) music: PathBuf,
    pub(super) database: Database,
    /// The Library version the scans advance.
    pub(super) version: AtomicU64,
}

pub(super) fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let data = directory.file("data");
    let database = Database::initialize(&data).expect("database");
    directories::add(&database, &music.to_string_lossy()).expect("register directory");
    Fixture {
        _directory: directory,
        music,
        database,
        version: AtomicU64::new(0),
    }
}

pub(super) fn write_tone(path: &Path, samples: usize) {
    write_pcm_i16_wav(path, 8_000, 1, &vec![1_000i16; samples]);
}

pub(super) fn run_scan(fixture: &Fixture, cancelled: bool) -> ScanState {
    run_jobs(fixture, cancelled, None)
}

/// A scan that follows changes: only the directories holding `changed` paths are walked.
fn run_scan_of(fixture: &Fixture, changed: &[PathBuf]) -> ScanState {
    run_jobs(fixture, false, Some(changed))
}

fn run_jobs(fixture: &Fixture, cancelled: bool, dirs: Option<&[PathBuf]>) -> ScanState {
    run_versioned(fixture, cancelled, dirs).value
}

fn run_versioned(
    fixture: &Fixture,
    cancelled: bool,
    dirs: Option<&[PathBuf]>,
) -> Versioned<ScanState> {
    let directories = directories::list(&fixture.database.read().unwrap()).expect("directories");
    let jobs: Vec<_> = directories
        .into_iter()
        .map(|directory| crate::library::scanner::ScanJob {
            directory,
            dirs: dirs.map(<[PathBuf]>::to_vec),
        })
        .collect();
    let hub = hub_for_tests(null_message_listener());
    hub.publish(StateValue::Scan(ScanState {
        state: ScanStatus::Running,
        ..ScanState::idle()
    }));
    crate::library::scanner::run(
        &fixture.database,
        &jobs,
        &hub,
        &fixture.version,
        &AtomicBool::new(cancelled),
    );

    hub.read(|published| published.scan.clone())
}

#[test]
fn the_scan_version_grows_with_each_change_of_the_scan() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 16_000);
    let scan = run_versioned(&fixture, false, None);
    // The scan starts as running, sets the directory, and ends: each is a change, and a count that
    // leaves the expected count unchanged is not, so the version is at least three.
    assert_eq!(scan.value.state, ScanStatus::Completed);
    assert!(scan.version >= 3, "version {}", scan.version);
}

fn files(fixture: &Fixture) -> Vec<(String, String, String, i64)> {
    let c = fixture.database.read().unwrap();
    let mut statement = c
        .prepare("SELECT relative_path,availability,inspection_status,source_revision FROM library_files ORDER BY relative_path")
        .unwrap();

    statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

fn count(fixture: &Fixture, sql: &str) -> i64 {
    let c = fixture.database.read().unwrap();
    c.query_row(sql, [], |row| row.get(0)).unwrap()
}

#[test]
fn indexes_supported_files_and_ignores_the_rest() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    write_tone(&fixture.music.join("b.wav"), 16_000);
    std::fs::write(fixture.music.join("notes.txt"), "not audio").unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!(
        (
            scan.discovered_count,
            scan.inspected_count,
            scan.indexed_count,
            scan.failed_count
        ),
        (2, 2, 2, 0)
    );
    assert_eq!(
        files(&fixture),
        vec![
            ("a.wav".into(), "available".into(), "indexed".into(), 1),
            ("b.wav".into(), "available".into(), "indexed".into(), 1),
        ]
    );
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 2);
    assert_eq!(
        count(
            &fixture,
            "SELECT duration_ms FROM track_source_metadata m JOIN tracks t ON t.id=m.track_id JOIN library_files f ON f.id=t.file_id WHERE f.relative_path='b.wav'"
        ),
        2_000
    );
}

#[test]
fn files_in_subdirectories_keep_their_relative_path() {
    let fixture = fixture();
    std::fs::create_dir_all(fixture.music.join("Artist").join("Album")).unwrap();
    write_tone(
        &fixture.music.join("Artist").join("Album").join("01.wav"),
        800,
    );

    run_scan(&fixture, false);

    assert_eq!(files(&fixture)[0].0, "Artist/Album/01.wav");
}

#[test]
fn a_second_scan_does_not_inspect_unchanged_files() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    let first = run_scan(&fixture, false);
    assert_eq!(
        first.expected_count, 0,
        "a first scan has no history to expect from"
    );

    let second = run_scan(&fixture, false);

    assert_eq!(second.state, ScanStatus::Completed);
    assert_eq!(
        second.expected_count, 1,
        "a rescan expects what was found before"
    );
    assert_eq!((second.discovered_count, second.inspected_count), (1, 0));
    assert_eq!(files(&fixture)[0].3, 1, "the revision stays");
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 1);
}

#[test]
fn a_changed_file_gets_a_new_revision_and_fresh_metadata() {
    let fixture = fixture();
    let path = fixture.music.join("a.wav");
    write_tone(&path, 8_000);
    run_scan(&fixture, false);

    std::thread::sleep(std::time::Duration::from_millis(30));
    write_tone(&path, 24_000);
    let second = run_scan(&fixture, false);

    assert_eq!((second.inspected_count, second.indexed_count), (1, 1));
    assert_eq!(files(&fixture)[0].3, 2);
    assert_eq!(
        count(&fixture, "SELECT duration_ms FROM track_source_metadata"),
        3_000
    );
    assert_eq!(
        count(
            &fixture,
            "SELECT source_revision FROM track_source_metadata"
        ),
        2
    );
    assert_eq!(
        count(&fixture, "SELECT COUNT(*) FROM tracks"),
        1,
        "the track keeps its identity"
    );
}

#[test]
fn a_removed_file_is_marked_missing_and_its_track_is_kept() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    write_tone(&fixture.music.join("b.wav"), 8_000);
    run_scan(&fixture, false);

    std::fs::remove_file(fixture.music.join("b.wav")).unwrap();
    let second = run_scan(&fixture, false);

    assert_eq!(second.state, ScanStatus::Completed);
    let files = files(&fixture);
    assert_eq!(files[0].1, "available");
    assert_eq!(files[1].1, "missing");
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 2);
}

#[test]
fn a_file_that_cannot_be_decoded_is_marked_unsupported_without_stopping_the_scan() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    std::fs::write(fixture.music.join("broken.mp3"), b"this is not an mp3").unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!((scan.indexed_count, scan.failed_count), (1, 1));
    let files = files(&fixture);
    assert_eq!(
        files[0],
        ("a.wav".into(), "available".into(), "indexed".into(), 1)
    );
    assert_eq!(
        files[1],
        (
            "broken.mp3".into(),
            "available".into(),
            "unsupported".into(),
            1
        )
    );
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 1);
}

#[test]
fn a_cancelled_scan_stops_and_changes_nothing() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);

    let scan = run_scan(&fixture, true);

    assert_eq!(scan.state, ScanStatus::Cancelled);
    assert_eq!(files(&fixture).len(), 0);
}

#[test]
fn a_scan_covers_more_files_than_fit_in_one_batch() {
    let fixture = fixture();
    for index in 0..230 {
        write_tone(&fixture.music.join(format!("{index:03}.wav")), 160);
    }

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!(
        (scan.discovered_count, scan.indexed_count, scan.failed_count),
        (230, 230, 0)
    );
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 230);
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM library_files WHERE inspection_status='indexed'"
        ),
        230
    );
}

#[test]
fn an_unreadable_directory_fails_the_scan_but_keeps_other_directories_files_available() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    run_scan(&fixture, false);
    std::fs::remove_dir_all(&fixture.music).unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Failed);
    assert_eq!(
        scan.failure_code,
        Some(ScanFailure::DirectoryTraversalFailed)
    );
    assert_eq!(
        files(&fixture)[0].1,
        "available",
        "an unreadable directory is not a deleted library"
    );
}

#[test]
fn a_scan_files_each_track_under_keys_derived_from_its_tags_and_file_name() {
    let fixture = fixture();
    write_tone(&fixture.music.join("untagged song.wav"), 800);

    run_scan(&fixture, false);

    let keys: (String, String, String, String, Option<i32>) = fixture
        .database
        .read()
        .unwrap()
        .query_row(
            "SELECT title, artist, album, album_artist, year FROM track_source_metadata",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(
        keys,
        (
            "untagged song".into(),
            String::new(),
            String::new(),
            String::new(),
            None
        ),
        "no tags: titled by the file, filed under no album and no artist"
    );
}

#[test]
fn a_file_that_stops_being_decodable_keeps_its_track_without_its_old_tags() {
    let fixture = fixture();
    let path = fixture.music.join("a.wav");
    write_tone(&path, 8_000);
    run_scan(&fixture, false);

    std::thread::sleep(std::time::Duration::from_millis(30));
    std::fs::write(&path, b"not audio any more").unwrap();
    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!(files(&fixture)[0].2, "unsupported");
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 1);
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM track_source_metadata WHERE duration_ms IS NULL AND source_revision = 2"
        ),
        1,
        "the tags of the earlier revision are cleared"
    );
}

#[test]
fn truncated_and_garbage_files_are_reported_failed_and_the_scan_completes() {
    let fixture = fixture();
    write_tone(&fixture.music.join("good.wav"), 8_000);
    write_tone(&fixture.music.join("whole.wav"), 8_000);
    let bytes = std::fs::read(fixture.music.join("whole.wav")).unwrap();
    std::fs::write(fixture.music.join("truncated.wav"), &bytes[..30]).unwrap();
    std::fs::write(fixture.music.join("half.wav"), &bytes[..bytes.len() / 2]).unwrap();
    std::fs::write(fixture.music.join("garbage.flac"), vec![0xFFu8; 4_096]).unwrap();
    std::fs::write(fixture.music.join("empty.mp3"), b"").unwrap();
    std::fs::write(
        fixture.music.join("tags.mp3"),
        b"ID3\x04\x00\x00\xff\xff\xff\xff",
    )
    .unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!(scan.discovered_count, 7);
    assert_eq!(scan.inspected_count, 7);
    assert!(scan.indexed_count >= 2, "the good files are indexed");
}

#[test]
fn a_directory_holding_the_data_directory_cannot_be_registered() {
    let fixture = fixture();
    let parent = fixture.music.parent().unwrap();

    let refused = directories::add(&fixture.database, &parent.to_string_lossy());

    assert!(matches!(
        refused,
        Err(crate::errors::CommandError::DirectoryContainsDataDirectory)
    ));
}

pub(super) fn track_ids_by_path(fixture: &Fixture) -> Vec<(String, i64)> {
    let c = fixture.database.read().unwrap();
    let mut statement = c
        .prepare("SELECT f.relative_path, t.id FROM tracks t JOIN library_files f ON f.id = t.file_id ORDER BY f.relative_path")
        .unwrap();

    statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

#[test]
fn a_moved_directory_and_a_renamed_file_keep_their_tracks_and_leave_nothing_missing() {
    let fixture = fixture();
    std::fs::create_dir_all(fixture.music.join("Old")).unwrap();
    write_tone(&fixture.music.join("Old").join("one.wav"), 8_000);
    write_tone(&fixture.music.join("Old").join("two.wav"), 16_000);
    write_tone(&fixture.music.join("loose.wav"), 24_000);
    run_scan(&fixture, false);
    let before = track_ids_by_path(&fixture);
    let id_of = |tracks: &[(String, i64)], path: &str| {
        tracks.iter().find(|(p, _)| p == path).map(|(_, id)| *id)
    };

    std::fs::rename(fixture.music.join("Old"), fixture.music.join("New")).unwrap();
    std::fs::rename(
        fixture.music.join("loose.wav"),
        fixture.music.join("renamed.wav"),
    )
    .unwrap();
    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, ScanStatus::Completed);
    let after = track_ids_by_path(&fixture);
    assert_eq!(after.len(), 3, "no duplicates: {after:?}");
    assert_eq!(id_of(&after, "New/one.wav"), id_of(&before, "Old/one.wav"));
    assert_eq!(id_of(&after, "New/two.wav"), id_of(&before, "Old/two.wav"));
    assert_eq!(id_of(&after, "renamed.wav"), id_of(&before, "loose.wav"));
    // A queue entry holds the track id: it now resolves to the file's new place.
    let queued =
        crate::ids::TrackId::try_from_rowid(id_of(&before, "Old/one.wav").unwrap()).unwrap();
    let location = crate::library::tracks::location_of(&fixture.database, queued)
        .unwrap()
        .existing()
        .unwrap();
    assert!(
        location.path.ends_with("New/one.wav"),
        "{:?}",
        location.path
    );
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM library_files WHERE availability = 'missing'"
        ),
        0
    );
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM library_files"), 3);
    assert_eq!(
        count(&fixture, "SELECT COUNT(*) FROM track_source_metadata"),
        3
    );
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM library_files WHERE relink_pending = 1"
        ),
        0,
        "arrivals are settled once a scan completes"
    );
}

#[test]
fn a_deleted_file_stays_missing_until_the_listener_deletes_it() {
    let fixture = fixture();
    write_tone(&fixture.music.join("keep.wav"), 8_000);
    write_tone(&fixture.music.join("gone.wav"), 16_000);
    run_scan(&fixture, false);
    std::fs::remove_file(fixture.music.join("gone.wav")).unwrap();
    // A file that is new, not the deleted one moved.
    write_tone(&fixture.music.join("new.wav"), 24_000);
    run_scan(&fixture, false);
    run_scan(&fixture, false);

    let directories = directories::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!(
        (directories[0].track_count, directories[0].missing_count),
        (2, 1)
    );
    assert_eq!(files(&fixture)[0].1, "missing", "gone.wav sorts first");

    let deleted = directories::delete_missing(&fixture.database).unwrap();

    assert_eq!(deleted, 1);
    let directories = directories::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!(
        (directories[0].track_count, directories[0].missing_count),
        (2, 0)
    );
    assert!(fixture.music.join("keep.wav").exists(), "source files stay");
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 2);
}

#[test]
fn an_unchanged_file_is_told_from_a_changed_one_by_size_as_well_as_time() {
    let fixture = fixture();
    let path = fixture.music.join("a.wav");
    write_tone(&path, 8_000);
    run_scan(&fixture, false);
    fixture
        .database
        .write()
        .unwrap()
        .execute("UPDATE library_files SET byte_length = byte_length + 1", [])
        .unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.inspected_count, 1, "a different size is a change");
    assert!(
        count(&fixture, "SELECT byte_length FROM library_files") > 16_000,
        "the size is recorded"
    );
}

#[test]
fn a_scan_that_follows_a_change_walks_only_that_directory() {
    let fixture = fixture();
    for album in ["A", "B", "C"] {
        std::fs::create_dir_all(fixture.music.join(album)).unwrap();
        for index in 0..3 {
            write_tone(
                &fixture.music.join(album).join(format!("{index}.wav")),
                800 + index * 10,
            );
        }
    }
    run_scan(&fixture, false);
    write_tone(&fixture.music.join("B").join("new.wav"), 4_000);
    std::fs::remove_file(fixture.music.join("C").join("0.wav")).unwrap();

    let scan = run_scan_of(&fixture, &[fixture.music.join("B").join("new.wav")]);

    assert_eq!(scan.state, ScanStatus::Completed);
    assert_eq!(scan.discovered_count, 4, "B's four files, nothing else");
    assert_eq!(scan.inspected_count, 1);
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM library_files WHERE availability = 'missing'"
        ),
        0,
        "C was out of scope, so its deleted file is not noticed yet"
    );

    let scan = run_scan_of(&fixture, &[fixture.music.join("C").join("0.wav")]);

    assert_eq!(scan.discovered_count, 2, "the vanished file's directory");
    assert_eq!(
        count(
            &fixture,
            "SELECT COUNT(*) FROM library_files WHERE availability = 'missing'"
        ),
        1
    );
}

#[test]
fn a_removed_directory_is_found_through_its_nearest_existing_parent() {
    let fixture = fixture();
    std::fs::create_dir_all(fixture.music.join("A").join("Gone")).unwrap();
    write_tone(&fixture.music.join("A").join("Gone").join("1.wav"), 800);
    write_tone(&fixture.music.join("A").join("kept.wav"), 1_600);
    run_scan(&fixture, false);
    let gone = fixture.music.join("A").join("Gone");
    std::fs::remove_dir_all(&gone).unwrap();

    run_scan_of(&fixture, &[gone]);

    let directories = directories::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!(
        (directories[0].track_count, directories[0].missing_count),
        (1, 1)
    );
}

#[test]
fn every_scan_end_advances_the_library_version() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);

    let first = run_scan(&fixture, false);
    let second = run_scan(&fixture, false);
    let cancelled = run_scan(&fixture, true);

    assert_eq!(
        (
            first.library_version,
            second.library_version,
            cancelled.library_version
        ),
        (1, 2, 3),
        "a scan that ends, however it ends, is a change the lists must see"
    );
}

/// Tags the WAV at `path` the way a music player would.
fn tag(path: &Path, fields: &[(lofty::tag::ItemKey, &str)]) {
    use lofty::config::WriteOptions;
    use lofty::tag::{Tag, TagExt, TagType};
    let mut tag = Tag::new(TagType::Id3v2);
    for (key, value) in fields {
        assert!(tag.insert_text(*key, (*value).to_owned()));
    }
    tag.save_to_path(path, WriteOptions::default())
        .expect("tag written");
}

pub(super) fn tagged_tone(path: &Path, samples: usize, fields: &[(lofty::tag::ItemKey, &str)]) {
    write_tone(path, samples);
    tag(path, fields);
}

fn albums(fixture: &Fixture) -> Vec<(String, String, String, i64)> {
    let connection = fixture.database.read().unwrap();
    let mut statement = connection
        .prepare(
            "SELECT album_artist, title, album_directory, track_count FROM albums
             ORDER BY album_directory, album_artist",
        )
        .unwrap();

    statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

#[test]
fn tracks_of_one_directory_and_album_with_different_artists_are_a_compilation() {
    use lofty::tag::ItemKey::{AlbumTitle, TrackArtist, TrackTitle};
    let fixture = fixture();
    for (directory, files) in [
        ("Hits", vec![("1", "A"), ("2", "B"), ("3", "C")]),
        ("Solo", vec![("1", "X"), ("2", "X")]),
        ("Solo Remaster", vec![("1", "X")]),
        ("Multi/CD1", vec![("1", "Y")]),
        ("Multi/CD2", vec![("1", "Y")]),
    ] {
        std::fs::create_dir_all(fixture.music.join(directory)).unwrap();
        for (index, (number, artist)) in files.into_iter().enumerate() {
            let album = match directory {
                "Hits" => "Hits",
                "Solo" | "Solo Remaster" => "Record",
                _ => "Double",
            };
            tagged_tone(
                &fixture.music.join(directory).join(format!("{number}.wav")),
                800 + index * 40 + directory.len(),
                &[
                    (TrackTitle, &format!("{directory} {number}")),
                    (TrackArtist, artist),
                    (AlbumTitle, album),
                ],
            );
        }
    }

    run_scan(&fixture, false);

    assert_eq!(
        albums(&fixture),
        vec![
            ("Various Artists".into(), "Hits".into(), "1/Hits".into(), 3),
            ("Y".into(), "Double".into(), "1/Multi".into(), 2),
            ("X".into(), "Record".into(), "1/Solo".into(), 2),
            ("X".into(), "Record".into(), "1/Solo Remaster".into(), 1),
        ],
        "one compilation, one two-disc album, and two printings of the same title and artist"
    );
    let artists: Vec<String> = fixture
        .database
        .read()
        .unwrap()
        .prepare("SELECT name FROM artists ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(artists, ["Various Artists", "X", "Y"]);

    // Take the third artist away: the others are one artist's album again, and the album under
    // Various Artists is gone.
    std::fs::remove_file(fixture.music.join("Hits").join("3.wav")).unwrap();
    std::fs::remove_file(fixture.music.join("Hits").join("2.wav")).unwrap();
    run_scan(&fixture, false);
    directories::delete_missing(&fixture.database).unwrap();
    let after = albums(&fixture);
    assert_eq!(after[0], ("A".into(), "Hits".into(), "1/Hits".into(), 1));
}

#[test]
fn sort_order_tags_win_over_derived_sort_keys() {
    use lofty::tag::ItemKey::{TrackTitle, TrackTitleSortOrder};
    let fixture = fixture();
    tagged_tone(
        &fixture.music.join("a.wav"),
        800,
        &[
            (TrackTitle, "The Apple"),
            (TrackTitleSortOrder, "Apple, The"),
        ],
    );
    tagged_tone(
        &fixture.music.join("b.wav"),
        1_600,
        &[(TrackTitle, "Banana")],
    );
    tagged_tone(&fixture.music.join("c.wav"), 2_400, &[(TrackTitle, "ユズ")]);
    run_scan(&fixture, false);

    let keys: Vec<(String, String)> = fixture
        .database
        .read()
        .unwrap()
        .prepare("SELECT title, title_sort FROM track_source_metadata ORDER BY title_sort")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();

    assert_eq!(
        keys,
        [
            ("The Apple".to_owned(), "apple, the".to_owned()),
            ("Banana".to_owned(), "banana".to_owned()),
            ("ユズ".to_owned(), "ゆず".to_owned()),
        ]
    );
}
