use std::path::PathBuf;

use backend::app::{
    AlbumDetails, AlbumRow, AlbumSortKey, AlbumTrackRow, ArtistAlbumSortKey, ArtistRow,
    ArtistSortKey, BackendApp, LetterIndexEntry, LibraryDirectory, LibraryStatus, ListRequest,
    Page, TrackProperties, TrackRow, TrackSortKey,
};
use backend::errors::CommandError;
use backend::ids::{AlbumId, ArtistId, DirectoryId, TrackId};

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
) -> Result<u32, CommandError> {
    blocking(&state, BackendApp::delete_missing_tracks).await
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
    blocking(&state, BackendApp::start_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_cancel_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, BackendApp::cancel_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_tracks(
    request: ListRequest<TrackSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<TrackRow>, CommandError> {
    blocking(&state, move |backend| backend.list_tracks(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_albums(
    request: ListRequest<AlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<AlbumRow>, CommandError> {
    blocking(&state, move |backend| backend.list_albums(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artists(
    request: ListRequest<ArtistSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<ArtistRow>, CommandError> {
    blocking(&state, move |backend| backend.list_artists(&request)).await
}

/// The letter index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_index(
    request: ListRequest<TrackSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| backend.track_index(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album_index(
    request: ListRequest<AlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| backend.album_index(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist_index(
    request: ListRequest<ArtistSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| backend.artist_index(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<ArtistRow, CommandError> {
    blocking(&state, move |backend| backend.artist(artist_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artist_albums(
    artist_id: ArtistId,
    request: ListRequest<ArtistAlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<AlbumRow>, CommandError> {
    blocking(&state, move |backend| {
        backend.artist_albums(artist_id, &request)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<AlbumDetails, CommandError> {
    blocking(&state, move |backend| backend.album_by_id(album_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_album_tracks(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AlbumTrackRow>, CommandError> {
    blocking(&state, move |backend| backend.album_tracks(album_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_properties(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<TrackProperties, CommandError> {
    blocking(&state, move |backend| backend.track_properties(track_id)).await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reveal_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    let path = blocking(&state, move |backend| backend.track_file(track_id)).await?;
    tauri::async_runtime::spawn_blocking(move || reveal_in_file_manager(&path))
        .await
        .inspect_err(|cause| log::warn!("host.library.reveal_task_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artwork_accent(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, CommandError> {
    blocking(&state, move |backend| backend.artwork_accent(&path)).await
}
