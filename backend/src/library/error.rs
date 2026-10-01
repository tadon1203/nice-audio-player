//! The Library's error vocabularies. Inside, the store speaks `StoreError`, which is logged once
//! with its cause where it is built; the facade maps it to the renderer-facing
//! `LibraryCommandError`, whose codes carry no implementation detail.

use super::database::DatabaseError;
use log::error;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum LibraryCommandError {
    InvalidRoot,
    RootNotDirectory,
    CanonicalizationFailed,
    DuplicateRoot,
    OverlappingRoot,
    ScanInProgress,
    InvalidId,
    TrackNotFound,
    TrackUnavailable,
    AlbumNotFound,
    InvalidCursor,
    InvalidAlbumKey,
    InvalidAlbumArtistKey,
    AlbumArtistNotFound,
    RootMissing,
    ScanAlreadyRunning,
    NoEnabledRoots,
    ScanNotRunning,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreError {
    InvalidId,
    InvalidCursor,
    InvalidAlbumKey,
    InvalidAlbumArtistKey,
    TrackNotFound,
    TrackUnavailable,
    AlbumNotFound,
    AlbumArtistNotFound,
    /// The database failed; the cause was logged where the error was built.
    Persistence,
}

impl From<rusqlite::Error> for StoreError {
    fn from(cause: rusqlite::Error) -> Self {
        error!("library.store.failed cause={cause}");
        Self::Persistence
    }
}

impl From<DatabaseError> for StoreError {
    fn from(cause: DatabaseError) -> Self {
        error!("library.store.unavailable cause={cause:?}");
        Self::Persistence
    }
}

impl From<StoreError> for LibraryCommandError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::InvalidId => Self::InvalidId,
            StoreError::InvalidCursor => Self::InvalidCursor,
            StoreError::InvalidAlbumKey => Self::InvalidAlbumKey,
            StoreError::InvalidAlbumArtistKey => Self::InvalidAlbumArtistKey,
            StoreError::TrackNotFound => Self::TrackNotFound,
            StoreError::TrackUnavailable => Self::TrackUnavailable,
            StoreError::AlbumNotFound => Self::AlbumNotFound,
            StoreError::AlbumArtistNotFound => Self::AlbumArtistNotFound,
            StoreError::Persistence => Self::PersistenceFailed,
        }
    }
}

/// A library id as the renderer writes it: decimal digits, no leading zero, above zero.
pub(crate) fn parse_id(value: &str) -> Result<i64, StoreError> {
    if value.is_empty() || value.starts_with('0') || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(StoreError::InvalidId);
    }
    value
        .parse()
        .ok()
        .filter(|id: &i64| *id > 0)
        .ok_or(StoreError::InvalidId)
}
