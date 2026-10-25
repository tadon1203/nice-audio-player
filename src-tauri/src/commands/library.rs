use std::path::PathBuf;

use backend::app::{
    AlbumArtistListRequest, AlbumArtistQuery, AlbumDetails, AlbumListRequest, AlbumQuery,
    AlbumTracksRequest, ArtistAlbumsRequest, ArtistRow, LibraryAlbumArtistPage, LibraryAlbumPage,
    LibraryAlbumTrackPage, LibraryDirectory, LibraryStatus, LibraryTrackPage, ScrollIndexBucket,
    TrackListRequest, TrackProperties, TrackQuery,
};
use backend::errors::CommandError;
use backend::ids::{AlbumId, ArtistId, ArtworkHash, DirectoryId, TrackId};

use super::blocking;
use crate::{
    AppState,
    os::{open_in_file_manager, reveal_in_file_manager},
};

#[tauri::command]
#[specta::specta]
pub(crate) fn library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    state.backend.library_status()
}

/// Deletes the library database and its artwork, then restarts the app, which creates an empty
/// database and rescans the directories.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reset(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, backend::app::BackendApp::reset_library).await?;
    // `restart` skips the exit event, so close the database cleanly first.
    state.backend.shutdown();
    app.restart()
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_directories(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryDirectory>, CommandError> {
    blocking(&state, backend::app::BackendApp::list_directories).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_add_directory(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryDirectory, CommandError> {
    blocking(&state, move |backend| {
        backend.add_directory(PathBuf::from(path))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_set_directory_enabled(
    id: DirectoryId,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, move |backend| {
        backend.set_directory_enabled(id, enabled)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_remove_directory(
    id: DirectoryId,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, move |backend| backend.remove_directory(id)).await
}

/// Deletes the Missing tracks from the Library and returns how many there were. Never touches a
/// source file.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_delete_missing_tracks(
    state: tauri::State<'_, AppState>,
) -> Result<u64, CommandError> {
    blocking(&state, |backend| {
        backend.delete_missing_tracks().map_err(CommandError::from)
    })
    .await
}

/// Opens the directory holding the log files in the file manager.
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_open_log_directory(app: tauri::AppHandle) -> Result<(), CommandError> {
    use tauri::Manager;
    let directory = app
        .path()
        .app_log_dir()
        .inspect_err(|cause| log::warn!("host.library.log_dir_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)?;
    // The filesystem and a spawned process stay off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&directory)
            .inspect_err(|cause| log::warn!("host.library.create_dir_failed cause={cause}"))
            .map_err(|_| CommandError::TaskFailed)?;
        open_in_file_manager(&directory)
    })
    .await
    .inspect_err(|cause| log::warn!("host.library.task_failed cause={cause}"))
    .map_err(|_| CommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_start_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, |backend| {
        backend.start_scan().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_cancel_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, |backend| {
        backend.cancel_scan().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_tracks(
    request: TrackListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackPage, CommandError> {
    blocking(&state, move |backend| {
        backend.list_tracks(&request).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_albums(
    request: AlbumListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, CommandError> {
    blocking(&state, move |backend| {
        backend.list_albums(&request).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artists(
    request: AlbumArtistListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistPage, CommandError> {
    blocking(&state, move |backend| {
        backend
            .list_album_artists(&request)
            .map_err(CommandError::from)
    })
    .await
}

/// The scroll index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_index(
    query: TrackQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, CommandError> {
    blocking(&state, move |backend| {
        backend.track_index(&query).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album_index(
    query: AlbumQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, CommandError> {
    blocking(&state, move |backend| {
        backend.album_index(&query).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist_index(
    query: AlbumArtistQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, CommandError> {
    blocking(&state, move |backend| {
        backend
            .album_artist_index(&query)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<ArtistRow, CommandError> {
    blocking(&state, move |backend| {
        backend.artist(artist_id).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artist_albums(
    request: ArtistAlbumsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, CommandError> {
    blocking(&state, move |backend| {
        backend.artist_albums(&request).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<AlbumDetails, CommandError> {
    blocking(&state, move |backend| {
        backend.album_by_id(album_id).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_album_tracks(
    request: AlbumTracksRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumTrackPage, CommandError> {
    blocking(&state, move |backend| {
        backend
            .album_tracks_by_id(&request)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_properties(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<TrackProperties, CommandError> {
    blocking(&state, move |backend| {
        backend
            .track_properties(track_id)
            .map_err(CommandError::from)
    })
    .await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reveal_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    let path = blocking(&state, move |backend| {
        backend.track_file(track_id).map_err(CommandError::from)
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || reveal_in_file_manager(&path))
        .await
        .inspect_err(|cause| log::warn!("host.library.reveal_task_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artwork_accent(
    hash: ArtworkHash,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, CommandError> {
    blocking(&state, move |backend| {
        backend.artwork_accent(&hash).map_err(CommandError::from)
    })
    .await
}
