//! The Backend's composition root and its cross-domain use cases. The Host calls `BackendApp` and
//! nothing else: each method is one use case, and its services stay behind it.

mod playback_context;
#[cfg(test)]
mod tests;

pub use playback_context::PlaybackContext;

use crate::audio::{
    devices::{self, AudioDeviceListError, AudioOutputDevice, AudioOutputSelection},
    meter::MeterHub,
    output::{CpalBackend, OutputBackend},
    playback::{
        NoTracks, PlaybackQueueSnapshot, PlaybackQueueWindow, PlaybackRepeatMode, PlaybackService,
        PlaybackServiceError, PlaybackSnapshot, TrackResolver, TrackSource,
    },
    waveform::{PlaybackWaveform, Waveform, WaveformService},
};
use crate::ids::{ArtworkHash, QueueItemId, RootId, TrackId};
use crate::library::{
    Library,
    artwork::{self, ServedArtwork},
    error::{LibraryCommandError, StoreError},
    models::{
        LibraryAlbumArtistKey, LibraryAlbumArtistPage, LibraryAlbumArtistSortKey,
        LibraryAlbumArtistSummary, LibraryAlbumDetails, LibraryAlbumKey, LibraryAlbumPage,
        LibraryAlbumSortKey, LibraryAlbumTrackPage, LibraryArtistAlbumSortKey, LibraryIndexBucket,
        LibraryRoot, LibrarySortDirection, LibraryStatus, LibraryTrackPage, LibraryTrackProperties,
        LibraryTrackSortKey, LibraryUnavailableReason,
    },
    store::PlayableTrack,
};
use crate::lyrics::{
    LyricsCommandError, LyricsResolution, LyricsService, model::LyricsTrackContext,
};
use crate::messages::{
    BackendMessage, InitialState, SharedMessageSink, StateMessage, StateTopic, StateValue,
    Versioned,
};
use crate::settings::{Appearance, AppearancePatch, SettingsService};
use playback_context::LibraryTracks;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Debug)]
pub enum BackendError {
    PlaybackStartFailed,
}

pub struct BackendApp {
    playback: PlaybackService,
    /// The Library, or why it is unavailable.
    library: Result<Library, LibraryUnavailableReason>,
    waveforms: WaveformService,
    settings: Arc<SettingsService>,
    lyrics: LyricsService,
    data_dir: PathBuf,
}

impl BackendApp {
    /// Starts every service with the platform's audio output. `messages` is how they tell the
    /// host that something changed.
    pub fn initialize(
        data_dir: PathBuf,
        messages: SharedMessageSink,
    ) -> Result<Self, BackendError> {
        Self::start(data_dir, messages, Box::new(CpalBackend))
    }

    /// Like `initialize`, with a fake output device instead of the platform's.
    #[cfg(test)]
    pub(crate) fn initialize_for_tests(data_dir: PathBuf, messages: SharedMessageSink) -> Self {
        Self::start(
            data_dir,
            messages,
            Box::new(crate::audio::fake_output::FakeOutput::new()),
        )
        .expect("the test backend starts")
    }

