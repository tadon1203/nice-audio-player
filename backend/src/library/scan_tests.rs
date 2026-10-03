//! End-to-end scans of real (tiny) audio files against a real database.

use super::database::Database;
use super::models::{LibraryScanSnapshot, LibraryScanState, ScanFailure};
use super::roots;
use crate::events::{null_event_sink, BackendEvent, Notifier};
use crate::test_support::{write_pcm_i16_wav, TestDirectory};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    database: Database,
}

fn notifier() -> Notifier {
    Notifier::new(null_event_sink(), BackendEvent::LibraryScanChanged)
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let data = directory.file("data");
    let database = Database::initialize(&data).expect("database");
    roots::register(&database, &music.to_string_lossy()).expect("register root");
    Fixture {
        _directory: directory,
        music,
        database,
    }
}

fn write_tone(path: &Path, samples: usize) {
    write_pcm_i16_wav(path, 8_000, 1, &vec![1_000i16; samples]);
}

fn run_scan(fixture: &Fixture, cancelled: bool) -> LibraryScanSnapshot {
    run_jobs(fixture, cancelled, None)
}

/// A scan that follows changes: only the directories holding `changed` paths are walked.
fn run_scan_of(fixture: &Fixture, changed: &[PathBuf]) -> LibraryScanSnapshot {
    run_jobs(fixture, false, Some(changed.to_vec()))
}

fn run_jobs(fixture: &Fixture, cancelled: bool, dirs: Option<Vec<PathBuf>>) -> LibraryScanSnapshot {
    let roots = roots::list(&fixture.database.read().unwrap()).expect("roots");
    let jobs = roots
        .into_iter()
        .map(|root| super::scanner::ScanJob {
            root,
            dirs: dirs.clone(),
        })
        .collect();
    let state = Arc::new(Mutex::new(LibraryScanSnapshot {
        state: LibraryScanState::Running,
        ..LibraryScanSnapshot::idle()
    }));
    super::scanner::run(
        fixture.database.clone(),
        jobs,
        Arc::clone(&state),
        Arc::new(AtomicBool::new(cancelled)),
        notifier(),
    );
    let snapshot = state.lock().unwrap().clone();
    snapshot
}

