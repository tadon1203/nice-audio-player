//! The Backend's composition root and its cross-domain use cases. The Host calls `BackendApp` and
//! nothing else: each method is one use case, and its services stay behind it.

mod playback_context;
#[cfg(test)]
mod tests;

pub use playback_context::PlaybackContext;
// The types the Host names in commands and state. Each one is defined in the module that owns it.
pub use crate::audio::devices::{AudioOutputDevice, AudioOutputSelection};
pub use crate::audio::meter::MeterHub;
pub use crate::audio::playback::{
    CurrentPlayback, PlaybackFailureCode, PlaybackItem, PlaybackPosition, PlaybackQueueItem,
    PlaybackState, QueueState, QueueWindow, RepeatMode, StartedBy,
};
pub use crate::audio::waveform::PlaybackWaveform;
pub use crate::library::LibraryStatus;
pub use crate::library::artwork::{ArtworkCache, ArtworkRef, ServedArtwork};
pub use crate::library::models::{
    AlbumArtistListRequest, AlbumArtistQuery, AlbumDetails, AlbumListRequest, AlbumQuery, AlbumRow,
    AlbumTracksRequest, ArtistAlbumsRequest, ArtistRow, LibraryAlbumArtistPage, LibraryAlbumPage,
    LibraryAlbumTrackPage, LibraryDirectory, LibraryTrackPage, ScrollIndexBucket, SortDirection,
    TrackListRequest, TrackProperties, TrackQuery, TrackRow, TrackSortKey,
};
pub use crate::lyrics::LyricsResolution;
pub use crate::messages::Versioned;
pub use crate::settings::{Appearance, AppearancePatch};

use crate::audio::{
    devices::{self, AudioDeviceListError},
    output::{CpalBackend, OutputBackend},
    playback::{
        NoTracks, PlaybackService, PlaybackServiceError, TrackListener, TrackResolver, TrackSource,
    },
    waveform::Waveforms,
};
use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, ArtworkHash, DirectoryId, QueueItemId, TrackId};
use crate::library::{
    Library, LibraryCommandError, LibraryUnavailableReason, StoreError,
    artwork::{self},
};
use crate::lyrics::{LyricsCommandError, LyricsService, model::LyricsTrackContext};
use crate::messages::{BackendMessage, SharedMessageListener, StateTopic};
use crate::settings::{SettingsService, load_saved};
use crate::state_hub::{Published, StateHub};
use playback_context::LibraryTracks;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("the playback service could not start")]
    PlaybackStartFailed,
}

pub struct BackendApp {
    playback: PlaybackService,
    /// The Library, or why it is unavailable.
    library: Result<Library, LibraryUnavailableReason>,
    settings: Arc<SettingsService>,
    /// Every published state value. The services publish into it, and the Host reads it.
    hub: Arc<StateHub>,
    data_dir: PathBuf,
}

impl BackendApp {
    /// Starts every service with the platform's audio output. `messages` is how they tell the
    /// host that something changed.
    pub fn initialize(
        data_dir: PathBuf,
        messages: SharedMessageListener,
    ) -> Result<Self, BackendError> {
        Self::start(data_dir, messages, Box::new(CpalBackend))
    }

    /// Like `initialize`, with a fake output device instead of the platform's.
    #[cfg(test)]
    pub(crate) fn initialize_for_tests(data_dir: PathBuf, messages: SharedMessageListener) -> Self {
        Self::start(
            data_dir,
            messages,
            Box::new(crate::audio::fake_output::FakeOutput::new()),
        )
        .expect("the test backend starts")
    }

