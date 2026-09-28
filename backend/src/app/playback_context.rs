//! "Play from here": turns a library context and a start track into a playback queue.
//!
//! Every way of starting library playback is a variant of `PlaybackContext`, so a new one
//! (artist, playlist, smart playlist) adds a variant and a resolver, not a new command.

use serde::{Deserialize, Serialize};

use crate::audio::playback::{PlaybackFailureCode, PlaybackItemSeed, PlaybackServiceError};
use crate::library::{
    models::{LibraryAlbumKey, LibrarySortDirection, LibraryTrackSortKey},
    playback::{PlayableTrack, PlaybackSelection, PlaybackSourceError},
    service::LibraryServiceHandle,
};

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackContext {
    /// An album in disc and track order.
    Album { key: LibraryAlbumKey },
    /// The tracks list as currently filtered and sorted.
    Tracks {
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    },
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum StartPlaybackError {
    InvalidAlbumKey,
    InvalidTrackId,
    AlbumNotFound,
    TrackNotMember,
    TrackUnavailable,
    TrackNotPlayable,
    NoPlayableTracks,
    LibraryUnavailable,
    PersistenceFailed,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    /// A newer request replaced this one; there is nothing to report.
    Superseded,
    TaskFailed,
}

impl From<PlaybackSourceError> for StartPlaybackError {
    fn from(error: PlaybackSourceError) -> Self {
        match error {
            PlaybackSourceError::InvalidAlbumKey => Self::InvalidAlbumKey,
            PlaybackSourceError::InvalidTrackId => Self::InvalidTrackId,
            PlaybackSourceError::AlbumNotFound => Self::AlbumNotFound,
            PlaybackSourceError::TrackNotMember => Self::TrackNotMember,
            PlaybackSourceError::TrackUnavailable => Self::TrackUnavailable,
            PlaybackSourceError::TrackNotPlayable => Self::TrackNotPlayable,
            PlaybackSourceError::NoPlayableTracks => Self::NoPlayableTracks,
            PlaybackSourceError::LibraryUnavailable => Self::LibraryUnavailable,
            PlaybackSourceError::PersistenceFailed => Self::PersistenceFailed,
        }
    }
}

impl From<PlaybackServiceError> for StartPlaybackError {
    fn from(error: PlaybackServiceError) -> Self {
        match error {
            PlaybackServiceError::WorkerUnavailable => Self::PlaybackWorkerUnavailable,
            PlaybackServiceError::Superseded => Self::Superseded,
            PlaybackServiceError::Output(PlaybackFailureCode::NoOutputDevice) => {
                Self::NoOutputDevice
            }
            PlaybackServiceError::Output(PlaybackFailureCode::OutputDeviceUnavailable)
            | PlaybackServiceError::OutputDeviceUnavailable => Self::OutputDeviceUnavailable,
            PlaybackServiceError::Output(PlaybackFailureCode::DecodeFailed)
            | PlaybackServiceError::Decode => Self::DecodeFailed,
            PlaybackServiceError::Output(_) => Self::OutputFailed,
            PlaybackServiceError::QueueItemNotFound
            | PlaybackServiceError::QueueBusy
            | PlaybackServiceError::InvalidVolume
            | PlaybackServiceError::InvalidDeviceId
            | PlaybackServiceError::InvalidPlaybackState
            | PlaybackServiceError::DurationUnavailable
            | PlaybackServiceError::Seek => Self::TaskFailed,
        }
    }
}

/// Reads the context's tracks from the library. Blocking: call it off the async runtime.
pub fn resolve(
    library: &LibraryServiceHandle,
    context: &PlaybackContext,
    start_track_id: Option<&str>,
) -> Result<(Vec<PlaybackItemSeed>, usize), StartPlaybackError> {
    let PlaybackSelection {
        tracks,
        start_index,
    } = match context {
        PlaybackContext::Album { key } => library.playback_for_album(key, start_track_id),
        PlaybackContext::Tracks {
            search,
            sort_key,
            sort_direction,
        } => library.playback_for_tracks(
            search.as_deref(),
            *sort_key,
            *sort_direction,
            start_track_id,
        ),
    }?;
    Ok((tracks.into_iter().map(seed).collect(), start_index))
}

fn seed(track: PlayableTrack) -> PlaybackItemSeed {
    PlaybackItemSeed {
        track_id: Some(track.track_id),
        file: track.file,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_artist: track.album_artist,
        artwork: track.artwork,
        duration_ms: track.duration_ms,
    }
}
