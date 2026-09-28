//! End-to-end scans of real (tiny) audio files against a real database.

use super::database::Database;
use super::models::{LibraryScanSnapshot, LibraryScanState};
use super::service::LibraryShared;
use crate::events::{null_event_sink, BackendEvent, Notifier};
use crate::test_support::{write_pcm_i16_wav, TestDirectory};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

struct Fixture {
    _directory: TestDirectory,
    music: PathBuf,
    library: LibraryShared,
}

fn notifier() -> Notifier {
    Notifier::new(null_event_sink(), BackendEvent::LibraryScanChanged)
}

fn fixture() -> Fixture {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let data = directory.file("data");
    let library = LibraryShared::initialize(data, notifier());
    library
        .register_root(music.to_string_lossy().into_owned())
        .expect("register root");
    Fixture {
        _directory: directory,
        music,
        library,
    }
}

fn write_tone(path: &Path, samples: usize) {
    write_pcm_i16_wav(path, 8_000, 1, &vec![1_000i16; samples]);
}

fn run_scan(fixture: &Fixture, cancelled: bool) -> LibraryScanSnapshot {
    let roots = fixture.library.roots().expect("roots");
    let state = Arc::new(Mutex::new(LibraryScanSnapshot {
        state: LibraryScanState::Running,
        current_root: None,
        discovered_count: 0,
        inspected_count: 0,
        indexed_count: 0,
        failed_count: 0,
        failure_code: None,
    }));
    let database: Database = fixture.library.db().expect("database").clone();
    super::scanner::run(
        database,
        roots,
        Arc::clone(&state),
        Arc::new(AtomicBool::new(cancelled)),
        notifier(),
    );
    let snapshot = state.lock().unwrap().clone();
    snapshot
}

fn files(fixture: &Fixture) -> Vec<(String, String, String, i64)> {
    let c = fixture.library.db().unwrap().read().unwrap();
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
    let c = fixture.library.db().unwrap().read().unwrap();
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
    run_scan(&fixture, false);

    let second = run_scan(&fixture, false);

    assert_eq!(second.state, LibraryScanState::Completed);
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
    assert_eq!(scan.failure_code.as_deref(), Some("rootTraversalFailed"));
    assert_eq!(
        files(&fixture)[0].1,
        "available",
        "an unreadable root is not a deleted library"
    );
}
