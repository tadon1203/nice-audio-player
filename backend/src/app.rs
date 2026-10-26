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
pub use crate::meter::{Meter, MeterFrame};
pub use crate::player::output::{AudioOutputDevice, AudioOutputSelection};
pub use crate::player::output::{CpalOutput, OutputStreamFactory};
pub use crate::player::volume::NormalizedVolume;
pub use crate::player::{
    PlaybackPosition, PlayerState, QueueState, QueueWindow, RepeatMode, UPCOMING_WINDOW,
};
pub use crate::settings::{Appearance, AppearancePatch};

use crate::ids::{AlbumId, ArtistId, DirectoryId, QueueItemId, TrackId};
use crate::library::errors::LibraryError;
use crate::library::{
    Library,
    artwork::{self},
};
use crate::lyrics;
use crate::messages::BackendMessage;
use crate::player::{Player, waveform::Waveforms};
use crate::settings::{self, SettingsStore};
use anyhow::Result;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, mpsc::Sender},
};

pub struct BackendApp {
    player: Player,
    meter: Meter,
    library: Library,
    settings: Arc<SettingsStore>,
    data_dir: PathBuf,
}

impl BackendApp {
    /// Starts every service on `output`: `CpalOutput` in the Host, a fake device in tests.
    /// `messages` is the channel the services send their state and events on, to the Host.
    pub fn new(
        data_dir: PathBuf,
        messages: Sender<BackendMessage>,
        output: Box<dyn OutputStreamFactory>,
    ) -> Self {
        let saved = settings::read(&settings::file_path(&data_dir));
        let settings = Arc::new(SettingsStore::open(
            settings::file_path(&data_dir),
            saved,
            messages.clone(),
        ));
        let waveforms = Arc::new(Waveforms::start(
            data_dir.join("waveforms"),
            messages.clone(),
        ));
        let library = Library::start(&data_dir, &messages);
        let meter = Meter::new();
        let player = Player::start(
            Arc::new(library.clone()),
            messages,
            meter.clone(),
            Arc::clone(&waveforms),
            Arc::clone(&settings),
            output,
        );
        Self {
            player,
            meter,
            library,
            settings,
            data_dir,
        }
    }

    pub fn shutdown(&self) {
        self.player.shutdown();
        self.library.shutdown();
        self.settings.shutdown();
    }

    // ---- communication ----

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
    pub fn reset_library(&self) -> Result<()> {
        self.library.shutdown();
        Ok(crate::library::database::reset(&self.data_dir)?)
    }

    /// Adds a directory. A path that is not valid Unicode is refused by the Library, not changed.
    pub fn add_directory(&self, path: PathBuf) -> Result<()> {
        Ok(self.library.add_directory(path)?)
    }

    pub fn set_directory_enabled(&self, id: DirectoryId, enabled: bool) -> Result<()> {
        Ok(self.library.set_directory_enabled(id, enabled)?)
    }

    pub fn remove_directory(&self, id: DirectoryId) -> Result<()> {
        Ok(self.library.remove_directory(id)?)
    }

    /// Deletes the Missing tracks from the Library. Never touches a source file.
    pub fn delete_missing_tracks(&self) -> Result<()> {
        Ok(self.library.delete_missing_tracks()?)
    }

    pub fn start_scan(&self) -> Result<()> {
        Ok(self.library.start_scan()?)
    }

    pub fn cancel_scan(&self) -> Result<()> {
        Ok(self.library.cancel_scan()?)
    }

    pub fn list_tracks(&self, request: &ListRequest<TrackSortKey>) -> Result<Page<TrackRow>> {
        Ok(self.library.list_tracks(request)?)
    }

    pub fn list_albums(&self, request: &ListRequest<AlbumSortKey>) -> Result<Page<AlbumRow>> {
        Ok(self.library.list_albums(request)?)
    }

    pub fn list_artists(&self, request: &ListRequest<ArtistSortKey>) -> Result<Page<ArtistRow>> {
        Ok(self.library.list_artists(request)?)
    }

    /// The letter index of the Tracks list: how many names start under each label, in list order.
    pub fn track_index(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        Ok(self.library.track_index(request)?)
    }

    pub fn album_index(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        Ok(self.library.album_index(request)?)
    }

    pub fn artist_index(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        Ok(self.library.artist_index(request)?)
    }

    pub fn album_by_id(&self, album_id: AlbumId) -> Result<AlbumDetails> {
        Ok(self.library.album(album_id)?)
    }

    pub fn album_tracks(&self, album_id: AlbumId) -> Result<Vec<AlbumTrackRow>> {
        Ok(self.library.list_album_tracks(album_id)?)
    }

