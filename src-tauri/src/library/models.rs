#![allow(dead_code)] // Public IPC models are introduced ahead of the library browser UI.
use crate::media::inspection::AudioCodec;
use serde::Serialize;
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryUnavailableReason {
    StorageUnavailable,
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
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryFileAvailability {
    Available,
    Missing,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryInspectionStatus {
    Pending,
    Indexed,
    Unsupported,
    Failed,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ArtworkMimeType {
    Jpeg,
    Png,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkRef {
    pub content_hash: String,
    pub mime_type: ArtworkMimeType,
    pub relative_path: String,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackSummary {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
    pub availability: LibraryFileAvailability,
    pub playable: bool,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackSourceMetadata {
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
    pub file_format: String,
    pub codec: AudioCodec,
    pub sample_rate: u32,
    pub channel_count: u16,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u64>,
    pub tag_status: String,
    pub artwork: Option<ArtworkRef>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackDetails {
    pub summary: LibraryTrackSummary,
    pub root_id: String,
    pub root_path: String,
    pub relative_path: String,
    pub file_name: String,
    pub extension: String,
    pub source_revision: u64,
    pub inspection_status: LibraryInspectionStatus,
    pub inspection_error: Option<String>,
    pub metadata: Option<LibraryTrackSourceMetadata>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrackPage {
    pub items: Vec<LibraryTrackSummary>,
    pub next_after_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumSummary {
    pub id: String,
    pub title: String,
    pub album_artist: String,
    pub artwork: Option<ArtworkRef>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumPage {
    pub items: Vec<LibraryAlbumSummary>,
    pub next_after_id: Option<String>,
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
    pub duration_ms: Option<u64>,
    pub availability: LibraryFileAvailability,
    pub playable: bool,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAlbumTrackPage {
    pub items: Vec<LibraryAlbumTrackSummary>,
    pub next_offset: Option<u32>,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryScanState {
    Idle,
    Running,
    Completed,
    Cancelled,
    Failed,
}
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanSnapshot {
    pub state: LibraryScanState,
    pub current_root: Option<LibraryRoot>,
    pub discovered_count: u64,
    pub inspected_count: u64,
    pub indexed_count: u64,
    pub failed_count: u64,
    pub failure_code: Option<String>,
}
