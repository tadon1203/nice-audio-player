use crate::audio::{
    devices::AudioOutputDevice,
    playback::{PlaybackQueueSnapshot, PlaybackSnapshot},
};
use crate::{
    activity::ApplicationActivity,
    library::models::LibraryStatus,
    media::validation::{AudioFileValidationError, ValidatedAudioFile},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "method", content = "result", rename_all = "camelCase")]
pub enum BackendResponse {
    Ping(String),
    GetPlaybackState(PlaybackSnapshot),
    GetPlaybackQueue(PlaybackQueueSnapshot),
    ListAudioOutputDevices(Vec<AudioOutputDevice>),
    GetApplicationActivities(Vec<ApplicationActivity>),
    GetLibraryStatus(LibraryStatus),
    ValidateAudioFile(Result<ValidatedAudioFile, AudioFileValidationError>),
    ListLibraryRoots(Vec<crate::library::models::LibraryRoot>),
    RegisterLibraryRoot(crate::library::models::LibraryRoot),
    SetLibraryRootEnabled(crate::library::models::LibraryRoot),
    RemoveLibraryRoot(()),
    GetLibraryScanState(crate::library::models::LibraryScanSnapshot),
    StartLibraryScan(()),
    CancelLibraryScan(()),
    ListLibraryTracks(crate::library::models::LibraryTrackPage),
    ListLibraryAlbums(crate::library::models::LibraryAlbumPage),
    ListLibraryAlbumArtists(crate::library::models::LibraryAlbumArtistPage),
    StartLibraryTrack(PlaybackSnapshot),
    StartLibraryAlbum(PlaybackSnapshot),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendWireResponse {
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ProtocolError>,
}

#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: String,
    pub message: String,
}

pub type Response = BackendWireResponse;
