//! The Library version: a counter the sync worker and the scans advance and the lists read.

use std::sync::atomic::{AtomicU64, Ordering};

/// Changes after every committed change that can alter a list (a directory added, enabled,
/// disabled or removed, Missing tracks deleted, an album rebuild). A list page carries the version
/// it was read at, and the Renderer restarts a list when it changes.
#[derive(Debug, Default)]
pub(crate) struct LibraryVersion(AtomicU64);

impl LibraryVersion {
    pub(crate) fn get(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }

    pub(crate) fn bump(&self) {
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}
