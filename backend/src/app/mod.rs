//! The backend's composition root and its cross-domain use cases.

pub mod playback_context;

use crate::{
    activity::ApplicationActivityService,
    audio::{
        playback::{PlaybackService, PlaybackSnapshot},
        waveform::{PlaybackWaveform, WaveformService},
    },
    events::SharedEventSink,
    library::service::{LibraryCommandError, LibraryService},
    lyrics::{LyricsCommandError, LyricsResolution, LyricsService},
    settings::SettingsService,
};
use playback_context::{PlaybackContext, StartPlaybackError};
use std::{path::PathBuf, sync::Arc};

#[derive(Debug)]
pub enum BackendError {
    PlaybackStartFailed,
}

pub struct BackendApp {
    pub playback: PlaybackService,
    pub activities: ApplicationActivityService,
    pub library: LibraryService,
    pub waveforms: WaveformService,
    pub settings: Arc<SettingsService>,
    lyrics: LyricsService,
}

impl BackendApp {
    /// Starts every service. `events` is how they tell the host that something changed.
    pub async fn initialize(
        data_dir: PathBuf,
        events: SharedEventSink,
    ) -> Result<Self, BackendError> {
        let settings = Arc::new(SettingsService::load(data_dir.clone(), events.clone()));
        let activities = ApplicationActivityService::new(events.clone());
        let activity = activities.handle();
        let waveforms = WaveformService::start(data_dir.join("waveforms"), events.clone());
        let library =
            LibraryService::initialize_with_activity(data_dir, Some(activity), events.clone());
        let remember = Arc::clone(&settings);
        let playback = PlaybackService::start(
            events,
            settings.get().playback,
            Arc::new(move |preferences| remember.record_playback(preferences)),
        )
        .map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            playback,
            activities,
            library,
            waveforms,
            settings,
            lyrics: LyricsService,
        })
    }

    /// Waveform of the file that is loaded right now; `None` while it is still being analyzed.
    /// Other paths are ignored so the renderer cannot make the backend read arbitrary files.
    pub fn playback_waveform(&self, path: &str) -> Option<PlaybackWaveform> {
        let snapshot = self.playback.snapshot();
        let file = &snapshot
            .active_item()
            .filter(|item| item.file.path == path)?
            .file;
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

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Runs on a blocking thread because the playback worker answers only once the
    /// source is loaded and the stream is running.
    pub async fn start_playback(
        &self,
        context: PlaybackContext,
        start_track_id: Option<String>,
    ) -> Result<PlaybackSnapshot, StartPlaybackError> {
        let library = self.library.handle();
        let playback = self.playback.handle();
        tokio::task::spawn_blocking(move || {
            let (items, start_index) =
                playback_context::resolve(&library, &context, start_track_id.as_deref())?;
            Ok(playback.start(items, start_index)?)
        })
        .await
        .map_err(|_| StartPlaybackError::TaskFailed)?
    }

    pub fn shutdown(&self) {
        self.playback.shutdown();
        self.library.shutdown();
        self.settings.shutdown();
    }
}

fn map_lyrics_context_error(error: LibraryCommandError) -> LyricsCommandError {
    match error {
        LibraryCommandError::InvalidId => LyricsCommandError::InvalidId,
        LibraryCommandError::TrackNotFound => LyricsCommandError::TrackNotFound,
        LibraryCommandError::TrackUnavailable => LyricsCommandError::TrackUnavailable,
        LibraryCommandError::LibraryUnavailable => LyricsCommandError::LibraryUnavailable,
        _ => LyricsCommandError::PersistenceFailed,
    }
}
