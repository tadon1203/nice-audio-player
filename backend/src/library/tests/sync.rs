//! The Library keeping itself in step with the disk, through the handle the commands use: a
//! change in a registered directory is picked up while idle, and a failed scan is reported until a
//! scan succeeds.

use crate::library::Library;
use crate::library::database::Database;
use crate::library::models::{ListRequest, ScanStatus, SortDirection, TrackSortKey};
use crate::state_store::StateStore;
use crate::test_support::{
    TestDirectory, null_notifier, state_store_for_tests, wait_until, write_pcm_i16_wav,
};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const SETTLE: Duration = Duration::from_secs(10);

struct Harness {
    directory: TestDirectory,
    music: PathBuf,
    library: Library,
    state_store: Arc<StateStore>,
}

fn harness() -> Harness {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let state_store = state_store_for_tests(null_notifier());
    let library =
        Library::open(&directory.file("data"), Arc::clone(&state_store)).expect("open library");
    library
        .add_directory(music.clone())
        .expect("register directory");
    Harness {
        directory,
        music,
        library,
        state_store,
    }
}

fn write_tone(path: &Path) {
    write_pcm_i16_wav(path, 8_000, 1, &[1_000i16; 800]);
}

impl Harness {
    fn track_count(&self) -> u64 {
        self.library
            .list_tracks(&ListRequest {
                search: None,
                sort: TrackSortKey::Title,
                direction: SortDirection::Ascending,
                offset: 0,
                limit: 1,
            })
            .map_or(0, |page| u64::from(page.total))
    }

    /// How many scans have covered the directory: each one bumps its generation in the database.
    fn scans_done(&self) -> i64 {
        let database = Database::initialize(&self.directory.file("data")).expect("database");
        let connection = database.read().unwrap();
        connection
            .query_row(
                "SELECT scan_generation FROM directories WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn scan_state(&self) -> ScanStatus {
        self.state_store.scan().value.state
    }

    fn wait_for_first_scan(&self) {
        assert!(
            wait_until(
                || self.scans_done() == 1 && self.scan_state() == ScanStatus::Completed,
                SETTLE
            ),
            "registering a directory scans it"
        );
    }

    /// Starts a scan by hand, waiting out an automatic one that is already running.
    fn scan_by_hand(&self) {
        assert!(
            wait_until(|| self.library.start_scan().is_ok(), SETTLE),
            "a scan can be started"
        );
    }
}

#[test]
fn a_file_added_while_idle_is_picked_up() {
    let harness = harness();
    harness.wait_for_first_scan();

    write_tone(&harness.music.join("a.wav"));

    assert!(
        wait_until(|| harness.track_count() == 1, SETTLE),
        "the Library follows the directory without a manual scan"
    );
}

#[test]
fn a_burst_of_changes_starts_one_scan() {
    let harness = harness();
    harness.wait_for_first_scan();

    for index in 0..6 {
        write_tone(&harness.music.join(format!("{index}.wav")));
        std::thread::sleep(Duration::from_millis(20));
    }

    assert!(wait_until(|| harness.track_count() == 6, SETTLE));
    std::thread::sleep(Duration::from_millis(1_500));
    assert_eq!(
        harness.scans_done(),
        2,
        "the first scan and one for the burst"
    );
}

#[test]
fn a_failed_scan_is_reported_until_a_scan_succeeds() {
    let harness = harness();
    write_tone(&harness.music.join("a.wav"));
    harness.wait_for_first_scan();
    std::fs::remove_dir_all(&harness.music).unwrap();

    harness.scan_by_hand();
    assert!(
        wait_until(|| harness.scan_state() == ScanStatus::Failed, SETTLE),
        "an unreadable directory fails the scan"
    );
    for _ in 0..8 {
        assert_eq!(
            harness.scan_state(),
            ScanStatus::Failed,
            "the failure is still reported"
        );
        std::thread::sleep(Duration::from_millis(100));
    }

    std::fs::create_dir_all(&harness.music).unwrap();
    harness.scan_by_hand();
    assert!(
        wait_until(|| harness.scan_state() == ScanStatus::Completed, SETTLE),
        "the next successful scan completes"
    );
}

#[test]
fn removing_a_directory_drops_its_tracks() {
    let harness = harness();
    write_tone(&harness.music.join("a.wav"));
    harness.wait_for_first_scan();
    assert_eq!(harness.track_count(), 1);
    let id = harness.library.directories().expect("directories")[0].id;

    assert!(
        wait_until(|| harness.library.remove_directory(id).is_ok(), SETTLE),
        "a directory can be removed once no scan is running"
    );

    assert_eq!(harness.track_count(), 0);
    assert_eq!(harness.library.directories().expect("directories"), []);
}
