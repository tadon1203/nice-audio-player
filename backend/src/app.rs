use crate::{
    activity::ApplicationActivityService, audio::playback::PlaybackService,
    library::service::LibraryService, lyrics::LyricsService,
};
use std::path::PathBuf;

#[derive(Debug)]
pub enum BackendError {
    PlaybackStartFailed,
}

pub struct BackendApp {
    pub(crate) playback: PlaybackService,
    pub(crate) activities: ApplicationActivityService,
    pub(crate) library: LibraryService,
    _lyrics: LyricsService,
}

impl BackendApp {
    pub async fn initialize(data_dir: PathBuf) -> Result<Self, BackendError> {
        let activities = ApplicationActivityService::new();
        let activity = activities.handle();
        let library = LibraryService::initialize_with_activity(data_dir, Some(activity));
        let playback = PlaybackService::start().map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            playback,
            activities,
            library,
            _lyrics: LyricsService,
        })
    }

    pub async fn start_library_track(
        &self,
        track_id: String,
    ) -> Result<
        crate::audio::playback::PlaybackSnapshot,
        crate::library::service::StartLibraryTrackError,
    > {
        let library = self.library.handle();
        let playback = self.playback.handle();
        tokio::task::spawn_blocking(move || {
            let entry = library.playable_entry(track_id)?;
            playback
                .play_entry(crate::audio::playback::PlaybackEntrySeed {
                    file: entry.file,
                    title: entry.title,
                    artist: entry.artist,
                    duration_ms: entry.duration_ms,
                })
                .map_err(map_playback_track_error)
        })
        .await
        .map_err(|_| crate::library::service::StartLibraryTrackError::TaskFailed)?
    }

    pub async fn start_library_album(
        &self,
        album_key: crate::library::models::LibraryAlbumKey,
    ) -> Result<
        crate::audio::playback::PlaybackSnapshot,
        crate::library::service::StartLibraryAlbumTrackError,
    > {
        let library = self.library.handle();
        let playback = self.playback.handle();
        tokio::task::spawn_blocking(move || {
            let (entries, index) = library.catalog_playback(album_key, None)?;
            let entries = entries
                .into_iter()
                .map(|entry| crate::audio::playback::PlaybackEntrySeed {
                    file: entry.file,
                    title: entry.title,
                    artist: entry.artist,
                    duration_ms: entry.duration_ms,
                })
                .collect();
            playback
                .play_sequence_entries_at(entries, index)
                .map_err(map_playback_album_error)
        })
        .await
        .map_err(|_| crate::library::service::StartLibraryAlbumTrackError::TaskFailed)?
    }

    pub(crate) fn shutdown(&self) {
        self.playback.shutdown();
        self.library.shutdown();
    }
}

fn map_playback_track_error(
    error: crate::audio::playback::PlaybackServiceError,
) -> crate::library::service::StartLibraryTrackError {
    use crate::audio::playback::{PlaybackFailureCode, PlaybackServiceError};
    use crate::library::service::StartLibraryTrackError;
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            StartLibraryTrackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::Output(PlaybackFailureCode::NoOutputDevice) => {
            StartLibraryTrackError::NoOutputDevice
        }
        PlaybackServiceError::Output(PlaybackFailureCode::OutputDeviceUnavailable) => {
            StartLibraryTrackError::OutputDeviceUnavailable
        }
        PlaybackServiceError::Output(PlaybackFailureCode::DecodeFailed) => {
            StartLibraryTrackError::DecodeFailed
        }
        PlaybackServiceError::Output(_) => StartLibraryTrackError::OutputFailed,
        PlaybackServiceError::Decode => StartLibraryTrackError::DecodeFailed,
        PlaybackServiceError::QueueItemNotFound
        | PlaybackServiceError::QueueBusy
        | PlaybackServiceError::InvalidVolume
        | PlaybackServiceError::InvalidDeviceId
        | PlaybackServiceError::OutputDeviceUnavailable
        | PlaybackServiceError::InvalidPlaybackState
        | PlaybackServiceError::DurationUnavailable
        | PlaybackServiceError::Seek => StartLibraryTrackError::TaskFailed,
    }
}

fn map_playback_album_error(
    error: crate::audio::playback::PlaybackServiceError,
) -> crate::library::service::StartLibraryAlbumTrackError {
    use crate::audio::playback::{PlaybackFailureCode, PlaybackServiceError};
    use crate::library::service::StartLibraryAlbumTrackError;
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            StartLibraryAlbumTrackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::Output(PlaybackFailureCode::NoOutputDevice) => {
            StartLibraryAlbumTrackError::NoOutputDevice
        }
        PlaybackServiceError::Output(PlaybackFailureCode::OutputDeviceUnavailable) => {
            StartLibraryAlbumTrackError::OutputDeviceUnavailable
        }
        PlaybackServiceError::Output(PlaybackFailureCode::DecodeFailed) => {
            StartLibraryAlbumTrackError::DecodeFailed
        }
        PlaybackServiceError::Output(_) => StartLibraryAlbumTrackError::OutputFailed,
        PlaybackServiceError::Decode => StartLibraryAlbumTrackError::DecodeFailed,
        PlaybackServiceError::QueueItemNotFound
        | PlaybackServiceError::QueueBusy
        | PlaybackServiceError::InvalidVolume
        | PlaybackServiceError::InvalidDeviceId
        | PlaybackServiceError::OutputDeviceUnavailable
        | PlaybackServiceError::InvalidPlaybackState
        | PlaybackServiceError::DurationUnavailable
        | PlaybackServiceError::Seek => StartLibraryAlbumTrackError::TaskFailed,
    }
}
