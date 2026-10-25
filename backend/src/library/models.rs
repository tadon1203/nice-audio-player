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
    pub file_format: Option<String>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u64>,
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
    pub state: TrackState,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackPage {
    pub items: Vec<TrackRow>,
    /// How many rows the whole list has; only the first page (no cursor) says.
    pub total_count: Option<u64>,
    pub next_cursor: Option<String>,
}
/// One entry of a list's scroll index: the label its names are filed under, and how many there
/// are. Buckets come in the list's own order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScrollIndexBucket {
    pub label: String,
    pub count: u64,
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
pub struct LibraryAlbumPage {
    pub items: Vec<AlbumRow>,
    /// How many rows the whole list has; only the first page (no cursor) says.
    pub total_count: Option<u64>,
    pub next_cursor: Option<String>,
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
/// How the Tracks list is filtered and sorted.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackQuery {
    pub search: Option<String>,
    pub sort_key: TrackSortKey,
    pub sort_direction: SortDirection,
}
/// How the Albums list is filtered and sorted.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumQuery {
    pub search: Option<String>,
    pub sort_key: AlbumSortKey,
    pub sort_direction: SortDirection,
}
/// How the Album Artists list is filtered and sorted.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumArtistQuery {
    pub search: Option<String>,
    pub sort_key: ArtistSortKey,
    pub sort_direction: SortDirection,
}
/// A page of the Tracks list. With no `cursor` it starts after the first `skip` rows, which is
/// how the scroll index jumps to a letter without paging through what precedes it.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TrackListRequest {
    #[serde(flatten)]
    pub query: TrackQuery,
    pub cursor: Option<String>,
    pub skip: u64,
}
/// A page of the Albums list (see [`TrackListRequest`]).
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumListRequest {
    #[serde(flatten)]
    pub query: AlbumQuery,
    pub cursor: Option<String>,
    pub skip: u64,
}
/// A page of the Album Artists list (see [`TrackListRequest`]).
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumArtistListRequest {
    #[serde(flatten)]
    pub query: AlbumArtistQuery,
    pub cursor: Option<String>,
    pub skip: u64,
}
/// The albums of one Album Artist, by its ID (see `ids.rs`).
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAlbumsRequest {
    pub artist_id: ArtistId,
    pub cursor: Option<String>,
    pub sort_key: ArtistAlbumSortKey,
    pub sort_direction: SortDirection,
}
/// The tracks of one album, by its ID (see `ids.rs`), from a page cursor.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTracksRequest {
    pub album_id: AlbumId,
    pub cursor: Option<String>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumArtistPage {
    pub items: Vec<ArtistRow>,
    /// How many rows the whole list has; only the first page (no cursor) says.
    pub total_count: Option<u64>,
    pub next_cursor: Option<String>,
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
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumTrackPage {
    pub items: Vec<AlbumTrackRow>,
    /// How many rows the whole list has; only the first page (no cursor) says.
    pub total_count: Option<u64>,
    pub next_cursor: Option<String>,
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
            finished_count: 0,
            changed_count: 0,
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
    /// How many scans have ended since the app started. Only ever grows, so a listener that saw
    /// the count change knows a scan ended, however many snapshots it missed in between.
    pub finished_count: u64,
    /// How many files scans have added, changed, relinked, or found Missing or back since the app
    /// started. Only ever grows: a listener that sees it move since it last looked knows the
    /// catalog changed, and one that does not knows it did not.
    pub changed_count: u64,
}
