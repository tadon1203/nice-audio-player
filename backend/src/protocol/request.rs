use crate::library::models::LibraryAlbumKey;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
pub enum BackendRequest {
    Ping,
    GetPlaybackState,
    GetPlaybackQueue,
    ListAudioOutputDevices,
    GetApplicationActivities,
    GetLibraryStatus,
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
    },
    ListLibraryAlbums {
        after_cursor: Option<String>,
        search: Option<String>,
    },
    ListLibraryAlbumArtists {
        after_cursor: Option<String>,
        search: Option<String>,
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
