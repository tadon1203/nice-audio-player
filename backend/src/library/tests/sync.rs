//! The Library keeping itself in step with the disk, through the handle the commands use: a
//! change in a registered directory is picked up while idle, and a failed scan is reported until a
//! scan succeeds.

use crate::library::Library;
use crate::library::read::lists::{ListRequest, SortDirection};
use crate::library::read::tracks::TrackSortKey;
use crate::library::storage::Database;
use crate::library::sync::state::ScanStatus;
use crate::test_support::CommandCode;
use crate::test_support::{MessageLog, TestDirectory, wait_until, write_pcm_i16_wav};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const SETTLE: Duration = Duration::from_secs(10);

struct Harness {
    directory: TestDirectory,
    music: PathBuf,
    library: Library,
    /// What the Library sends the Host.
    host: Arc<MessageLog>,
}

fn harness() -> Harness {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let (host, sender) = MessageLog::shared();
    let library = Library::open(&directory.file("data"), sender).expect("open library");
    library
        .add_directory(music.clone())
        .expect("register directory");
    Harness {
        directory,
        music,
        library,
        host,
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
        let database = Database::open(&self.directory.file("data")).expect("database");
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
        self.host
            .library()
            .expect("the Library sends its state")
            .scan
            .status
    }

    /// Waits until a scan of the directory has completed. A file written just after registration
    /// may start a second one, so this does not count the scans.
    fn wait_for_first_scan(&self) {
        assert!(
            wait_until(
                || self.scans_done() >= 1 && self.scan_state() == ScanStatus::Completed,
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
fn a_disabled_directory_is_not_scanned() {
    let harness = harness();
    harness.wait_for_first_scan();
    let id = harness.library.directories().expect("directories")[0].id;
    harness
        .library
        .set_directory_enabled(id, false)
        .expect("disabled");
    let scans = harness.scans_done();

    write_tone(&harness.music.join("a.wav"));
    std::thread::sleep(Duration::from_millis(1_500));

    assert_eq!(
        harness.scans_done(),
        scans,
        "no scan of a disabled directory"
    );
    assert_eq!(harness.track_count(), 0);
}

#[test]
fn a_manual_scan_while_one_runs_is_refused() {
    let harness = harness();
    harness.wait_for_first_scan();
    for index in 0..600 {
        write_tone(&harness.music.join(format!("{index:03}.wav")));
    }
    assert!(
        wait_until(|| harness.scan_state() == ScanStatus::Running, SETTLE),
        "the changes start a scan"
    );

    assert_eq!(
        harness.library.start_scan().code_of(),
        None,
        "a scan that runs has nothing to start"
    );
}

#[test]
fn a_change_during_a_scan_is_scanned_after_it() {
    let harness = harness();
    harness.wait_for_first_scan();
    for index in 0..600 {
        write_tone(&harness.music.join(format!("{index:03}.wav")));
    }
    assert!(
        wait_until(|| harness.scan_state() == ScanStatus::Running, SETTLE),
        "the changes start a scan"
    );

    write_tone(&harness.music.join("late.wav"));

    assert!(
        wait_until(|| harness.track_count() == 601, SETTLE),
        "the change made during the scan is indexed once it ends"
    );
}

#[test]
fn removing_a_directory_drops_its_tracks() {
    let harness = harness();
    write_tone(&harness.music.join("a.wav"));
    assert!(
        wait_until(|| harness.track_count() == 1, SETTLE),
        "the file is scanned"
    );
    let id = harness.library.directories().expect("directories")[0].id;

    assert!(
        wait_until(|| harness.library.remove_directory(id).is_ok(), SETTLE),
        "a directory can be removed once no scan is running"
    );

    assert_eq!(harness.track_count(), 0);
    assert_eq!(harness.library.directories().expect("directories"), []);
}

#[test]
fn a_finished_scan_publishes_the_directory_counts_it_found() {
    let harness = harness();
    write_tone(&harness.music.join("a.wav"));

    assert!(
        wait_until(
            || {
                let state = harness.host.library().expect("the Library sends its state");
                state.scan.status == ScanStatus::Completed
                    && state
                        .directories
                        .first()
                        .is_some_and(|directory| directory.track_count == 1)
            },
            SETTLE
        ),
        "the published state carries the scan's end and the fresh track count"
    );
}

#[test]
fn each_directory_change_publishes_the_library_state_with_a_higher_version() {
    let harness = harness();
    let added = harness.host.library().expect("the Library sends its state");
    assert_eq!(
        added.directories.len(),
        1,
        "the registered directory is published"
    );
    assert!(added.version > 0);
    let id = added.directories[0].id;

    assert!(
        wait_until(
            || harness.library.set_directory_enabled(id, false).is_ok(),
            SETTLE
        ),
        "a directory can be disabled once no scan is running"
    );
    let disabled = harness.host.library().expect("the Library sends its state");
    assert!(!disabled.directories[0].enabled);
    assert!(disabled.version > added.version);

    assert!(
        wait_until(|| harness.library.remove_directory(id).is_ok(), SETTLE),
        "a directory can be removed once no scan is running"
    );
    let removed = harness.host.library().expect("the Library sends its state");
    assert_eq!(removed.directories, []);
    assert!(removed.version > disabled.version);
}
