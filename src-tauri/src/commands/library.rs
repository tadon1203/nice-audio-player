use std::path::PathBuf;

use backend::app::BackendApp;
use backend::app::{
    AlbumArtistListRequest, AlbumArtistQuery, AlbumDetails, AlbumListRequest, AlbumQuery,
    AlbumTracksRequest, ArtistAlbumsRequest, ArtistRow, LibraryAlbumArtistPage, LibraryAlbumPage,
    LibraryAlbumTrackPage, LibraryDirectory, LibraryStatus, LibraryTrackPage, ScrollIndexBucket,
    TrackListRequest, TrackProperties, TrackQuery,
};
use backend::errors::logged;
use backend::errors::{CommandError, LibraryCommandError};
use backend::ids::{AlbumId, ArtistId, ArtworkHash, DirectoryId, TrackId};

use super::blocking;
use crate::{
    AppState,
    os::{open_in_file_manager, reveal_in_file_manager},
};

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri passes State and AppHandle by value"
)]
pub(crate) fn library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    state.backend.library_status()
}

/// Moves the library database aside and restarts the app, which recreates it and rescans.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reset(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, BackendApp::request_library_reset).await?;
    // `restart` skips the exit event, so close the database cleanly first.
    state.backend.shutdown();
    app.restart()
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_directories(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryDirectory>, LibraryCommandError> {
    blocking(&state, BackendApp::list_directories).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_add_directory(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryDirectory, LibraryCommandError> {
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
) -> Result<LibraryDirectory, LibraryCommandError> {
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
) -> Result<(), LibraryCommandError> {
    blocking(&state, move |backend| backend.remove_directory(id)).await
}

/// Deletes the Missing tracks from the Library and returns how many there were. Never touches a
/// source file.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_delete_missing_tracks(
    state: tauri::State<'_, AppState>,
) -> Result<u64, LibraryCommandError> {
    blocking(&state, BackendApp::delete_missing_tracks).await
}

/// Opens the directory holding the log files in the file manager.
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_open_log_directory(
    app: tauri::AppHandle,
) -> Result<(), LibraryCommandError> {
    use tauri::Manager;
    let directory = app.path().app_log_dir().map_err(logged(
        LibraryCommandError::Common {
            error: CommandError::TaskFailed,
        },
        "host.library.log_dir_failed",
    ))?;
    // The filesystem and a spawned process stay off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&directory).map_err(logged(
            LibraryCommandError::Common {
                error: CommandError::TaskFailed,
            },
            "host.library.create_dir_failed",
        ))?;
        open_in_file_manager(&directory)
    })
    .await
    .map_err(logged(
        LibraryCommandError::Common {
            error: CommandError::TaskFailed,
        },
        "host.library.task_failed",
    ))?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_start_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, BackendApp::start_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_cancel_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, BackendApp::cancel_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_tracks(
    request: TrackListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_tracks(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_albums(
    request: AlbumListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_albums(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artists(
    request: AlbumArtistListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_album_artists(&request)).await
}

/// The scroll index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_index(
    query: TrackQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.track_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album_index(
    query: AlbumQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist_index(
    query: AlbumArtistQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ScrollIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_artist_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<ArtistRow, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist(artist_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artist_albums(
    request: ArtistAlbumsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist_albums(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<AlbumDetails, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_by_id(album_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_album_tracks(
    request: AlbumTracksRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_tracks_by_id(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_properties(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<TrackProperties, LibraryCommandError> {
    blocking(&state, move |backend| backend.track_properties(track_id)).await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reveal_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    let path = blocking(&state, move |backend| backend.track_file(track_id)).await?;
    tauri::async_runtime::spawn_blocking(move || reveal_in_file_manager(&path))
        .await
        .map_err(logged(
            LibraryCommandError::Common {
                error: CommandError::TaskFailed,
            },
            "host.library.reveal_task_failed",
        ))?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artwork_accent(
    hash: ArtworkHash,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, LibraryCommandError> {
    blocking(&state, move |backend| backend.artwork_accent(&hash)).await
}