fn files(fixture: &Fixture) -> Vec<(String, String, String, i64)> {
    let c = fixture.database.read().unwrap();
    let mut statement = c
        .prepare("SELECT relative_path,availability,inspection_status,source_revision FROM library_files ORDER BY relative_path")
        .unwrap();
    let rows = statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    rows
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

    assert_eq!(scan.state, LibraryScanState::Completed);
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
fn files_in_subfolders_keep_their_relative_path() {
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

    assert_eq!(second.state, LibraryScanState::Completed);
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

    assert_eq!(second.state, LibraryScanState::Completed);
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

    assert_eq!(scan.state, LibraryScanState::Completed);
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

    assert_eq!(scan.state, LibraryScanState::Cancelled);
    assert!(files(&fixture).is_empty());
}

#[test]
fn a_scan_covers_more_files_than_fit_in_one_batch() {
    let fixture = fixture();
    for index in 0..230 {
        write_tone(&fixture.music.join(format!("{index:03}.wav")), 160);
    }

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, LibraryScanState::Completed);
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
fn an_unreadable_root_fails_the_scan_but_keeps_other_roots_files_available() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);
    run_scan(&fixture, false);
    std::fs::remove_dir_all(&fixture.music).unwrap();

    let scan = run_scan(&fixture, false);

    assert_eq!(scan.state, LibraryScanState::Failed);
    assert_eq!(scan.failure_code, Some(ScanFailure::RootTraversalFailed));
    assert_eq!(
        files(&fixture)[0].1,
        "available",
        "an unreadable root is not a deleted library"
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
            "SELECT title_key, artist_key, album_key, album_artist_key, year FROM track_source_metadata",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
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

    assert_eq!(scan.state, LibraryScanState::Completed);
    assert_eq!(files(&fixture)[0].2, "unsupported");
    assert_eq!(count(&fixture, "SELECT COUNT(*) FROM tracks"), 1);
    assert_eq!(
        count(&fixture, "SELECT COUNT(*) FROM track_source_metadata WHERE duration_ms IS NULL AND source_revision = 2"),
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

    assert_eq!(scan.state, LibraryScanState::Completed);
    assert_eq!(scan.discovered_count, 7);
    assert_eq!(scan.inspected_count, 7);
    assert!(scan.indexed_count >= 2, "the good files are indexed");
}

#[test]
fn a_folder_holding_the_data_directory_cannot_be_registered() {
    let fixture = fixture();
    let parent = fixture.music.parent().unwrap();

    let refused = roots::register(&fixture.database, &parent.to_string_lossy());

    assert!(matches!(
        refused,
        Err(super::error::LibraryCommandError::RootContainsDataDirectory)
    ));
}

fn track_ids_by_path(fixture: &Fixture) -> Vec<(String, i64)> {
    let c = fixture.database.read().unwrap();
    let mut statement = c
        .prepare("SELECT f.relative_path, t.id FROM tracks t JOIN library_files f ON f.id = t.file_id ORDER BY f.relative_path")
        .unwrap();
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    rows
}

#[test]
fn a_moved_folder_and_a_renamed_file_keep_their_tracks_and_leave_nothing_missing() {
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

    assert_eq!(scan.state, LibraryScanState::Completed);
    let after = track_ids_by_path(&fixture);
    assert_eq!(after.len(), 3, "no duplicates: {after:?}");
    assert_eq!(id_of(&after, "New/one.wav"), id_of(&before, "Old/one.wav"));
    assert_eq!(id_of(&after, "New/two.wav"), id_of(&before, "Old/two.wav"));
    assert_eq!(id_of(&after, "renamed.wav"), id_of(&before, "loose.wav"));
    // A queue entry holds the track id: it now resolves to the file's new place.
    let store = super::store::LibraryStore::new(fixture.database.clone());
    let queued = id_of(&before, "Old/one.wav").unwrap().to_string();
    let location = store.track_location(&queued).unwrap().existing().unwrap();
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

    let roots = roots::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!((roots[0].track_count, roots[0].missing_count), (2, 1));
    assert_eq!(files(&fixture)[0].1, "missing", "gone.wav sorts first");

    let deleted = roots::delete_missing(&fixture.database).unwrap();

    assert_eq!(deleted, 1);
    let roots = roots::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!((roots[0].track_count, roots[0].missing_count), (2, 0));
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

    assert_eq!(scan.state, LibraryScanState::Completed);
    assert_eq!(scan.discovered_count, 4, "B's four files, nothing else");
    assert_eq!((scan.inspected_count, scan.changed_count), (1, 1));
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
    assert_eq!(scan.changed_count, 1);
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

    let roots = roots::list(&fixture.database.read().unwrap()).unwrap();
    assert_eq!((roots[0].track_count, roots[0].missing_count), (1, 1));
}

#[test]
fn a_scan_reports_whether_it_changed_anything_and_every_end_is_counted() {
    let fixture = fixture();
    write_tone(&fixture.music.join("a.wav"), 8_000);

    let first = run_scan(&fixture, false);
    let second = run_scan(&fixture, false);
    write_tone(&fixture.music.join("b.wav"), 16_000);
    let third = run_scan(&fixture, false);

    assert_eq!(first.changed_count, 1);
    assert_eq!(
        second.changed_count, 0,
        "nothing changed, nothing to refetch"
    );
    assert_eq!(third.changed_count, 1);
    assert_eq!(
        (first.finished_count, second.finished_count),
        (1, 1),
        "each scan here starts from its own snapshot"
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

fn tagged_tone(path: &Path, samples: usize, fields: &[(lofty::tag::ItemKey, &str)]) {
    write_tone(path, samples);
    tag(path, fields);
}

fn albums(fixture: &Fixture) -> Vec<(String, String, String, i64)> {
    let connection = fixture.database.read().unwrap();
    let mut statement = connection
        .prepare(
            "SELECT album_artist_key, album_key, album_dir, track_count FROM albums
             ORDER BY album_dir, album_artist_key",
        )
        .unwrap();
    let rows = statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    rows
}

#[test]
fn tracks_of_one_folder_and_album_with_different_artists_are_a_compilation() {
    use lofty::tag::ItemKey::{AlbumTitle, TrackArtist, TrackTitle};
    let fixture = fixture();
    for (folder, files) in [
        ("Hits", vec![("1", "A"), ("2", "B"), ("3", "C")]),
        ("Solo", vec![("1", "X"), ("2", "X")]),
        ("Solo Remaster", vec![("1", "X")]),
        ("Multi/CD1", vec![("1", "Y")]),
        ("Multi/CD2", vec![("1", "Y")]),
    ] {
        std::fs::create_dir_all(fixture.music.join(folder)).unwrap();
        for (index, (number, artist)) in files.into_iter().enumerate() {
            let album = match folder {
                "Hits" => "Hits",
                "Solo" | "Solo Remaster" => "Record",
                _ => "Double",
            };
            tagged_tone(
                &fixture.music.join(folder).join(format!("{number}.wav")),
                800 + index * 40 + folder.len(),
                &[
                    (TrackTitle, &format!("{folder} {number}")),
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
        .prepare("SELECT name FROM album_artists ORDER BY name")
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
    roots::delete_missing(&fixture.database).unwrap();
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
        .prepare("SELECT title_key, title_sort FROM track_source_metadata ORDER BY title_sort")
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
