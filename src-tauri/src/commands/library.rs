use backend::{
    audio::playback::PlaybackSnapshot,
    library::models::{
        LibraryAlbumArtistKey, LibraryAlbumArtistSortKey, LibraryAlbumKey, LibraryAlbumSortKey,
        LibraryArtistAlbumSortKey, LibrarySortDirection, LibraryTrackSortKey,
    },
    library::service::{LibraryCommandError, StartLibraryAlbumTrackError, StartLibraryTrackError},
};

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub fn get_library_status(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryStatus {
    state.backend.library.status()
}

#[tauri::command]
#[specta::specta]
pub fn get_library_scan_state(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryScanSnapshot {
    state.backend.library.handle().scan_state()
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<backend::library::models::LibraryRoot>, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.roots())
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn register_library_root(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.register_root(path))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn set_library_root_enabled(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.set_root_enabled(id, enabled))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub fn remove_library_root(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    state.backend.library.handle().remove_root(id)
}

#[tauri::command]
#[specta::specta]
pub fn start_library_scan(state: tauri::State<'_, AppState>) -> Result<(), LibraryCommandError> {
    state.backend.library.handle().start_scan()
}

#[tauri::command]
#[specta::specta]
pub fn cancel_library_scan(state: tauri::State<'_, AppState>) -> Result<(), LibraryCommandError> {
    state.backend.library.handle().cancel_scan()
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_tracks(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryTrackPage, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_tracks(cursor, search, sort_key, sort_direction)
    })
    .await
    .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_albums(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_albums(cursor, search, sort_key, sort_direction)
    })
    .await
    .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_artists(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumArtistSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistPage, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_album_artists(cursor, search, sort_key, sort_direction)
    })
    .await
    .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_artist(
    artist_key: LibraryAlbumArtistKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistSummary, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.catalog_artist(artist_key))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_artist_albums(
    artist_key: LibraryAlbumArtistKey,
    cursor: Option<String>,
    sort_key: LibraryArtistAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_artist_albums(artist_key, cursor, sort_key, sort_direction)
    })
    .await
    .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_details(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumDetails, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.catalog_album_details(album_key))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_tracks(
    album_key: LibraryAlbumKey,
    cursor: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumTrackPage, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.catalog_album_tracks(album_key, cursor))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_track_for_path(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<backend::library::models::LibraryTrackSummary>, LibraryCommandError> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.track_for_path(path))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn start_library_track(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, StartLibraryTrackError> {
    state.backend.start_library_track(track_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_library_album(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, StartLibraryAlbumTrackError> {
    state.backend.start_library_album(album_key).await
}
