use std::path::PathBuf;

use backend::app::BackendApp;
use backend::diagnostics::logged;
use backend::dto::{
    AlbumArtistListRequest, AlbumArtistQuery, AlbumListRequest, AlbumQuery, AlbumTracksRequest,
    ArtistAlbumsRequest, LibraryAlbumArtistPage, LibraryAlbumArtistSummary, LibraryAlbumDetails,
    LibraryAlbumPage, LibraryAlbumTrackPage, LibraryIndexBucket, LibraryRoot, LibraryStatus,
    LibraryTrackPage, LibraryTrackProperties, TrackListRequest, TrackQuery,
};
use backend::errors::{CommonError, LibraryCommandError};
use backend::ids::{AlbumId, ArtistId, ArtworkHash, RootId, TrackId};

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
pub(crate) fn get_library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    state.backend.library_status()
}

/// Moves the library database aside and restarts the app, which recreates it and rescans.
#[tauri::command]
#[specta::specta]
pub(crate) async fn reset_library_and_rescan(
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
pub(crate) async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
    blocking(&state, BackendApp::library_roots).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn register_library_root(
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
pub(crate) async fn set_library_root_enabled(
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
pub(crate) async fn remove_library_root(
    id: RootId,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, move |backend| backend.remove_library_root(id)).await
}

/// Deletes the Missing tracks from the Library and returns how many there were. Never touches a
/// source file.
#[tauri::command]
#[specta::specta]
pub(crate) async fn delete_missing_library_tracks(
    state: tauri::State<'_, AppState>,
) -> Result<u64, LibraryCommandError> {
    blocking(&state, BackendApp::delete_missing_tracks).await
}

/// Opens the folder holding the log files in the file manager.
#[tauri::command]
#[specta::specta]
pub(crate) async fn open_log_directory(app: tauri::AppHandle) -> Result<(), LibraryCommandError> {
    use tauri::Manager;
    let directory = app.path().app_log_dir().map_err(logged(
        LibraryCommandError::Common {
            error: CommonError::TaskFailed,
        },
        "host.library.log_dir_failed",
    ))?;
    // The filesystem and a spawned process stay off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&directory).map_err(logged(
            LibraryCommandError::Common {
                error: CommonError::TaskFailed,
            },
            "host.library.create_dir_failed",
        ))?;
        open_in_file_manager(&directory)
    })
    .await
    .map_err(logged(
        LibraryCommandError::Common {
            error: CommonError::TaskFailed,
        },
        "host.library.task_failed",
    ))?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn start_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, BackendApp::start_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn cancel_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    blocking(&state, BackendApp::cancel_scan).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_tracks(
    request: TrackListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_tracks(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_albums(
    request: AlbumListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_albums(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_album_artists(
    request: AlbumArtistListRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.list_album_artists(&request)).await
}

/// The scroll index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_track_index(
    query: TrackQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.track_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_album_index(
    query: AlbumQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_album_artist_index(
    query: AlbumArtistQuery,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryIndexBucket>, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_artist_index(&query)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist(artist_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_artist_albums(
    request: ArtistAlbumsRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.artist_albums(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_library_album(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumDetails, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_by_id(album_id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_library_album_tracks(
    request: AlbumTracksRequest,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
    blocking(&state, move |backend| backend.album_tracks_by_id(&request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_library_track_properties(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackProperties, LibraryCommandError> {
    blocking(&state, move |backend| backend.track_properties(track_id)).await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub(crate) async fn reveal_library_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    let path = blocking(&state, move |backend| backend.track_file(track_id)).await?;
    tauri::async_runtime::spawn_blocking(move || reveal_in_file_manager(&path))
        .await
        .map_err(logged(
            LibraryCommandError::Common {
                error: CommonError::TaskFailed,
            },
            "host.library.reveal_task_failed",
        ))?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_artwork_accent(
    hash: ArtworkHash,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, LibraryCommandError> {
    blocking(&state, move |backend| backend.artwork_accent(&hash)).await
}
