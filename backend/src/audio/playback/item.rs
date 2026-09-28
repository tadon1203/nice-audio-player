use crate::media::{artwork::ArtworkRef, validation::ValidatedAudioFile};

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
}

impl PlaybackItem {
    pub(super) fn from_seed(queue_item_id: String, seed: PlaybackItemSeed) -> Self {
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
        }
    }
}
