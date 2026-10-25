use crate::ids::{AlbumId, ArtistId, DirectoryId, TrackId};
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
/// The loaded track as the Renderer sees it. No file path: the playback worker holds the file. It
/// has no state: only a playable track is ever loaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingTrack {
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
            state: ScanStatus::Idle,
            current_directory: None,
            expected_count: 0,
            discovered_count: 0,
            inspected_count: 0,
            indexed_count: 0,
            failed_count: 0,
            failure_code: None,
            library_version: 0,
        }
    }
}

/// Why a scan stopped without finishing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ScanFailure {
    PersistenceFailed,
    DirectoryTraversalFailed,
    /// The scan thread died unexpectedly.
    Panicked,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanState {
    pub state: ScanStatus,
    pub current_directory: Option<LibraryDirectory>,
    /// How many files the previous scans left in the scanned directories: what a rescan can expect
    /// to find, so its progress can be shown as a share. 0 when there is no such history.
    pub expected_count: u64,
    pub discovered_count: u64,
    pub inspected_count: u64,
    pub indexed_count: u64,
    pub failed_count: u64,
    pub failure_code: Option<ScanFailure>,
    /// The Library version (see `Library::version`). It changes whenever a scan ends, so a
    /// listener that sees it move knows the lists may have changed.
    pub library_version: u64,
}
