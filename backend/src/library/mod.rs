//! The Library: the indexed set of tracks from the registered music folders.
//!
//! `Library::open` yields a working Library or the reason it is unavailable, and the app holds
//! that result. A working Library has two sides that meet only in the database: the read side
//! (`store`: catalog, playback selections, track lookups) and the write side (`sync`: folders,
//! watchers, scanner), reached through the methods below.

pub(crate) mod accent;
pub(crate) mod artwork;
pub(crate) mod database;
pub(crate) mod error;
pub(crate) mod keys;
pub(crate) mod location;
pub(crate) mod maintenance;
pub(crate) mod migrations;
pub(crate) mod models;
pub(crate) mod roots;
pub(crate) mod scanner;
pub(crate) mod status;
pub(crate) mod store;
pub(crate) mod summary;
pub(crate) mod sync;
#[cfg(test)]
mod tests;
pub(crate) mod text;
pub(crate) mod watcher;

use crate::ids::{ArtworkHash, FolderId};
use crate::messages::{Notifier, SharedMessageSink, StateTopic, Versioned};
use database::{Database, DatabaseError};
use error::LibraryCommandError;
use log::error;
use models::{LibraryRoot, LibraryScanSnapshot, LibraryUnavailableReason};
use parking_lot::Mutex;
use std::{
    path::Path,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use store::LibraryStore;
use sync::LibrarySync;

#[derive(Clone)]
pub(crate) struct Library {
    database: Database,
    store: LibraryStore,
    sync: Arc<LibrarySync>,
    scan: Arc<Mutex<Versioned<LibraryScanSnapshot>>>,
}

impl Library {
    /// Opens the Library in `directory`: migrates its database, then starts watching and scanning
    /// the registered folders.
    pub(crate) fn open(
        directory: &Path,
        messages: SharedMessageSink,
    ) -> Result<Self, LibraryUnavailableReason> {
        database::apply_requested_reset(directory);
        let database = Database::initialize(directory).map_err(|error| {
            let reason = match error {
                DatabaseError::Corrupt => LibraryUnavailableReason::DatabaseCorrupt,
                DatabaseError::Migration(migrations::MigrationError::SchemaTooNew) => {
                    LibraryUnavailableReason::SchemaTooNew
                }
                DatabaseError::Migration(_) => LibraryUnavailableReason::MigrationFailed,
                DatabaseError::Open => LibraryUnavailableReason::DatabaseOpenFailed,
            };
            error!("library.database.unavailable reason={reason:?}");
            reason
        })?;
        let scan = Arc::new(Mutex::new(Versioned::new(LibraryScanSnapshot::idle())));
        let sync = LibrarySync::start(
            database.clone(),
            Arc::clone(&scan),
            Notifier::new(messages, StateTopic::LibraryScan),
        );
        Ok(Self {
            store: LibraryStore::new(database.clone()),
            database,
            sync: Arc::new(sync),
            scan,
        })
    }

    /// The read side.
    pub(crate) fn store(&self) -> &LibraryStore {
        &self.store
    }

    /// The scan state with the revision of its topic.
    pub(crate) fn scan_state(&self) -> Versioned<LibraryScanSnapshot> {
        self.scan.lock().clone()
    }

    pub(crate) fn roots(&self) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
        Ok(self.store.roots()?)
    }

    pub(crate) fn register_root(&self, path: String) -> Result<LibraryRoot, LibraryCommandError> {
        self.sync.register_root(path)
    }

    pub(crate) fn set_root_enabled(
        &self,
        id: FolderId,
        enabled: bool,
    ) -> Result<LibraryRoot, LibraryCommandError> {
        self.sync.set_root_enabled(id, enabled)
    }

    pub(crate) fn remove_root(&self, id: FolderId) -> Result<(), LibraryCommandError> {
        self.sync.remove_root(id)
    }

    /// Deletes every Missing track from the Library. Source files are never touched.
    pub(crate) fn delete_missing(&self) -> Result<u64, LibraryCommandError> {
        self.sync.delete_missing()
    }

    pub(crate) fn start_scan(&self) -> Result<(), LibraryCommandError> {
        self.sync.start_scan()
    }

    pub(crate) fn cancel_scan(&self) -> Result<(), LibraryCommandError> {
        self.sync.cancel_scan()
    }

    /// The accent color of stored artwork, computed on first request and cached.
    pub(crate) fn artwork_accent(
        &self,
        hash: &ArtworkHash,
    ) -> Result<Option<String>, LibraryCommandError> {
        Ok(accent::artwork_accent(&self.database, hash)?)
    }

    /// Stops the watchers and any scan in progress, and waits for them.
    pub(crate) fn shutdown(&self) {
        self.sync.shutdown();
    }
}

pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}
