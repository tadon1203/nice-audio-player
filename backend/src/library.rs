//! The Library: the indexed set of tracks from the Library directories.
//!
//! `Library::start` always yields a Library. One that could not open its database is unavailable:
//! it answers every command with `LibraryUnavailable`. A working Library has two sides that meet
//! only in the database: the read side (`read`: the lists, Playback selections, track location) and
//! the write side (`sync`: the directories, their watchers, and the scan). `Library` is the one
//! entry point to both. Its methods only delegate.

pub mod errors;
pub(crate) mod read;
pub(crate) mod storage;
pub(crate) mod sync;

use crate::ids::{AlbumId, ArtistId, DirectoryId, TrackId};
use crate::library::errors::LibraryError;
use crate::library::errors::Result;
use crate::library::read::albums::{
    AlbumDetails, AlbumListItem, AlbumSortKey, AlbumTrackListItem, ArtistAlbumSortKey,
    album_details, album_listing, album_row, album_track_listing, album_track_row,
    artist_album_listing,
};
use crate::library::read::artists::{
    ArtistListItem, ArtistSortKey, artist_by_id, artist_listing, artist_row,
};
use crate::library::read::artwork::{artwork_accent, hash_of_original};
use crate::library::read::lists::{LetterIndexEntry, ListRequest, Listing, Page, SortDirection};
use crate::library::read::playback::{
    PlayableTrack, PlaybackSelection, playable_tracks, playback_for_album, playback_for_track,
    playback_for_tracks,
};
use crate::library::read::tracks::{
    TrackListItem, TrackProperties, TrackSortKey, track_listing, track_location, track_properties,
    track_row,
};
use crate::library::storage::version::LibraryVersion;
use crate::library::storage::{Database, ReadConnection};
use crate::library::sync::SyncHandle;
#[cfg(test)]
use crate::library::sync::directories::list_directories;
use crate::library::sync::state::LibraryState;
use crate::messages::{self, BackendMessage};
use log::error;
use rusqlite::Row;
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, mpsc::Sender},
};

/// Whether the Library is usable. It is unavailable only when its database cannot be opened: any
/// other database is replaced at open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum LibraryStatus {
    Ready,
    Unavailable,
}

#[derive(Clone)]
pub struct Library {
    database: Database,
    sync: Arc<SyncHandle>,
    /// See [`Library::version`]. Shared with the sync worker and the scan thread, which advance it
    /// after each commit that alters a list.
    version: Arc<LibraryVersion>,
}

impl Library {
    /// The Library of the data directory `directory`, always: when its database cannot be opened,
    /// the cause is logged, the Unavailable state is sent, and the Library that returns fails
    /// every command with `LibraryUnavailable`. No worker runs in that case, so the state is sent
    /// here.
    pub(crate) fn start(directory: &Path, host: &Sender<BackendMessage>) -> Self {
        Self::open(directory, host.clone()).unwrap_or_else(|cause| {
            error!("library.open_failed cause={cause}");
            messages::send(
                host,
                BackendMessage::Library(LibraryState::empty(LibraryStatus::Unavailable)),
            );
            Self {
                database: Database::unavailable(),
                sync: Arc::new(SyncHandle::Unavailable),
                version: Arc::new(LibraryVersion::default()),
            }
        })
    }

    /// Opens the Library in `directory`: opens its database (see `Database::open`), then
    /// starts watching and scanning the registered directories.
    fn open(directory: &Path, host: Sender<BackendMessage>) -> Result<Self> {
        let database = Database::open(directory)?;
        let version = Arc::new(LibraryVersion::default());
        let sync = SyncHandle::start(database.clone(), host, Arc::clone(&version));
        Ok(Self {
            database,
            sync: Arc::new(sync),
            version,
        })
    }

    /// Whether the database opened. An unavailable Library fails every command.
    pub fn is_available(&self) -> bool {
        self.database.is_usable()
    }

    /// The current [`LibraryVersion`].
    pub(crate) fn version(&self) -> u64 {
        self.version.get()
    }

    fn read(&self) -> Result<ReadConnection> {
        self.database.read()
    }

    #[cfg(test)]
    pub(crate) fn directories(&self) -> Result<Vec<crate::library::sync::state::LibraryDirectory>> {
        let connection = self.read()?;
        list_directories(&connection)
    }

    /// Adds a directory. A path that is not valid Unicode cannot be stored, so it is refused rather
    /// than changed.
    pub fn add_directory(&self, path: PathBuf) -> Result<()> {
        let Ok(path) = path.into_os_string().into_string() else {
            return Err(LibraryError::InvalidDirectory(None));
        };
        self.sync.add_directory(path)
    }

    pub fn set_directory_enabled(&self, id: DirectoryId, enabled: bool) -> Result<()> {
        self.sync.set_directory_enabled(id, enabled)
    }

    pub fn remove_directory(&self, id: DirectoryId) -> Result<()> {
        self.sync.remove_directory(id)
    }

    /// Deletes every Missing track from the Library. Source files are never touched.
    pub fn delete_missing_tracks(&self) -> Result<()> {
        self.sync.delete_missing_tracks()
    }

    pub fn start_scan(&self) -> Result<()> {
        self.sync.start_scan()
    }

    pub fn cancel_scan(&self) -> Result<()> {
        self.sync.cancel_scan()
    }

    /// The accent color of the stored original image at `path` (the path the Renderer holds), computed
    /// on first request and cached. A path that names no stored image has no accent.
    pub fn artwork_accent(&self, path: &str) -> Result<Option<String>> {
        let Some(hash) = hash_of_original(path) else {
            return Ok(None);
        };
        artwork_accent(&self.database, &hash)
    }

