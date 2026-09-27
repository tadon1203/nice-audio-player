use crate::{
    activity::ApplicationActivityService,
    audio::{
        playback::PlaybackService,
        waveform::{PlaybackWaveform, WaveformService},
    },
    library::service::{LibraryCommandError, LibraryService},
    lyrics::{LyricsCommandError, LyricsResolution, LyricsService},
};
use std::path::PathBuf;

#[derive(Debug)]
pub enum BackendError {
    PlaybackStartFailed,
}

pub struct BackendApp {
    pub playback: PlaybackService,
    pub activities: ApplicationActivityService,
    pub library: LibraryService,
    pub waveforms: WaveformService,
    lyrics: LyricsService,
}

impl BackendApp {
    pub async fn initialize(data_dir: PathBuf) -> Result<Self, BackendError> {
        let activities = ApplicationActivityService::new();
        let activity = activities.handle();
        let waveforms = WaveformService::start(data_dir.join("waveforms"));
        let library = LibraryService::initialize_with_activity(data_dir, Some(activity));
        let playback = PlaybackService::start().map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            playback,
            activities,
            library,
            waveforms,
            lyrics: LyricsService,
        })
    }

    /// Waveform of the file that is loaded right now; `None` while it is still being analyzed.
    /// Other paths are ignored so the renderer cannot make the backend read arbitrary files.
    pub fn playback_waveform(&self, path: &str) -> Option<PlaybackWaveform> {
        let snapshot = self.playback.snapshot();
        let file = snapshot.active_file().filter(|file| file.path == path)?;
        let waveform = self.waveforms.get_or_queue(file)?;
        Some(PlaybackWaveform {
            path: file.path.clone(),
            peaks: waveform.peaks.clone(),
            rms: waveform.rms.clone(),
        })
    }

    pub async fn resolve_lyrics(
        &self,
        track_id: String,
    ) -> Result<LyricsResolution, LyricsCommandError> {
        let library = self.library.handle();
        let lyrics = self.lyrics;
        tokio::task::spawn_blocking(move || {
            let context = library
                .lyrics_context(track_id)
                .map_err(map_lyrics_context_error)?;
            Ok(lyrics.resolve(context))
        })
        .await
        .map_err(|_| LyricsCommandError::TaskFailed)?
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

    pub fn shutdown(&self) {
        self.playback.shutdown();
        self.library.shutdown();
    }
}

fn map_lyrics_context_error(error: LibraryCommandError) -> LyricsCommandError {
    match error {
        LibraryCommandError::InvalidId => LyricsCommandError::InvalidId,
        LibraryCommandError::RootNotFound => LyricsCommandError::TrackNotFound,
        LibraryCommandError::RootMissing => LyricsCommandError::TrackUnavailable,
        LibraryCommandError::LibraryUnavailable => LyricsCommandError::LibraryUnavailable,
        _ => LyricsCommandError::PersistenceFailed,
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