    pub fn artist(&self, artist_id: ArtistId) -> Result<ArtistRow> {
        Ok(self.library.artist(artist_id)?)
    }

    pub fn artist_albums(
        &self,
        artist_id: ArtistId,
        request: &ListRequest<ArtistAlbumSortKey>,
    ) -> Result<Page<AlbumRow>> {
        Ok(self.library.list_artist_albums(artist_id, request)?)
    }

    pub fn track_properties(&self, track_id: TrackId) -> Result<TrackProperties> {
        Ok(self.library.track_properties(track_id)?)
    }

    /// The track's file, for the Host to show in Explorer.
    pub fn track_file(&self, track_id: TrackId) -> Result<PathBuf> {
        let file = self.library.track_location(track_id)?.existing()?;
        Ok(file.path)
    }

    /// The accent color of the stored image at `path`, computed on first request and cached.
    pub fn artwork_accent(&self, path: &str) -> Result<Option<String>> {
        Ok(self.library.artwork_accent(path)?)
    }

    // ---- lyrics ----

    /// Blocking: the host runs it on a blocking thread.
    pub fn track_lyrics(&self, track_id: TrackId) -> Result<Lyrics> {
        let library = &self.library;
        let track = library
            .playable_tracks(&[track_id])?
            .pop()
            .flatten()
            .ok_or(LibraryError::TrackUnavailable)?;
        Ok(lyrics::load(&track))
    }

    // ---- appearance ----

    /// Applies a renderer update. The Appearance is sent when it changed.
    pub fn appearance_update(&self, patch: &AppearancePatch) {
        self.settings.update_appearance(patch);
    }

    // ---- playback ----

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Returns once the track's start has begun; the load and the stream follow.
    pub fn play(&self, context: &PlaybackContext, start_track_id: Option<TrackId>) -> Result<()> {
        let library = &self.library;
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
        Ok(self
            .player
            .play_queue(selection.track_ids, selection.start_index)?)
    }

    pub fn pause(&self) -> Result<()> {
        Ok(self.player.pause()?)
    }

    pub fn resume(&self) -> Result<()> {
        Ok(self.player.resume()?)
    }

    pub fn previous(&self) -> Result<()> {
        Ok(self.player.previous()?)
    }

    pub fn next(&self) -> Result<()> {
        Ok(self.player.next()?)
    }

    pub fn seek(&self, position_ms: u64) -> Result<()> {
        Ok(self.player.seek(position_ms)?)
    }

    pub fn set_volume(&self, volume: NormalizedVolume) -> Result<()> {
        Ok(self.player.set_volume(volume)?)
    }

    pub fn set_muted(&self, muted: bool) -> Result<()> {
        Ok(self.player.set_muted(muted)?)
    }

    pub fn set_output_selection(&self, selection: AudioOutputSelection) -> Result<()> {
        Ok(self.player.set_output_selection(selection)?)
    }

    /// The output devices the system has. Blocking: the device query waits on the audio host.
    pub fn list_output_devices() -> Result<Vec<AudioOutputDevice>> {
        Ok(crate::player::output::list_output_devices()?)
    }

    pub fn set_repeat_mode(&self, mode: RepeatMode) -> Result<()> {
        Ok(self.player.set_repeat_mode(mode)?)
    }

    pub fn set_shuffle(&self, enabled: bool) -> Result<()> {
        Ok(self.player.set_shuffle(enabled)?)
    }

    pub fn remove_queue_item(&self, id: QueueItemId) -> Result<()> {
        Ok(self.player.remove_queue_item(id)?)
    }

    pub fn move_queue_item(&self, id: QueueItemId, to: usize) -> Result<()> {
        Ok(self.player.move_queue_item(id, to)?)
    }

    /// Makes an upcoming queue item current and plays it.
    pub fn play_queue_item(&self, id: QueueItemId) -> Result<()> {
        Ok(self.player.play_queue_item(id)?)
    }

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `play`.
    pub fn enqueue_track(&self, track_id: TrackId, next: bool) -> Result<()> {
        let library = &self.library;
        let track = library.playback_for_track(track_id)?;
        Ok(self.player.enqueue(track.id(), next)?)
    }

    pub fn clear_queue(&self) -> Result<()> {
        Ok(self.player.clear_queue()?)
    }

    /// Puts back the queue the last replacement or Clear upcoming took away.
    pub fn restore_previous_queue(&self) -> Result<()> {
        Ok(self.player.restore_previous_queue()?)
    }

    /// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
    /// state does not carry.
    pub fn queue_window(&self, offset: u32, limit: u32) -> Result<QueueWindow> {
        Ok(self.player.queue_window(offset, limit)?)
    }
}
