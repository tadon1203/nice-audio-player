use serde::Deserialize;
use serde::Serialize;
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryUnavailableReason {
    DatabaseOpenFailed,
    MigrationFailed,
    SchemaTooNew,
    DatabaseCorrupt,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LibraryStatus {
    Ready,
    Unavailable { reason: LibraryUnavailableReason },
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    pub scan_generation: u64,
    pub last_successful_scan_at_ms: Option<u64>,
    /// Tracks whose file is there.
    pub track_count: u64,
    /// Tracks whose file is gone (see **Missing** in CONTEXT.md).
    pub missing_count: u64,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryFileAvailability {
    Available,
    Missing,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySortDirection {
    Ascending,
    Descending,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryAlbumSortKey {
    Title,
    Artist,
    Year,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryAlbumArtistSortKey {
    Artist,
    AlbumCount,
    TrackCount,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryArtistAlbumSortKey {
    Year,
    Title,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryTrackSortKey {
    Title,
    Artist,
    Album,
    Duration,
}
pub use super::artwork::ArtworkRef;
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackSummary {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    /// The key the catalog files the track's album under, `None` for a track with no album tag.
    pub album_key: Option<LibraryAlbumKey>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u64>,
    pub availability: LibraryFileAvailability,
    pub playable: bool,
}
/// The tags, audio format and location of one track, as the Properties view lists them.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackProperties {
    pub id: String,
    pub path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub genre: Option<String>,
    pub date: Option<String>,
    pub duration_ms: Option<u64>,
    pub file_format: Option<String>,
    pub codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub channel_count: Option<u32>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u32>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackPage {
    pub items: Vec<LibraryTrackSummary>,
    pub total_count: u64,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, specta::Type, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumKey {
    pub title: String,
    pub album_artist: String,
}
#[derive(Debug, Clone, Serialize, specta::Type, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumArtistKey {
    pub name: String,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumSummary {
    pub key: LibraryAlbumKey,
    pub artwork: Option<ArtworkRef>,
    pub year: Option<i32>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumPage {
    pub items: Vec<LibraryAlbumSummary>,
    pub total_count: u64,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumArtistSummary {
    pub key: LibraryAlbumArtistKey,
    pub artwork: Option<ArtworkRef>,
    pub album_count: u64,
    pub track_count: u64,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumArtistPage {
    pub items: Vec<LibraryAlbumArtistSummary>,
    pub total_count: u64,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumDetails {
    pub summary: LibraryAlbumSummary,
    pub date: Option<String>,
    pub track_count: u64,
    pub duration_ms: Option<u64>,
    pub first_playable_track_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumTrackSummary {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub sample_rate: Option<u32>,
    pub duration_ms: Option<u64>,
    pub availability: LibraryFileAvailability,
    pub playable: bool,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumTrackPage {
    pub items: Vec<LibraryAlbumTrackSummary>,
    pub total_count: u64,
    pub next_cursor: Option<String>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryScanState {
    Idle,
    Running,
    Completed,
    Cancelled,
    Failed,
}
impl LibraryScanSnapshot {
    pub fn idle() -> Self {
        Self {
            state: LibraryScanState::Idle,
            current_root: None,
            expected_count: 0,
            discovered_count: 0,
            inspected_count: 0,
            indexed_count: 0,
            failed_count: 0,
            failure_code: None,
        }
    }
}

/// Why a scan stopped without finishing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScanFailure {
    PersistenceFailed,
    RootTraversalFailed,
    /// The scan thread died unexpectedly.
    Panicked,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanSnapshot {
    pub state: LibraryScanState,
    pub current_root: Option<LibraryRoot>,
    /// How many files the previous scans left in the scanned folders: what a rescan can expect
    /// to find, so its progress can be shown as a share. 0 when there is no such history.
    pub expected_count: u64,
    pub discovered_count: u64,
    pub inspected_count: u64,
    pub indexed_count: u64,
    pub failed_count: u64,
    pub failure_code: Option<ScanFailure>,
}
