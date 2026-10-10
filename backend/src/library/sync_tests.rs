//! The Library keeping itself in step with the disk, through the handle the commands use: a
//! change in a registered folder is picked up while idle, and a failed scan is reported until a
//! scan succeeds.

use super::Library;
use crate::events::null_event_sink;
use crate::library::models::{LibraryScanState, LibrarySortDirection, LibraryTrackSortKey};
use crate::test_support::{write_pcm_i16_wav, TestDirectory};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const SETTLE: Duration = Duration::from_secs(10);

struct Harness {
    _directory: TestDirectory,
    music: PathBuf,
    library: Library,
}

fn harness() -> Harness {
    let directory = TestDirectory::new();
    let music = directory.file("music");
    std::fs::create_dir_all(&music).unwrap();
    let library = Library::open(directory.file("data"), null_event_sink()).expect("open library");
    library
        .register_root(music.to_string_lossy().into_owned())
        .expect("register root");
    Harness {
        _directory: directory,
        music,
        library,
    }
}

fn wait_until(timeout: Duration, mut condition: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    condition()
}

fn write_tone(path: &Path) {
    write_pcm_i16_wav(path, 8_000, 1, &[1_000i16; 800]);
}

impl Harness {
    fn track_count(&self) -> u64 {
        self.library
            .store()
            .catalog_tracks(
                None,
                None,
                LibraryTrackSortKey::Title,
                LibrarySortDirection::Ascending,
            )
            .map_or(0, |page| page.total_count.unwrap_or(0))
    }

    /// How many scans have covered the folder: each one bumps its generation.
    fn scans_done(&self) -> u64 {
        self.library.roots().expect("roots")[0].scan_generation
    }

    fn scan_state(&self) -> LibraryScanState {
        self.library.scan_state().state
    }

    fn wait_for_first_scan(&self) {
        assert!(
            wait_until(SETTLE, || self.scans_done() == 1
                && self.scan_state() == LibraryScanState::Completed),
            "registering a folder scans it"
        );
    }

    /// Starts a scan by hand, waiting out an automatic one that is already running.
    fn scan_by_hand(&self) {
        assert!(
            wait_until(SETTLE, || self.library.start_scan().is_ok()),
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
        wait_until(SETTLE, || harness.track_count() == 1),
        "the Library follows the folder without a manual scan"
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

    assert!(wait_until(SETTLE, || harness.track_count() == 6));
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
        wait_until(SETTLE, || harness.scan_state() == LibraryScanState::Failed),
        "an unreadable folder fails the scan"
    );
    for _ in 0..8 {
        assert_eq!(
            harness.scan_state(),
            LibraryScanState::Failed,
            "the failure is still reported"
        );
        std::thread::sleep(Duration::from_millis(100));
    }

    std::fs::create_dir_all(&harness.music).unwrap();
    harness.scan_by_hand();
    assert!(
        wait_until(SETTLE, || harness.scan_state()
            == LibraryScanState::Completed),
        "the next successful scan completes"
    );
}

#[test]
fn removing_a_folder_drops_its_tracks() {
    let harness = harness();
    write_tone(&harness.music.join("a.wav"));
    harness.wait_for_first_scan();
    assert_eq!(harness.track_count(), 1);
    let id = harness.library.roots().expect("roots")[0].id.clone();

    assert!(
        wait_until(SETTLE, || harness.library.remove_root(id.clone()).is_ok()),
        "a folder can be removed once no scan is running"
    );

    assert_eq!(harness.track_count(), 0);
    assert!(harness.library.roots().expect("roots").is_empty());
}
