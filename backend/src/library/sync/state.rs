//! The state the Library pushes to the Renderer: its directories, its scan, and its version.

use crate::ids::DirectoryId;
use crate::library::LibraryStatus;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDirectory {
    pub id: DirectoryId,
    pub path: String,
    pub enabled: bool,
    pub last_successful_scan_at_ms: Option<u64>,
    /// Tracks whose file is there.
    pub track_count: u64,
    /// Tracks whose file is gone (see **Missing** in CONTEXT.md).
    pub missing_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScanStatus {
    Idle,
    Running,
    Completed,
    Cancelled,
    Failed,
}
impl ScanState {
    pub fn idle() -> Self {
        Self {
            status: ScanStatus::Idle,
            current_directory: None,
            expected_count: 0,
            progress: None,
            discovered_count: 0,
            inspected_count: 0,
            indexed_count: 0,
            failed_count: 0,
            failure: None,
        }
    }
}

/// Why a scan stopped without finishing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScanFailure {
    /// A directory could not be read.
    DirectoryUnreadable,
    /// The scan stopped on a database failure, or its thread died unexpectedly.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanState {
    pub status: ScanStatus,
    pub current_directory: Option<LibraryDirectory>,
    /// How many files the previous scans left in the scanned directories: what a rescan can expect
    /// to find, so its progress can be shown as a share. 0 when there is no such history.
    pub expected_count: u64,
    /// The share of the scan done, from 0 to 1. `None` while a first scan has no count to compare with.
    pub progress: Option<f32>,
    pub discovered_count: u64,
    pub inspected_count: u64,
    pub indexed_count: u64,
    pub failed_count: u64,
    pub failure: Option<ScanFailure>,
}

/// The whole Library state, pushed by the Library worker whenever any part changes.
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryState {
    pub status: LibraryStatus,
    /// The Library version (see `LibraryVersion`). It changes after every committed change that
    /// alters a list, so a list that was read at another version is read again.
    pub version: u64,
    pub directories: Vec<LibraryDirectory>,
    pub scan: ScanState,
}

impl LibraryState {
    /// A Library with no directories and an idle scan, at version 0.
    pub fn empty(status: LibraryStatus) -> Self {
        Self {
            status,
            version: 0,
            directories: Vec::new(),
            scan: ScanState::idle(),
        }
    }
}
