use backend::{
    audio::playback::PlaybackSnapshot,
    library::models::{
        LibraryAlbumArtistKey, LibraryAlbumArtistSortKey, LibraryAlbumKey, LibraryAlbumSortKey,
        LibraryArtistAlbumSortKey, LibrarySortDirection, LibraryTrackSortKey,
    },
};

use crate::{
    errors::{command_error, task_error},
    AppState,
};

#[tauri::command]
pub fn get_library_status(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryStatus {
    state.backend.library.status()
}

#[tauri::command]
pub fn get_library_scan_state(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryScanSnapshot {
    state.backend.library.handle().scan_state()
}

#[tauri::command]
pub async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<backend::library::models::LibraryRoot>, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.roots().map_err(command_error))
        .await
        .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn register_library_root(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.register_root(path).map_err(command_error))
        .await
        .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn set_library_root_enabled(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.set_root_enabled(id, enabled).map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub fn remove_library_root(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .remove_root(id)
        .map_err(command_error)
}

#[tauri::command]
pub fn start_library_scan(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .start_scan()
        .map_err(command_error)
}

#[tauri::command]
pub fn cancel_library_scan(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .cancel_scan()
        .map_err(command_error)
}

#[tauri::command]
pub async fn list_library_tracks(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryTrackPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_tracks(cursor, search, sort_key, sort_direction)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn list_library_albums(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_albums(cursor, search, sort_key, sort_direction)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn list_library_album_artists(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumArtistSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_artists(cursor, search, sort_key, sort_direction)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn get_library_album_artist(
    artist_key: LibraryAlbumArtistKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistSummary, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_artist(artist_key).map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn list_library_artist_albums(
    artist_key: LibraryAlbumArtistKey,
    cursor: Option<String>,
    sort_key: LibraryArtistAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_artist_albums(artist_key, cursor, sort_key, sort_direction)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn get_library_album_details(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumDetails, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_details(album_key)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn list_library_album_tracks(
    album_key: LibraryAlbumKey,
    cursor: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumTrackPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_tracks(album_key, cursor)
            .map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn get_library_track_for_path(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<backend::library::models::LibraryTrackSummary>, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.track_for_path(path).map_err(command_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
pub async fn start_library_track(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .start_library_track(track_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn start_library_album(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .start_library_album(album_key)
        .await
        .map_err(command_error)
}
