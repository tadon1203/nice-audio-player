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

#[derive(Debug, Clone)]
pub struct NullResult;

impl serde::Serialize for NullResult {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_unit()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum ValidateAudioFileResult {
    Ok(ValidatedAudioFile),
    Err(AudioFileValidationError),
}

#[derive(Debug, Serialize)]
#[serde(tag = "method", content = "result", rename_all = "camelCase")]
pub enum BackendResponse {
    Ping(String),
    GetPlaybackState(PlaybackSnapshot),
    GetPlaybackQueue(PlaybackQueueSnapshot),
    PausePlayback(PlaybackSnapshot),
    ResumePlayback(PlaybackSnapshot),
    PreviousPlayback(PlaybackSnapshot),
    NextPlayback(PlaybackSnapshot),
    SeekPlayback(PlaybackSnapshot),
    SetPlaybackVolume(PlaybackSnapshot),
    SetPlaybackMuted(PlaybackSnapshot),
    ListAudioOutputDevices(Vec<AudioOutputDevice>),
    GetApplicationActivities(Vec<ApplicationActivity>),
    GetLibraryStatus(LibraryStatus),
    GetLibraryTrackForPath(Option<crate::library::models::LibraryTrackSummary>),
    ValidateAudioFile(ValidateAudioFileResult),
    ListLibraryRoots(Vec<crate::library::models::LibraryRoot>),
    RegisterLibraryRoot(crate::library::models::LibraryRoot),
    SetLibraryRootEnabled(crate::library::models::LibraryRoot),
    RemoveLibraryRoot(NullResult),
    GetLibraryScanState(crate::library::models::LibraryScanSnapshot),
    StartLibraryScan(NullResult),
    CancelLibraryScan(NullResult),
    ListLibraryTracks(crate::library::models::LibraryTrackPage),
    ListLibraryAlbums(crate::library::models::LibraryAlbumPage),
    ListLibraryAlbumArtists(crate::library::models::LibraryAlbumArtistPage),
    GetLibraryAlbumArtist(crate::library::models::LibraryAlbumArtistSummary),
    ListLibraryArtistAlbums(crate::library::models::LibraryAlbumPage),
    GetLibraryAlbumDetails(crate::library::models::LibraryAlbumDetails),
    ListLibraryAlbumTracks(crate::library::models::LibraryAlbumTrackPage),
    StartLibraryTrack(PlaybackSnapshot),
    StartLibraryAlbum(PlaybackSnapshot),
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum BackendWireResponse {
    Ok { id: u64, response: BackendResponse },
    Error { id: u64, error: ProtocolError },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: String,
    pub message: String,
}

pub type Response = BackendWireResponse;