    fn start(
        data_dir: PathBuf,
        messages: SharedMessageSink,
        output: Box<dyn OutputBackend>,
    ) -> Result<Self, BackendError> {
        let settings = Arc::new(SettingsService::load(data_dir.clone(), messages.clone()));
        let waveforms = WaveformService::start(data_dir.join("waveforms"), messages.clone());
        let library = Library::open(data_dir.clone(), messages.clone());
        let remember = Arc::clone(&settings);
        let tracks: Box<dyn TrackSource> = match &library {
            Ok(library) => Box::new(LibraryTracks(library.store().clone())),
            Err(_) => Box::new(NoTracks),
        };
        let playback = PlaybackService::start_with_backend(
            messages,
            settings.playback_preferences(),
            Arc::new(move |preferences| remember.record_playback(preferences)),
            Arc::new(TrackResolver::new(tracks)),
            waveforms.prefetcher(),
            output,
        )
        .map_err(|_| BackendError::PlaybackStartFailed)?;
        Ok(Self {
            playback,
            library,
            waveforms,
            settings,
            lyrics: LyricsService,
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

    /// The current value of every state topic, each with its revision.
    pub fn initial_state(&self) -> InitialState {
        InitialState {
            playback: self.playback.versioned_snapshot(),
            queue: self.playback.versioned_queue_snapshot(),
            library_scan: self.library_scan(),
            waveform: self.versioned_waveform(),
            appearance: self.settings.appearance(),
        }
    }

    /// The message that carries the current value of `topic`.
    pub fn state_message(&self, topic: StateTopic) -> Option<BackendMessage> {
        Some(match topic {
            StateTopic::Playback => {
                let playback = self.playback.versioned_snapshot();
                state(
                    playback.revision,
                    StateValue::Playback(Box::new(playback.value)),
                )
            }
            StateTopic::Queue => {
                let queue = self.playback.versioned_queue_snapshot();
                state(queue.revision, StateValue::Queue(queue.value))
            }
            StateTopic::LibraryScan => {
                let scan = self.library_scan();
                state(scan.revision, StateValue::LibraryScan(scan.value))
            }
            StateTopic::Waveform => {
                let waveform = self.versioned_waveform();
                state(waveform.revision, StateValue::Waveform(waveform.value))
            }
            StateTopic::Appearance => {
                let appearance = self.settings.appearance();
                state(
                    appearance.revision,
                    StateValue::Appearance(appearance.value),
                )
            }
        })
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

    /// Asks for the library database to be moved to a `.bak` file and recreated, which happens at
    /// the next start (the caller restarts the app). The tracks are found again by the rescan that
    /// start-up does.
    pub fn request_library_reset(&self) -> Result<(), LibraryCommandError> {
        crate::library::database::request_reset(&self.data_dir).map_err(|cause| {
            log::error!("library.database.reset_request_failed cause={cause}");
            LibraryCommandError::PersistenceFailed
        })
    }

    pub fn library_roots(&self) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
        self.library()?.roots()
    }

    /// Registers a folder as a root. A path that is not valid Unicode cannot be stored, so it is
    /// refused rather than changed.
    pub fn register_library_root(&self, path: PathBuf) -> Result<LibraryRoot, LibraryCommandError> {
        let path = path
            .into_os_string()
            .into_string()
            .map_err(|_| LibraryCommandError::InvalidRoot)?;
        self.library()?.register_root(path)
    }

    pub fn set_library_root_enabled(
        &self,
        id: RootId,
        enabled: bool,
    ) -> Result<LibraryRoot, LibraryCommandError> {
        self.library()?.set_root_enabled(id, enabled)
    }

    pub fn remove_library_root(&self, id: RootId) -> Result<(), LibraryCommandError> {
        self.library()?.remove_root(id)
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
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
        skip: u64,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_tracks_from(
            cursor,
            skip,
            search,
            sort_key,
            sort_direction,
        )?)
    }

    pub fn list_albums(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        sort_direction: LibrarySortDirection,
        skip: u64,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_albums_from(
            cursor,
            skip,
            search,
            sort_key,
            sort_direction,
        )?)
    }

    pub fn list_album_artists(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        sort_direction: LibrarySortDirection,
        skip: u64,
    ) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_album_artists_from(
            cursor,
            skip,
            search,
            sort_key,
            sort_direction,
        )?)
    }

    /// The scroll index of the Tracks list: how many names start under each label, in list order.
    pub fn track_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_track_index(search, sort_key, sort_direction)?)
    }

    pub fn album_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_album_index(search, sort_key, sort_direction)?)
    }

    pub fn album_artist_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_album_artist_index(search, sort_key, sort_direction)?)
    }

    pub fn album(
        &self,
        album_key: LibraryAlbumKey,
    ) -> Result<LibraryAlbumDetails, LibraryCommandError> {
        Ok(self.library()?.store().catalog_album_details(album_key)?)
    }

    pub fn album_tracks(
        &self,
        album_key: LibraryAlbumKey,
        cursor: Option<&str>,
    ) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
        Ok(self
            .library()?
            .store()
            .catalog_album_tracks(album_key, cursor)?)
    }

    pub fn artist(
        &self,
        artist_key: LibraryAlbumArtistKey,
    ) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
        Ok(self.library()?.store().catalog_artist(artist_key)?)
    }

    pub fn artist_albums(
        &self,
        artist_key: LibraryAlbumArtistKey,
        cursor: Option<&str>,
        sort_key: LibraryArtistAlbumSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        Ok(self.library()?.store().catalog_artist_albums(
            artist_key,
            cursor,
            sort_key,
            sort_direction,
        )?)
    }

    pub fn track_properties(
        &self,
        track_id: TrackId,
    ) -> Result<Option<LibraryTrackProperties>, LibraryCommandError> {
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
            .map_err(|_| LyricsCommandError::LibraryUnavailable)?;
        // The Library says where the file is; lyrics reads what is beside and inside it.
        let file = library
            .store()
            .track_location(track_id)
            .map_err(map_lyrics_context_error)?
            .existing()
            .map_err(|_| LyricsCommandError::TrackUnavailable)?;
        Ok(self.lyrics.resolve(LyricsTrackContext {
            track_id,
            source: file.path,
            root: file.root,
        }))
    }

    // ---- appearance ----

    /// Applies a renderer update and returns the appearance as it is afterwards.
    pub fn update_appearance(&self, patch: &AppearancePatch) -> Versioned<Appearance> {
        self.settings.update_appearance(patch)
    }

    // ---- playback ----

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Blocking: the playback worker answers only once the source is loaded and the
    /// stream is running.
    pub fn start_playback(
        &self,
        context: &PlaybackContext,
        start_track_id: Option<TrackId>,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
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

    pub fn pause(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().pause()
    }

    pub fn resume(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().resume()
    }

    pub fn previous(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().previous()
    }

    pub fn next(&self) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().next()
    }

    /// Seeks to `position_ms`, a whole number of milliseconds the caller has already clamped to
    /// the track's range.
    pub fn seek(
        &self,
        position_ms: f64,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().seek(position_ms as u64)
    }

    pub fn set_volume(
        &self,
        volume: f32,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().set_volume(volume)
    }

    pub fn set_muted(
        &self,
        muted: bool,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
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
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().set_output_selection(selection)
    }

    /// The output devices the system has. Blocking: the device query waits on the audio host.
    pub fn list_output_devices(&self) -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
        devices::list_output_devices()
    }

    pub fn set_repeat_mode(
        &self,
        mode: PlaybackRepeatMode,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.playback.handle().set_repeat_mode(mode)
    }

    pub fn set_shuffle(
        &self,
        enabled: bool,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.playback.handle().set_shuffle(enabled)
    }

    pub fn remove_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.playback.handle().remove_queue_item(id)
    }

    pub fn move_queue_item(
        &self,
        id: QueueItemId,
        to: usize,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.playback.handle().move_queue_item(id, to)
    }

    /// Makes an upcoming queue item current and plays it.
    pub fn play_queue_item(
        &self,
        id: QueueItemId,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().play_queue_item(id)
    }

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `start_playback`.
    pub fn enqueue_track(
        &self,
        track_id: TrackId,
        next: bool,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        let library = self.playback_library()?;
        let track = playback_context::resolve_track(library.store(), track_id)?;
        self.playback.handle().enqueue(vec![track.track_id], next)
    }

    pub fn clear_queue(&self) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        self.playback.handle().clear_queue()
    }

    /// Puts back the queue the last replacement or Clear upcoming took away.
    pub fn restore_previous_queue(
        &self,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        self.playback.handle().restore_previous_queue()
    }

    /// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
    /// snapshot does not carry.
    pub fn queue_window(&self, offset: u32, limit: u32) -> PlaybackQueueWindow {
        self.playback
            .handle()
            .queue_window(offset as usize, limit as usize)
    }

    /// Waveform of the track that is loaded right now, with the Waveform's revision; `None` while
    /// it is still being analyzed (it is requested, and a Waveform message follows) or nothing is
    /// loaded. The renderer never names a file, so it cannot make the backend read arbitrary ones.
    pub fn playback_waveform(&self) -> Versioned<Option<PlaybackWaveform>> {
        let revision = self.waveforms.revision();
        Versioned {
            revision,
            value: self.loaded_waveform(|track| self.waveforms.get_or_queue(track)),
        }
    }

    // ---- private helpers ----

    fn library(&self) -> Result<&Library, LibraryCommandError> {
        self.library
            .as_ref()
            .map_err(|_| LibraryCommandError::LibraryUnavailable)
    }

    fn playback_library(&self) -> Result<&Library, PlaybackServiceError> {
        self.library
            .as_ref()
            .map_err(|_| PlaybackServiceError::LibraryUnavailable)
    }

    fn library_scan(&self) -> Versioned<crate::library::models::LibraryScanSnapshot> {
        self.library.as_ref().map_or_else(
            |_| Versioned::new(crate::library::models::LibraryScanSnapshot::idle()),
            Library::scan_state,
        )
    }

    /// The waveform of the loaded track, with the Waveform's revision. The revision is read first,
    /// so the value is at least as new as the revision.
    fn versioned_waveform(&self) -> Versioned<Option<PlaybackWaveform>> {
        let revision = self.waveforms.revision();
        Versioned {
            revision,
            value: self.ready_playback_waveform(),
        }
    }

    /// Like [`Self::playback_waveform`], but only reports a waveform that is already there.
    fn ready_playback_waveform(&self) -> Option<PlaybackWaveform> {
        self.loaded_waveform(|track| self.waveforms.get(&track.file))
    }

    /// The waveform of the loaded track, always paired with that track's playback id from the
    /// same snapshot, so the two cannot disagree.
    fn loaded_waveform(
        &self,
        find: impl FnOnce(&PlayableTrack) -> Option<Arc<Waveform>>,
    ) -> Option<PlaybackWaveform> {
        let snapshot = self.playback.snapshot();
        let session = snapshot.session()?;
        let waveform = find(&session.item.track)?;
        Some(PlaybackWaveform {
            playback_id: session.playback_id.clone(),
            peaks: waveform.peaks.clone(),
            rms: waveform.rms.clone(),
        })
    }
}

fn state(revision: u64, value: StateValue) -> BackendMessage {
    BackendMessage::State(StateMessage {
        revision,
        state: value,
    })
}

fn map_lyrics_context_error(error: StoreError) -> LyricsCommandError {
    match error {
        StoreError::TrackNotFound => LyricsCommandError::TrackNotFound,
        StoreError::TrackUnavailable => LyricsCommandError::TrackUnavailable,
        _ => LyricsCommandError::PersistenceFailed,
    }
}