    /// Stops the watchers and any scan in progress, waits for them, and drops the idle read
    /// connections, so the database file can be replaced.
    pub(crate) fn shutdown(&self) {
        self.sync.shutdown();
        self.database.close();
    }

    /// One page of a list, with the Library version it was read at.
    fn page<T>(
        &self,
        listing: &Listing,
        offset: u32,
        limit: u32,
        row: fn(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Page<T>> {
        // The version is read before the rows: a change that lands while the page is read makes the
        // page look older than it is, so the Renderer restarts the list rather than miss it.
        let version = self.version();
        let connection = self.read()?;
        Ok(Page {
            items: listing.page_rows(&connection, offset, limit, row)?,
            total: listing.total(&connection)?,
            version,
        })
    }

    pub fn list_tracks(&self, request: &ListRequest<TrackSortKey>) -> Result<Page<TrackListItem>> {
        let listing = track_listing(request.search.as_deref(), request.sort, request.direction);
        self.page(&listing, request.offset, request.limit, track_row)
    }

    pub fn list_albums(&self, request: &ListRequest<AlbumSortKey>) -> Result<Page<AlbumListItem>> {
        let listing = album_listing(request.search.as_deref(), request.sort, request.direction);
        self.page(&listing, request.offset, request.limit, album_row)
    }

    pub fn list_artists(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Page<ArtistListItem>> {
        let listing = artist_listing(request.search.as_deref(), request.sort, request.direction);
        self.page(&listing, request.offset, request.limit, artist_row)
    }

    /// A page of one Album Artist's albums. An Album Artist with no albums is not found.
    pub fn list_artist_albums(
        &self,
        artist: ArtistId,
        request: &ListRequest<ArtistAlbumSortKey>,
    ) -> Result<Page<AlbumListItem>> {
        let listing = artist_album_listing(
            artist,
            request.search.as_deref(),
            request.sort,
            request.direction,
        );
        let page = self.page(&listing, request.offset, request.limit, album_row)?;
        if page.total == 0 {
            return Err(LibraryError::ArtistNotFound);
        }
        Ok(page)
    }

    /// Every track of one album, in playing order. An album with no tracks is not found.
    pub fn list_album_tracks(&self, album: AlbumId) -> Result<Vec<AlbumTrackListItem>> {
        let listing = album_track_listing(album);
        let connection = self.read()?;
        let rows = listing.page_rows(&connection, 0, u32::MAX, album_track_row)?;
        if rows.is_empty() {
            return Err(LibraryError::AlbumNotFound);
        }
        Ok(rows)
    }

    /// The letter index of the Tracks list. A list by duration has none.
    pub fn track_index(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        let connection = self.read()?;
        read::tracks::track_index(&connection, request)
    }

    /// The letter index of the Albums list: by name, or by year.
    pub fn album_index(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        let connection = self.read()?;
        read::albums::album_index(&connection, request)
    }

    /// The letter index of the Album Artists list. Only a list by name has one.
    pub fn artist_index(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Vec<LetterIndexEntry>> {
        let connection = self.read()?;
        read::artists::artist_index(&connection, request)
    }

    /// One Album Artist's row, by its ID.
    pub fn artist(&self, artist: ArtistId) -> Result<ArtistListItem> {
        let connection = self.read()?;
        artist_by_id(&connection, artist)
    }

    /// The details of an album by its ID.
    pub fn album(&self, album_id: AlbumId) -> Result<AlbumDetails> {
        let connection = self.read()?;
        album_details(&connection, album_id)
    }

    /// The track's file, for the Host to show in Explorer. A file that is gone is unavailable.
    pub fn track_file(&self, id: TrackId) -> Result<PathBuf> {
        let connection = self.read()?;
        Ok(track_location(&connection, id)?.existing()?.path)
    }

    /// Tags, audio format and the file's path, or `TrackNotFound` for an unknown track.
    pub fn track_properties(&self, id: TrackId) -> Result<TrackProperties> {
        let connection = self.read()?;
        track_properties(&connection, id)
    }

    /// The album in disc and track order, by its ID.
    pub(crate) fn playback_for_album(
        &self,
        album_id: AlbumId,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection> {
        let connection = self.read()?;
        playback_for_album(&connection, album_id, start_track_id)
    }

    /// One track, for starting from it or adding it to a queue that is already playing. The
    /// track must be playable: anything else is reported.
    pub(crate) fn playback_for_track(&self, track_id: TrackId) -> Result<PlayableTrack> {
        let connection = self.read()?;
        playback_for_track(&connection, track_id)
    }

    /// The tracks with these ids, in the order given: `None` for an id that is unknown, not
    /// indexed or no longer available.
    pub(crate) fn playable_tracks(
        &self,
        track_ids: &[TrackId],
    ) -> Result<Vec<Option<PlayableTrack>>> {
        let connection = self.read()?;
        playable_tracks(&connection, track_ids)
    }

    /// Every track the tracks list shows under `search`, in the list's sort order.
    pub(crate) fn playback_for_tracks(
        &self,
        search: Option<&str>,
        sort: TrackSortKey,
        direction: SortDirection,
        start_track_id: Option<TrackId>,
    ) -> Result<PlaybackSelection> {
        let connection = self.read()?;
        playback_for_tracks(&connection, search, sort, direction, start_track_id)
    }
}

#[cfg(test)]
mod tests;