    fn start(
        data_dir: PathBuf,
        messages: SharedMessageListener,
        output: Box<dyn OutputBackend>,
    ) -> Result<Self, BackendError> {
        let saved = load_saved(&data_dir);
        let hub = Arc::new(StateHub::new(
            Published::initial(&saved),
            Arc::clone(&messages),
        ));
        let settings = Arc::new(SettingsService::start(&data_dir, saved, Arc::clone(&hub)));
        let waveforms = Arc::new(Waveforms::start(
            data_dir.join("waveforms"),
            Arc::clone(&hub),
        ));
        let library = Library::open(&data_dir, Arc::clone(&hub));
        let remember = Arc::clone(&settings);
        let tracks: Box<dyn TrackSource> = match &library {
            Ok(library) => Box::new(LibraryTracks(library.store().clone())),
            Err(_) => Box::new(NoTracks),
        };
        let loaded_waveforms = Arc::clone(&waveforms);
        let upcoming_waveforms = Arc::clone(&waveforms);
        let listener = TrackListener {
            loaded: Arc::new(move |playback_id, track| {
                loaded_waveforms.loaded(playback_id, track);
            }),
            upcoming: Arc::new(move |track| upcoming_waveforms.upcoming(track)),
        };
        let playback = PlaybackService::start_with_backend(
            Arc::clone(&hub),
            messages,
            settings.playback_preferences(),
            Arc::new(move |preferences| remember.record_playback(preferences)),
            Arc::new(TrackResolver::new(tracks)),
            listener,
            output,
        )
        .inspect_err(|cause| log::warn!("app.playback.start_failed cause={cause}"))
        .map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            playback,
            library,
            settings,
            hub,
            data_dir,
        })
    }

    pub fn shutdown(&self) {
        self.playback.shutdown();
        if let Ok(library) = &self.library {
            library.shutdown();
        }
        self.settings.shutdown();
    }

    // ---- communication ----

    /// Every state topic as a message, each with its version. The connect command returns them.
    pub fn messages(&self) -> Vec<BackendMessage> {
        self.hub.messages()
    }

    /// The message that carries the current value of `topic`.
    pub fn message(&self, topic: StateTopic) -> BackendMessage {
        self.hub.message(topic)
    }

    /// The message that carries the newest playing position, when a track is loaded.
    pub fn position_message(&self) -> Option<BackendMessage> {
        self.playback.position().map(BackendMessage::Position)
    }

    /// Where Meter frames are subscribed to.
    pub fn meter(&self) -> MeterHub {
        self.playback.meter()
    }

    /// The artwork file `relative` names inside the data directory `data_dir`, for the Host's
    /// artwork protocol. The artwork store is not a service of its own, so this needs no instance.
    pub fn serve_artwork(data_dir: &Path, relative: &str) -> Option<ServedArtwork> {
        artwork::serve(data_dir, relative)
    }

    // ---- library ----

    pub fn library_status(&self) -> LibraryStatus {
        match &self.library {
            Ok(_) => LibraryStatus::Ready,
            Err(reason) => LibraryStatus::Unavailable {
                reason: reason.clone(),
            },
        }
    }

    /// Stops the Library, then deletes its database and artwork and creates an empty database. The
    /// caller restarts the app, and the next start rescans the directories.
    pub fn reset_library(&self) -> Result<(), CommandError> {
        if let Ok(library) = &self.library {
            library.shutdown();
        }
        crate::library::database::reset(&self.data_dir).map_err(|_| CommandError::PersistenceFailed)
    }

    pub fn list_directories(&self) -> Result<Vec<LibraryDirectory>, CommandError> {
        self.library()?.directories()
    }

    /// Adds a directory. A path that is not valid Unicode is refused by the Library, not changed.
    pub fn add_directory(&self, path: PathBuf) -> Result<LibraryDirectory, CommandError> {
        self.library()?.add_directory(path)
    }

    pub fn set_directory_enabled(
        &self,
        id: DirectoryId,
        enabled: bool,
    ) -> Result<(), CommandError> {
        self.library()?.set_directory_enabled(id, enabled)
    }

    pub fn remove_directory(&self, id: DirectoryId) -> Result<(), CommandError> {
        self.library()?.remove_directory(id)
    }

    /// Deletes the Missing tracks from the Library and returns how many there were. Never touches a
    /// source file.
    pub fn delete_missing_tracks(&self) -> Result<u64, LibraryCommandError> {
        self.library()?.delete_missing()
    }

    pub fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.library()?.start_scan()
    }

    pub fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.library()?.cancel_scan()
    }

    pub fn list_tracks(
        &self,
        request: &TrackListRequest,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_tracks_from(request)?)
    }

    pub fn list_albums(
        &self,
        request: &AlbumListRequest,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_albums_from(request)?)
    }

    pub fn list_album_artists(
        &self,
        request: &AlbumArtistListRequest,
    ) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_album_artists_from(request)?)
    }

    /// The scroll index of the Tracks list: how many names start under each label, in list order.
    pub fn track_index(
        &self,
        query: &TrackQuery,
    ) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
        Ok(self.library()?.store().catalog_track_index(query)?)
    }

    pub fn album_index(
        &self,
        query: &AlbumQuery,
    ) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
        Ok(self.library()?.store().catalog_album_index(query)?)
    }

    pub fn album_artist_index(
        &self,
        query: &AlbumArtistQuery,
    ) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
        Ok(self.library()?.store().catalog_album_artist_index(query)?)
    }

    pub fn album_by_id(&self, album_id: AlbumId) -> Result<AlbumDetails, LibraryCommandError> {
        Ok(self.library()?.store().catalog_album(album_id)?)
    }

    pub fn album_tracks_by_id(
        &self,
        request: &AlbumTracksRequest,
    ) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_album_tracks_by_id(request.album_id, request.cursor.as_deref())?)
    }

    pub fn artist(&self, artist_id: ArtistId) -> Result<ArtistRow, LibraryCommandError> {
        Ok(self.library()?.store().catalog_artist(artist_id)?)
    }

    pub fn artist_albums(
        &self,
        request: &ArtistAlbumsRequest,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_artist_albums(
            request.artist_id,
            request.cursor.as_deref(),
            request.sort_key,
            request.sort_direction,
        )?)
    }

    pub fn track_properties(
        &self,
        track_id: TrackId,
    ) -> Result<TrackProperties, LibraryCommandError> {
        Ok(self.library()?.store().track_properties(track_id)?)
    }

    /// The track's file, for the Host to show in Explorer.
    pub fn track_file(&self, track_id: TrackId) -> Result<PathBuf, LibraryCommandError> {
        let file = self
            .library()?
            .store()
            .track_location(track_id)?
            .existing()?;
        Ok(file.path)
    }

    /// The accent color of stored artwork, computed on first request and cached.
    pub fn artwork_accent(
        &self,
        hash: &ArtworkHash,
    ) -> Result<Option<String>, LibraryCommandError> {
        self.library()?.artwork_accent(hash)
    }

    // ---- lyrics ----

    /// Blocking: the host runs it on a blocking thread.
    pub fn track_lyrics(&self, track_id: TrackId) -> Result<LyricsResolution, LyricsCommandError> {
        let library = self
            .library
            .as_ref()
            .inspect_err(|cause| log::warn!("app.lyrics.library_unavailable cause={cause}"))
            .map_err(|_| LyricsCommandError::Common {
                error: CommandError::LibraryUnavailable,
            })?;
        // The Library says where the file is; lyrics reads what is beside and inside it.
        let file = library
            .store()
            .track_location(track_id)
            .map_err(map_lyrics_context_error)?
            .existing()
            .inspect_err(|cause| log::warn!("app.lyrics.track_unavailable cause={cause}"))
            .map_err(|_| LyricsCommandError::Common {
                error: CommandError::TrackUnavailable,
            })?;
        Ok(LyricsService::resolve(&LyricsTrackContext {
            track_id,
            source: file.path,
            directory: file.directory,
        }))
    }

    // ---- appearance ----

    /// Applies a renderer update and returns the appearance as it is afterwards.
    pub fn appearance_update(&self, patch: &AppearancePatch) -> Versioned<Appearance> {
        self.settings.appearance_update(patch)
    }

    // ---- playback ----

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Blocking: the playback worker answers only once the source is loaded and the
    /// stream is running.
    pub fn play(
        &self,
        context: &PlaybackContext,
        start_track_id: Option<TrackId>,
    ) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        let library = self.playback_library()?;
        let selection = playback_context::resolve(library.store(), context, start_track_id)?;
        // The track the listener picked is checked now, so they get a clear answer when its
        // file is gone; the others are read when the queue needs them.
        if let Some(requested) = start_track_id {
            playback_context::resolve_track(library.store(), requested)?;
        }
        self.playback
            .handle()
            .start(selection.track_ids, selection.start_index)
    }

    pub fn pause(&self) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().pause()
    }

    pub fn resume(&self) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().resume()
    }

    pub fn previous(&self) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().previous()
    }

    pub fn next(&self) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().next()
    }

    /// Clamps `position_ms` to the track's duration.
    pub fn seek(&self, position_ms: u64) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        let duration_ms = self
            .playback
            .snapshot()
            .session()
            .and_then(|session| session.duration_ms);
        let position_ms = duration_ms.map_or(position_ms, |duration| position_ms.min(duration));
        self.playback.handle().seek(position_ms)
    }

    pub fn set_volume(
        &self,
        volume: f32,
    ) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().set_volume(volume)
    }

    pub fn set_muted(&self, muted: bool) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        let handle = self.playback.handle();
        if muted {
            handle.mute()
        } else {
            handle.unmute()
        }
    }

    pub fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().set_output_selection(selection)
    }

    /// The output devices the system has. Blocking: the device query waits on the audio host.
    pub fn list_output_devices() -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
        devices::list_output_devices()
    }

    pub fn set_repeat_mode(
        &self,
        mode: RepeatMode,
    ) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        self.playback.handle().set_repeat_mode(mode)
    }

    pub fn set_shuffle(
        &self,
        enabled: bool,
    ) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        self.playback.handle().set_shuffle(enabled)
    }

    pub fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        self.playback.handle().remove_queue_item(id)
    }

    pub fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        self.playback.handle().move_queue_item(id, to)
    }

    /// Makes an upcoming queue item current and plays it.
    pub fn play_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().play_queue_item(id)
    }

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `play`.
    pub fn enqueue_track(
        &self,
        track_id: TrackId,
        next: bool,
    ) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        let library = self.playback_library()?;
        let track = playback_context::resolve_track(library.store(), track_id)?;
        self.playback.handle().enqueue(vec![track.id()], next)
    }

    pub fn clear_queue(&self) -> Result<Versioned<QueueState>, PlaybackServiceError> {
        self.playback.handle().clear_queue()
    }

    /// Puts back the queue the last replacement or Clear upcoming took away.
    pub fn restore_previous_queue(&self) -> Result<Versioned<PlaybackState>, PlaybackServiceError> {
        self.playback.handle().restore_previous_queue()
    }

    /// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
    /// snapshot does not carry.
    pub fn queue_window(&self, offset: u32, limit: u32) -> QueueWindow {
        self.playback
            .handle()
            .queue_window(offset as usize, limit as usize)
    }

    // ---- private helpers ----

    fn library(&self) -> Result<&Library, LibraryCommandError> {
        self.library
            .as_ref()
            .inspect_err(|cause| log::warn!("app.library.unavailable cause={cause}"))
            .map_err(|_| LibraryCommandError::Common {
                error: CommandError::LibraryUnavailable,
            })
    }

    fn playback_library(&self) -> Result<&Library, PlaybackServiceError> {
        self.library
            .as_ref()
            .inspect_err(|cause| log::warn!("app.playback.library_unavailable cause={cause}"))
            .map_err(|_| PlaybackServiceError::Common {
                error: CommandError::LibraryUnavailable,
            })
    }
}

fn map_lyrics_context_error(error: StoreError) -> LyricsCommandError {
    LyricsCommandError::Common {
        error: error.into(),
    }
}
