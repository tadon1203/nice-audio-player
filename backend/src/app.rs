//! The Backend's composition root and its cross-domain use cases. The Host calls `BackendApp` and
//! nothing else: each method is one use case, and its services stay behind it.

pub(crate) mod playback_context;
#[cfg(test)]
mod tests;

pub use playback_context::PlaybackContext;
// The types the Host names in commands and state. Each one is defined in the module that owns it.
pub use crate::library::LibraryStatus;
pub use crate::library::artwork::{ArtworkRef, ServedArtwork};
pub use crate::library::models::{
    AlbumDetails, AlbumRow, AlbumSortKey, AlbumTrackRow, ArtistAlbumSortKey, ArtistRow,
    ArtistSortKey, LetterIndexEntry, LibraryDirectory, ListRequest, Page, SortDirection,
    TrackProperties, TrackRow, TrackSortKey,
};
pub use crate::lyrics::Lyrics;
pub use crate::messages::Versioned;
pub use crate::meter::{Meter, MeterFrame};
pub use crate::player::output::{AudioOutputDevice, AudioOutputSelection};
pub use crate::player::output::{CpalOutput, OutputStreamFactory};
pub use crate::player::{
    PlaybackPosition, PlayerState, QueueState, QueueWindow, RepeatMode, UPCOMING_WINDOW,
};
pub use crate::settings::{Appearance, AppearancePatch};

use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, DirectoryId, QueueItemId, TrackId};
use crate::library::models::LibraryState;
use crate::library::{
    Library, LibraryUnavailableReason,
    artwork::{self},
};
use crate::lyrics;
use crate::messages::{BackendMessage, Notifier, StateTopic};
use crate::player::{Player, waveform::Waveforms};
use crate::settings::{self, SettingsStore};
use crate::state_store::StateStore;
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
    player: Player,
    meter: Meter,
    /// The Library, or why it is unavailable.
    library: Result<Library, LibraryUnavailableReason>,
    settings: Arc<SettingsStore>,
    /// Every published state value. The services publish into it, and the Host reads it.
    state_store: Arc<StateStore>,
    data_dir: PathBuf,
}

