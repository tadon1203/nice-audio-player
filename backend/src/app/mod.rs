//! The backend's composition root and its cross-domain use cases.

pub mod playback_context;

use crate::library::store::PlayableTrack;
use crate::{
    audio::{
        playback::{
            NoTracks, PlaybackQueueSnapshot, PlaybackService, PlaybackServiceError,
            PlaybackSnapshot, TrackResolver, TrackSource,
        },
        waveform::{PlaybackWaveform, Waveform, WaveformService},
    },
    library::{
        Library,
        error::{LibraryCommandError, StoreError},
        models::{LibraryScanSnapshot, LibraryStatus, LibraryUnavailableReason},
    },
    lyrics::{LyricsCommandError, LyricsResolution, LyricsService, model::LyricsTrackContext},
    messages::{
        BackendMessage, InitialState, SharedMessageSink, StateMessage, StateTopic, StateValue,
        Versioned,
    },
    settings::SettingsService,
};
use playback_context::{LibraryTracks, PlaybackContext};
use std::{path::PathBuf, sync::Arc};

#[derive(Debug)]
pub enum BackendError {
    PlaybackStartFailed,
}

pub struct BackendApp {
    pub playback: PlaybackService,
    /// The Library, or why it is unavailable.
    pub library: Result<Library, LibraryUnavailableReason>,
    pub waveforms: WaveformService,
    pub settings: Arc<SettingsService>,
    lyrics: LyricsService,
    data_dir: PathBuf,
}

impl BackendApp {
    /// Starts every service. `messages` is how they tell the host that something changed.
    pub fn initialize(
        data_dir: PathBuf,
        messages: SharedMessageSink,
    ) -> Result<Self, BackendError> {
        let settings = Arc::new(SettingsService::load(data_dir.clone(), messages.clone()));
        let library_dir = data_dir.clone();
        let waveforms = WaveformService::start(data_dir.join("waveforms"), messages.clone());
        let library = Library::open(library_dir, messages.clone());
        let remember = Arc::clone(&settings);
        let tracks: Box<dyn TrackSource> = match &library {
            Ok(library) => Box::new(LibraryTracks(library.store().clone())),
            Err(_) => Box::new(NoTracks),
        };
        let playback = PlaybackService::start(
            messages,
            settings.get().playback,
            Arc::new(move |preferences| remember.record_playback(preferences)),
            Arc::new(TrackResolver::new(tracks)),
            waveforms.prefetcher(),
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

    /// Asks for the library database to be moved to a `.bak` file and recreated, which happens at
    /// the next start (the caller restarts the app). The tracks are found again by the rescan that
    /// start-up does.
    pub fn request_library_reset(&self) -> Result<(), LibraryCommandError> {
        crate::library::database::request_reset(&self.data_dir).map_err(|cause| {
            log::error!("library.database.reset_request_failed cause={cause}");
            LibraryCommandError::PersistenceFailed
        })
    }

    pub fn library_status(&self) -> LibraryStatus {
        match &self.library {
            Ok(_) => LibraryStatus::Ready,
            Err(reason) => LibraryStatus::Unavailable {
                reason: reason.clone(),
            },
        }
    }

    fn library_scan(&self) -> Versioned<LibraryScanSnapshot> {
        self.library.as_ref().map_or_else(
            |_| Versioned::new(LibraryScanSnapshot::idle()),
            Library::scan_state,
        )
    }

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

    /// The loaded track's waveform with the Waveform's revision. The revision is read first, so
    /// the value is at least as new as the revision.
    fn versioned_waveform(&self) -> Versioned<Option<PlaybackWaveform>> {
        let revision = self.waveforms.revision();
        Versioned {
            revision,
            value: self.ready_playback_waveform(),
        }
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

    /// Like [`Self::playback_waveform`], but only reports a waveform that is already there.
    pub fn ready_playback_waveform(&self) -> Option<PlaybackWaveform> {
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

    /// Blocking: the host runs it on a blocking thread.
    pub fn resolve_lyrics(&self, track_id: String) -> Result<LyricsResolution, LyricsCommandError> {
        let library = self
            .library
            .as_ref()
            .map_err(|_| LyricsCommandError::LibraryUnavailable)?;
        // The Library says where the file is; lyrics reads what is beside and inside it.
        let file = library
            .store()
            .track_location(&track_id)
            .map_err(map_lyrics_context_error)?
            .existing()
            .map_err(|_| LyricsCommandError::TrackUnavailable)?;
        Ok(self.lyrics.resolve(LyricsTrackContext {
            track_id,
            source: file.path,
            root: file.root,
        }))
    }

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Blocking: the playback worker answers only once the source is loaded and the
    /// stream is running.
    pub fn start_playback(
        &self,
        context: &PlaybackContext,
        start_track_id: Option<&str>,
    ) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
        let library = self
            .library
            .as_ref()
            .map_err(|_| PlaybackServiceError::LibraryUnavailable)?;
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

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `start_playback`.
    pub fn enqueue_track(
        &self,
        track_id: &str,
        next: bool,
    ) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
        let library = self
            .library
            .as_ref()
            .map_err(|_| PlaybackServiceError::LibraryUnavailable)?;
        let track = playback_context::resolve_track(library.store(), track_id)?;
        self.playback.handle().enqueue(vec![track.track_id], next)
    }

    pub fn shutdown(&self) {
        self.playback.shutdown();
        if let Ok(library) = &self.library {
            library.shutdown();
        }
        self.settings.shutdown();
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
        StoreError::InvalidId => LyricsCommandError::InvalidId,
        StoreError::TrackNotFound => LyricsCommandError::TrackNotFound,
        StoreError::TrackUnavailable => LyricsCommandError::TrackUnavailable,
        _ => LyricsCommandError::PersistenceFailed,
    }
}
