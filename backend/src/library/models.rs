use crate::ids::{AlbumId, ArtistId, DirectoryId, TrackId};
use crate::library::LibraryStatus;
use serde::Deserialize;
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
/// Where a track stands: its file can play, its file is gone, or its file is there but cannot be
/// decoded. Missing wins over unsupported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TrackState {
    Playable,
    Missing,
    Unsupported,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Ascending,
    Descending,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AlbumSortKey {
    Title,
    Artist,
    Year,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtistSortKey {
    Artist,
    AlbumCount,
    TrackCount,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ArtistAlbumSortKey {
    Year,
    Title,
}
#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TrackSortKey {
    Title,
    Artist,
    Album,
    Duration,
}
/// One page of a list: which rows, how many the whole list has, and the Library version it was
/// read at. A page whose version differs from the first one's means the list changed under it.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: u32,
    pub version: u64,
}
/// A page request: the search (`None` when empty), the sort, and the window of rows.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListRequest<K> {
    pub search: Option<String>,
    pub sort: K,
    pub direction: SortDirection,
    pub offset: u32,
    pub limit: u32,
}
pub(crate) use super::artwork::ArtworkRef;
/// The album a track is filed under, by ID (see `ids.rs`) and as titled, with its Album Artist. A
/// track with no album tag has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackAlbum {
    pub id: AlbumId,
    pub title: String,
    pub artist: ArtistRef,
}
/// What the track DTOs share: the identity and the metadata a row shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackCore {
    pub id: TrackId,
    pub title: String,
    pub artist: Option<String>,
    pub duration_ms: Option<u64>,
    pub artwork: Option<ArtworkRef>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackRow {
    #[serde(flatten)]
    pub core: TrackCore,
    pub state: TrackState,
    /// `None` for a track with no album tag.
    pub album: Option<TrackAlbum>,
}
/// The tags, audio format and location of one track, as the Properties view lists them.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackProperties {
    pub id: TrackId,
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
/// What kind of label a letter index entry has. `Unknown` is the entry for the names with no
/// value to file them by, which comes last.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LetterIndexEntryKind {
    Letter,
    Kana,
    Kanji,
    Unknown,
}
/// One entry of a list's letter index: the label its names are filed under, the offset of its
/// first row in the list, and how many rows it has. Entries come in the list's own order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LetterIndexEntry {
    pub label: String,
    pub kind: LetterIndexEntryKind,
    pub start: u32,
    pub count: u32,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRef {
    pub id: ArtistId,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRow {
    pub id: AlbumId,
    pub title: String,
    pub album_artist: ArtistRef,
    pub artwork: Option<ArtworkRef>,
    pub year: Option<i32>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRow {
    pub id: ArtistId,
    pub name: String,
    pub artwork: Option<ArtworkRef>,
    pub album_count: u64,
    pub track_count: u64,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDetails {
    pub summary: AlbumRow,
    pub date: Option<String>,
    pub track_count: u64,
    pub duration_ms: Option<u64>,
    pub first_playable_track_id: Option<TrackId>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTrackRow {
    #[serde(flatten)]
    pub core: TrackCore,
    pub state: TrackState,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub sample_rate: Option<u32>,
}
/// The album of the loaded track: the album it is filed under and how many tracks the library
/// holds for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingAlbum {
    #[serde(flatten)]
    pub album: TrackAlbum,
    pub track_count: u32,
}
/// A track as the Renderer sees it: the loaded track, and each queue row. No file path: the playback
/// worker holds the file. It has no state: only a playable track is ever loaded or queued.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    #[serde(flatten)]
    pub core: TrackCore,
    pub album: Option<NowPlayingAlbum>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
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
