use std::sync::Arc;

use super::snapshot::PlaybackQueueItem;
use crate::library::models::LibraryAlbumKey;
use crate::{library::artwork::ArtworkRef, media::validation::ValidatedAudioFile};

/// What the library knows about the audio file itself, shown as the start of the signal path.
/// Anything it does not know stays `None`; the session falls back to the file's extension.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SourceFacts {
    pub format: Option<String>,
    pub bit_depth: Option<u32>,
    pub bitrate_kbps: Option<u32>,
}

/// What a caller supplies to play something. The queue assigns the queue item id.
///
/// `track_id` is `None` for files outside the library, which keeps room for "open with".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybackItemSeed {
    pub track_id: Option<String>,
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    pub album_key: Option<LibraryAlbumKey>,
    pub album_track_count: Option<u32>,
    pub source: SourceFacts,
}

impl PlaybackItemSeed {
    /// A file with no library identity, titled by its file name.
    pub fn from_file(file: ValidatedAudioFile) -> Self {
        Self {
            track_id: None,
            title: file.file_name.clone(),
            file,
            artist: None,
            album: None,
            album_artist: None,
            artwork: None,
            duration_ms: None,
            track_number: None,
            disc_number: None,
            year: None,
            album_key: None,
            album_track_count: None,
            source: SourceFacts::default(),
        }
    }
}

/// One entry of the playback queue and the identity of the loaded track.
///
/// Everything a listener-facing feature needs about "what is playing" lives here, so history,
/// system media controls, and the UI never have to look the track up again by path.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackItem {
    pub queue_item_id: String,
    pub track_id: Option<String>,
    pub file: ValidatedAudioFile,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
    /// From the library's metadata; `None` for a file outside it.
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<i32>,
    /// The catalog key of the album, for links; `None` when the file has no album.
    pub album_key: Option<LibraryAlbumKey>,
    /// Tracks the library holds for the album.
    pub album_track_count: Option<u32>,
    /// Kept for the session's signal path; the item itself stays free of file facts.
    #[serde(skip)]
    #[specta(skip)]
    pub(super) source: SourceFacts,
    /// How the queue panel shows this item, built once and shared by every snapshot.
    #[serde(skip)]
    #[specta(skip)]
    pub(super) queue_view: Arc<PlaybackQueueItem>,
}

impl PlaybackItem {
    pub(super) fn from_seed(queue_item_id: String, seed: PlaybackItemSeed) -> Self {
        let queue_view = Arc::new(PlaybackQueueItem {
            id: queue_item_id.clone(),
            track_id: seed.track_id.clone(),
            title: seed.title.clone(),
            artist: seed.artist.clone(),
            album: seed.album.clone(),
            artwork: seed.artwork.clone(),
            duration_ms: seed.duration_ms,
        });
        Self {
            queue_item_id,
            track_id: seed.track_id,
            file: seed.file,
            title: seed.title,
            artist: seed.artist,
            album: seed.album,
            album_artist: seed.album_artist,
            artwork: seed.artwork,
            duration_ms: seed.duration_ms,
            track_number: seed.track_number,
            disc_number: seed.disc_number,
            year: seed.year,
            album_key: seed.album_key,
            album_track_count: seed.album_track_count,
            source: seed.source,
            queue_view,
        }
    }
}