impl BackendApp {
    /// Starts every service on `output`: `CpalOutput` in the Host, a fake device in tests.
    /// `messages` is how they tell the host that something changed.
    pub fn initialize(
        data_dir: PathBuf,
        messages: Notifier,
        output: Box<dyn OutputStreamFactory>,
    ) -> Result<Self, BackendError> {
        let saved = settings::read(&settings::file_path(&data_dir));
        let state_store = Arc::new(StateStore::new(&saved, messages));
        let settings = Arc::new(SettingsStore::open(
            settings::file_path(&data_dir),
            saved,
            Arc::clone(&state_store),
        ));
        let waveforms = Arc::new(Waveforms::start(
            data_dir.join("waveforms"),
            Arc::clone(&state_store),
        ));
        let library = Library::open(&data_dir, Arc::clone(&state_store));
        // A Library that did not open has no worker to publish its state, so the state is published here.
        if let Err(reason) = &library {
            state_store.set_library(LibraryState::empty(LibraryStatus::Unavailable {
                reason: reason.clone(),
            }));
        }
        let remember = Arc::clone(&settings);
        let meter = Meter::new();
        let player = Player::start(
            library.clone().ok().map(Arc::new),
            Arc::clone(&state_store),
            meter.clone(),
            Arc::clone(&waveforms),
            settings.player_preferences(),
            move |preferences| remember.record_player(preferences.clone()),
            output,
        )
        .inspect_err(|cause| log::warn!("app.playback.start_failed cause={cause}"))
        .map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            player,
            meter,
            library,
            settings,
            state_store,
            data_dir,
        })
    }

    pub fn shutdown(&self) {
        self.player.shutdown();
        if let Ok(library) = &self.library {
            library.shutdown();
        }
        self.settings.shutdown();
    }

    // ---- communication ----

    /// Every state topic as a message, each with its version. The connect command returns them.
    pub fn messages(&self) -> Vec<BackendMessage> {
        self.state_store.messages()
    }

    /// The message that carries the current value of `topic`.
    pub fn message(&self, topic: StateTopic) -> BackendMessage {
        self.state_store.message(topic)
    }

    /// The message that carries the newest playing position, when a track is loaded.
    pub fn position_message(&self) -> Option<BackendMessage> {
        self.player.position().map(BackendMessage::Position)
    }

    /// The Meter that measures the output, for the Renderer's meter subscription.
    pub fn meter(&self) -> Meter {
        self.meter.clone()
    }

    /// The artwork file `relative` names inside the data directory `data_dir`, for the Host's
    /// artwork protocol. The artwork store is not a service of its own, so this needs no instance.
    pub fn serve_artwork(data_dir: &Path, relative: &str) -> Option<ServedArtwork> {
        artwork::serve(data_dir, relative)
    }

    // ---- library ----

    /// Stops the Library, then deletes its database and artwork and creates an empty database. The
    /// caller restarts the app, and the next start rescans the directories.
    pub fn reset_library(&self) -> Result<(), CommandError> {
        if let Ok(library) = &self.library {
            library.shutdown();
        }
        crate::library::database::reset(&self.data_dir).map_err(|_| CommandError::PersistenceFailed)
    }

    /// Adds a directory. A path that is not valid Unicode is refused by the Library, not changed.
    pub fn add_directory(&self, path: PathBuf) -> Result<(), CommandError> {
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

    /// Deletes the Missing tracks from the Library. Never touches a source file.
    pub fn delete_missing_tracks(&self) -> Result<(), CommandError> {
        self.library()?.delete_missing_tracks()
    }

    pub fn start_scan(&self) -> Result<(), CommandError> {
        self.library()?.start_scan()
    }

    pub fn cancel_scan(&self) -> Result<(), CommandError> {
        self.library()?.cancel_scan()
    }

    pub fn list_tracks(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Page<TrackRow>, CommandError> {
        self.library()?.list_tracks(request)
    }

    pub fn list_albums(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Page<AlbumRow>, CommandError> {
        self.library()?.list_albums(request)
    }

    pub fn list_artists(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Page<ArtistRow>, CommandError> {
        self.library()?.list_artists(request)
    }

    /// The letter index of the Tracks list: how many names start under each label, in list order.
    pub fn track_index(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        self.library()?.track_index(request)
    }

    pub fn album_index(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        self.library()?.album_index(request)
    }

    pub fn artist_index(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        self.library()?.artist_index(request)
    }

    pub fn album_by_id(&self, album_id: AlbumId) -> Result<AlbumDetails, CommandError> {
        self.library()?.album(album_id)
    }

    pub fn album_tracks(&self, album_id: AlbumId) -> Result<Vec<AlbumTrackRow>, CommandError> {
        self.library()?.list_album_tracks(album_id)
    }

    pub fn artist(&self, artist_id: ArtistId) -> Result<ArtistRow, CommandError> {
        self.library()?.artist(artist_id)
    }

    pub fn artist_albums(
        &self,
        artist_id: ArtistId,
        request: &ListRequest<ArtistAlbumSortKey>,
    ) -> Result<Page<AlbumRow>, CommandError> {
        self.library()?.list_artist_albums(artist_id, request)
    }

    pub fn track_properties(&self, track_id: TrackId) -> Result<TrackProperties, CommandError> {
        self.library()?.track_properties(track_id)
    }

    /// The track's file, for the Host to show in Explorer.
    pub fn track_file(&self, track_id: TrackId) -> Result<PathBuf, CommandError> {
        let file = self.library()?.track_location(track_id)?.existing()?;
        Ok(file.path)
    }

    /// The accent color of the stored image at `path`, computed on first request and cached.
    pub fn artwork_accent(&self, path: &str) -> Result<Option<String>, CommandError> {
        self.library()?.artwork_accent(path)
    }

    // ---- lyrics ----

    /// Blocking: the host runs it on a blocking thread.
    pub fn track_lyrics(&self, track_id: TrackId) -> Result<Lyrics, CommandError> {
        let library = self.library()?;
        let track = library
            .playable_tracks(&[track_id])?
            .pop()
            .flatten()
            .ok_or(CommandError::TrackUnavailable)
            .inspect_err(|cause| log::warn!("app.lyrics.track_unavailable cause={cause}"))?;
        Ok(lyrics::load(&track))
    }

    // ---- appearance ----

    /// Applies a renderer update and returns the appearance as it is afterwards.
    pub fn appearance_update(&self, patch: &AppearancePatch) -> Versioned<Appearance> {
        self.settings.update_appearance(patch)
    }

    // ---- playback ----

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Blocking: the playback worker answers only once the source is loaded and the
    /// stream is running.
    pub fn play(
        &self,
        context: &PlaybackContext,
        start_track_id: Option<TrackId>,
    ) -> Result<Versioned<PlayerState>, CommandError> {
        let library = self.playback_library()?;
        let selection = match context {
            PlaybackContext::Album { album_id } => {
                library.playback_for_album_id(*album_id, start_track_id)
            }
            PlaybackContext::Tracks {
                search,
                sort,
                direction,
            } => library.playback_for_tracks(search.as_deref(), *sort, *direction, start_track_id),
        }?;
        // The track the listener picked is checked now, so they get a clear answer when its
        // file is gone; the others are read when the queue needs them.
        if let Some(requested) = start_track_id {
            library.playback_for_track(requested)?;
        }
        self.player
            .play_queue(selection.track_ids, selection.start_index)
    }

    pub fn pause(&self) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.pause()
    }

    pub fn resume(&self) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.resume()
    }

    pub fn previous(&self) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.previous()
    }

    pub fn next(&self) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.next()
    }

    pub fn seek(&self, position_ms: u64) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.seek(position_ms)
    }

    pub fn set_volume(&self, volume: f32) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.set_volume(volume)
    }

    pub fn set_muted(&self, muted: bool) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.set_muted(muted)
    }

    pub fn set_output_selection(
        &self,
        selection: AudioOutputSelection,
    ) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.set_output_selection(selection)
    }

    /// The output devices the system has. Blocking: the device query waits on the audio host.
    pub fn list_output_devices() -> Result<Vec<AudioOutputDevice>, CommandError> {
        crate::player::output::list_output_devices()
    }

    pub fn set_repeat_mode(&self, mode: RepeatMode) -> Result<Versioned<QueueState>, CommandError> {
        self.player.set_repeat_mode(mode)
    }

    pub fn set_shuffle(&self, enabled: bool) -> Result<Versioned<QueueState>, CommandError> {
        self.player.set_shuffle(enabled)
    }

    pub fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.player.remove_queue_item(id)
    }

    pub fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Versioned<QueueState>, CommandError> {
        self.player.move_queue_item(id, to)
    }

    /// Makes an upcoming queue item current and plays it.
    pub fn play_queue_item(&self, id: QueueItemId) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.play_queue_item(id)
    }

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `play`.
    pub fn enqueue_track(
        &self,
        track_id: TrackId,
        next: bool,
    ) -> Result<Versioned<QueueState>, CommandError> {
        let library = self.playback_library()?;
        let track = library.playback_for_track(track_id)?;
        self.player.enqueue(track.id(), next)
    }

    pub fn clear_queue(&self) -> Result<Versioned<QueueState>, CommandError> {
        self.player.clear_queue()
    }

    /// Puts back the queue the last replacement or Clear upcoming took away.
    pub fn restore_previous_queue(&self) -> Result<Versioned<PlayerState>, CommandError> {
        self.player.restore_previous_queue()
    }

    /// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
    /// snapshot does not carry.
    pub fn queue_window(&self, offset: u32, limit: u32) -> QueueWindow {
        self.player.queue_window(offset, limit)
    }

    // ---- private helpers ----

    fn library(&self) -> Result<&Library, CommandError> {
        self.library
            .as_ref()
            .inspect_err(|cause| log::warn!("app.library.unavailable cause={cause}"))
            .map_err(|_| CommandError::LibraryUnavailable)
    }

    fn playback_library(&self) -> Result<&Library, CommandError> {
        self.library
            .as_ref()
            .inspect_err(|cause| log::warn!("app.playback.library_unavailable cause={cause}"))
            .map_err(|_| CommandError::LibraryUnavailable)
    }
}
