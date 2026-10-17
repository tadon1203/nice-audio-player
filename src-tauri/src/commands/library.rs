use std::path::PathBuf;

use backend::dto::{
    ArtistAlbumsRequest, LibraryAlbumArtistKey, LibraryAlbumArtistPage, LibraryAlbumArtistSortKey,
    LibraryAlbumArtistSummary, LibraryAlbumDetails, LibraryAlbumKey, LibraryAlbumPage,
    LibraryAlbumSortKey, LibraryAlbumTrackPage, LibraryArtistAlbumSortKey, LibraryIndexBucket,
    LibraryRoot, LibrarySortDirection, LibraryStatus, LibraryTrackPage, LibraryTrackProperties,
    LibraryTrackSortKey,
};
use backend::errors::LibraryCommandError;
use backend::ids::{ArtistId, ArtworkHash, RootId, TrackId};

use super::blocking;
use crate::{
    AppState,
    os::{open_in_file_manager, reveal_in_file_manager},
};

#[tauri::command]
#[specta::specta]
pub fn get_library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    state.backend.library_status()
}

/// Moves the library database aside and restarts the app, which recreates it and rescans.
#[tauri::command]
#[specta::specta]
pub async fn reset_library_and_rescan(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, |backend| backend.request_library_reset()).await?;
    // `restart` skips the exit event, so close the database cleanly first.
    state.backend.shutdown();
    app.restart()
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
    blocking(&state, |backend| backend.library_roots()).await
}

#[tauri::command]
#[specta::specta]
pub async fn register_library_root(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryRoot, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.register_library_root(PathBuf::from(path))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_library_root_enabled(
    id: RootId,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryRoot, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.set_library_root_enabled(id, enabled)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_library_root(
    id: RootId,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, move |backend| backend.remove_library_root(id)).await
}

/// Deletes the Missing tracks from the Library and returns how many there were. Never touches a
/// source file.
#[tauri::command]
#[specta::specta]
pub async fn delete_missing_library_tracks(
    state: tauri::State<'_, AppState>,
) -> Result<u64, LibraryCommandError> {
    blocking(&state, |backend| backend.delete_missing_tracks()).await
}

/// Opens the folder holding the log files in the file manager.
#[tauri::command]
#[specta::specta]
pub async fn open_log_directory(app: tauri::AppHandle) -> Result<(), LibraryCommandError> {
    use tauri::Manager;
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|_| LibraryCommandError::TaskFailed)?;
    // The filesystem and a spawned process stay off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&directory).map_err(|_| LibraryCommandError::TaskFailed)?;
        open_in_file_manager(&directory)
    })
    .await
    .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn start_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, |backend| backend.start_scan()).await
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, |backend| backend.cancel_scan()).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_tracks(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    skip: u64,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.list_tracks(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
            skip,
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_albums(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumSortKey,
    sort_direction: LibrarySortDirection,
    skip: u64,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.list_albums(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
            skip,
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_artists(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumArtistSortKey,
    sort_direction: LibrarySortDirection,
    skip: u64,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.list_album_artists(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
            skip,
        )
    })
    .await
}

/// The scroll index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub async fn list_library_track_index(
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.track_index(search.as_deref(), sort_key, sort_direction)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_index(
    search: Option<String>,
    sort_key: LibraryAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.album_index(search.as_deref(), sort_key, sort_direction)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_artist_index(
    search: Option<String>,
    sort_key: LibraryAlbumArtistSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.album_artist_index(search.as_deref(), sort_key, sort_direction)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist(artist_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_artist_albums(
    request: ArtistAlbumsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist_albums(request)).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_artist(
    artist_key: LibraryAlbumArtistKey,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_artist(artist_key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_artist_albums(
    artist_key: LibraryAlbumArtistKey,
    cursor: Option<String>,
    sort_key: LibraryArtistAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.album_artist_albums(artist_key, cursor.as_deref(), sort_key, sort_direction)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_details(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumDetails, LibraryCommandError> {
    blocking(&state, move |backend| backend.album(album_key)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_tracks(
    album_key: LibraryAlbumKey,
    cursor: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| {
        backend.album_tracks(album_key, cursor.as_deref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_track_properties(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibraryTrackProperties>, LibraryCommandError> {
    blocking(&state, move |backend| backend.track_properties(track_id)).await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub async fn reveal_library_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    let path = blocking(&state, move |backend| backend.track_file(track_id)).await?;
    tauri::async_runtime::spawn_blocking(move || reveal_in_file_manager(&path))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn get_artwork_accent(
    hash: ArtworkHash,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, LibraryCommandError> {
    blocking(&state, move |backend| backend.artwork_accent(&hash)).await
}
