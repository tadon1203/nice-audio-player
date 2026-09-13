use crate::library::models::{
    LibraryAlbumArtistSortKey, LibraryAlbumKey, LibraryAlbumSortKey, LibraryArtistAlbumSortKey,
    LibrarySortDirection, LibraryTrackSortKey,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
pub enum BackendRequest {
    Ping,
    GetPlaybackState,
    GetPlaybackQueue,
    PausePlayback,
    ResumePlayback,
    PreviousPlayback,
    NextPlayback,
    SeekPlayback {
        #[specta(type = f64)]
        position_ms: u64,
    },
    SetPlaybackVolume {
        volume: f32,
    },
    SetPlaybackMuted {
        muted: bool,
    },
    ListAudioOutputDevices,
    GetApplicationActivities,
    GetLibraryStatus,
    GetLibraryTrackForPath {
        path: String,
    },
    ValidateAudioFile {
        path: String,
    },
    ListLibraryRoots,
    RegisterLibraryRoot {
        path: String,
    },
    SetLibraryRootEnabled {
        id: String,
        enabled: bool,
    },
    RemoveLibraryRoot {
        id: String,
    },
    GetLibraryScanState,
    StartLibraryScan,
    CancelLibraryScan,
    ListLibraryTracks {
        after_id: Option<String>,
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    },
    ListLibraryAlbums {
        after_cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumSortKey,
        sort_direction: LibrarySortDirection,
    },
    ListLibraryAlbumArtists {
        after_cursor: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumArtistSortKey,
        sort_direction: LibrarySortDirection,
    },
    GetLibraryAlbumArtist {
        artist_key: crate::library::models::LibraryAlbumArtistKey,
    },
    ListLibraryArtistAlbums {
        artist_key: crate::library::models::LibraryAlbumArtistKey,
        after_cursor: Option<String>,
        sort_key: LibraryArtistAlbumSortKey,
        sort_direction: LibrarySortDirection,
    },
    GetLibraryAlbumDetails {
        album_key: LibraryAlbumKey,
    },
    ListLibraryAlbumTracks {
        album_key: LibraryAlbumKey,
        offset: u32,
    },
    StartLibraryTrack {
        track_id: String,
    },
    StartLibraryAlbum {
        album_key: LibraryAlbumKey,
    },
}

#[derive(Debug, Deserialize)]
pub struct Envelope {
    pub id: u64,
    #[serde(flatten)]
    pub request: BackendRequest,
}

pub fn parse(id: u64, method: &str, params: Value) -> Result<Envelope, serde_json::Error> {
    serde_json::from_value(serde_json::json!({ "id": id, "method": method, "params": params }))
}
