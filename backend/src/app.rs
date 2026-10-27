//! The Backend's composition root and its cross-area use cases. The Host reaches the Backend only
//! through `BackendApp` and the area objects it hands out: `Player`, `Library`, `SettingsStore`
//! and `Meter`.

#[cfg(test)]
mod tests;

/// "Play from here": the contexts a playback queue can be built from.
///
/// Every way of starting library playback is a variant of `PlaybackContext`, so a new one
/// (artist, playlist, smart playlist) adds a variant, not a new command.
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackContext {
    /// An album in disc and track order, by its ID.
    Album { album_id: AlbumId },
    /// The tracks list as currently filtered and sorted.
    Tracks {
        search: Option<String>,
        sort: TrackSortKey,
        direction: SortDirection,
    },
}

// The types the Host names in commands and state. Each one is defined in the module that owns it.
pub use crate::library::read::albums::{
    AlbumDetails, AlbumListItem, AlbumSortKey, AlbumTrackListItem, ArtistAlbumSortKey,
};
pub use crate::library::read::artists::{ArtistListItem, ArtistSortKey};
pub use crate::library::read::artwork::{ArtworkRef, ServedArtwork};
pub use crate::library::read::lists::{LetterIndexEntry, ListRequest, Page, SortDirection};
pub use crate::library::read::tracks::{TrackListItem, TrackProperties, TrackSortKey};
pub use crate::library::sync::state::LibraryDirectory;
pub use crate::library::{Library, LibraryStatus};
pub use crate::player::audio::output::{AudioOutputDevice, AudioOutputSelection};
pub use crate::player::audio::output::{CpalOutput, OutputStreamFactory};
pub use crate::player::lyrics::Lyrics;
pub use crate::player::meter::{Meter, MeterFrame};
pub use crate::player::playback::volume::NormalizedVolume;
pub use crate::player::{
    PlaybackPosition, Player, PlayerState, QueueState, QueueWindow, RepeatMode, UPCOMING_WINDOW,
};
pub use crate::settings::{Appearance, AppearancePatch, SettingsStore};

use crate::ids::{AlbumId, TrackId};
use crate::library::errors::LibraryError;
use crate::library::read::artwork;
use crate::messages::BackendMessage;
use crate::player::audio::waveform::Waveforms;
use crate::player::lyrics;
use crate::settings;
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

    /// Stops the player, the Library and the settings writer, in that order.
    pub fn shutdown(&self) {
        self.player.shutdown();
        self.library.shutdown();
        self.settings.shutdown();
    }

    /// The directory that holds the Library database, the artwork store and the settings file.
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// The player: its queue, its transport, its output and its volume.
    pub fn player(&self) -> &Player {
        &self.player
    }

    /// The Library. It answers `LibraryUnavailable` when its database did not open.
    pub fn library(&self) -> Result<&Library> {
        if self.library.is_available() {
            Ok(&self.library)
        } else {
            Err(LibraryError::LibraryUnavailable.into())
        }
    }

    /// The settings store: the appearance and the player preferences.
    pub fn settings(&self) -> &SettingsStore {
        &self.settings
    }

    /// The Meter that measures the output, for the Renderer's meter subscription.
    pub fn meter(&self) -> &Meter {
        &self.meter
    }

    /// The artwork file `relative` names inside the data directory `data_dir`, for the Host's
    /// artwork protocol. The artwork store is not a service of its own, so this needs no instance.
    pub fn serve_artwork(data_dir: &Path, relative: &str) -> Option<ServedArtwork> {
        artwork::serve_artwork(data_dir, relative)
    }

    /// Stops the Library, then deletes its database and artwork and creates an empty database. The
    /// caller restarts the app, and the next start rescans the directories.
    pub fn reset_library(&self) -> Result<()> {
        self.library.shutdown();
        Ok(crate::library::storage::reset_database_files(
            &self.data_dir,
        )?)
    }

    // ---- lyrics ----

    /// Blocking: the host runs it on a blocking thread.
    pub fn track_lyrics(&self, track_id: TrackId) -> Result<Lyrics> {
        let library = self.library()?;
        let track = library
            .playable_tracks(&[track_id])?
            .pop()
            .flatten()
            .ok_or(LibraryError::TrackUnavailable)?;
        Ok(lyrics::load(&track))
    }

    // ---- playback ----

    /// Replaces the queue with `context` and plays from `start_track_id` (its first track when
    /// `None`). Returns once the track's start has begun; the load and the stream follow.
    pub fn play(&self, context: &PlaybackContext, start_track_id: Option<TrackId>) -> Result<()> {
        let library = self.library()?;
        let selection = match context {
            PlaybackContext::Album { album_id } => {
                library.playback_for_album(*album_id, start_track_id)
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

    /// Adds a library track to the queue: right after the current one (`next`) or at the end.
    /// Blocking, like `play`.
    pub fn enqueue_track(&self, track_id: TrackId, next: bool) -> Result<()> {
        let library = self.library()?;
        let track = library.playback_for_track(track_id)?;
        Ok(self.player.enqueue(track.id(), next)?)
    }
}
