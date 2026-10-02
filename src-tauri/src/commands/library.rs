use backend::library::{
    error::LibraryCommandError,
    models::{
        LibraryAlbumArtistKey, LibraryAlbumArtistPage, LibraryAlbumArtistSortKey,
        LibraryAlbumArtistSummary, LibraryAlbumDetails, LibraryAlbumKey, LibraryAlbumPage,
        LibraryAlbumSortKey, LibraryAlbumTrackPage, LibraryArtistAlbumSortKey, LibraryRoot,
        LibraryScanSnapshot, LibrarySortDirection, LibraryStatus, LibraryTrackPage,
        LibraryTrackProperties, LibraryTrackSortKey, LibraryTrackSummary,
    },
    Library,
};

use super::blocking;
use crate::AppState;

/// Runs `work` on a blocking thread with the Library.
async fn with_library<T: Send + 'static>(
    state: &tauri::State<'_, AppState>,
    work: impl FnOnce(Library) -> Result<T, LibraryCommandError> + Send + 'static,
) -> Result<T, LibraryCommandError> {
    blocking(state, move |backend| {
        let library = backend
            .library
            .as_ref()
            .map_err(|_| LibraryCommandError::LibraryUnavailable)?
            .clone();
        work(library)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn get_library_status(state: tauri::State<'_, AppState>) -> LibraryStatus {
    state.backend.library_status()
}

#[tauri::command]
#[specta::specta]
pub fn get_library_scan_state(state: tauri::State<'_, AppState>) -> LibraryScanSnapshot {
    state.backend.library_scan_state()
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
    with_library(&state, |library| library.roots()).await
}

#[tauri::command]
#[specta::specta]
pub async fn register_library_root(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryRoot, LibraryCommandError> {
    with_library(&state, move |library| library.register_root(path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_library_root_enabled(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryRoot, LibraryCommandError> {
    with_library(&state, move |library| library.set_root_enabled(id, enabled)).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_library_root(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    with_library(&state, move |library| library.remove_root(id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    with_library(&state, |library| library.start_scan()).await
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_library_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    with_library(&state, |library| library.cancel_scan()).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_tracks(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTrackPage, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_tracks(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
        )?)
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
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_albums(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
        )?)
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
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_album_artists(
            cursor.as_deref(),
            search.as_deref(),
            sort_key,
            sort_direction,
        )?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_artist(
    artist_key: LibraryAlbumArtistKey,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_artist(artist_key)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_artist_albums(
    artist_key: LibraryAlbumArtistKey,
    cursor: Option<String>,
    sort_key: LibraryArtistAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_artist_albums(
            artist_key,
            cursor.as_deref(),
            sort_key,
            sort_direction,
        )?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_album_details(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumDetails, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().catalog_album_details(album_key)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_library_album_tracks(
    album_key: LibraryAlbumKey,
    cursor: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library
            .store()
            .catalog_album_tracks(album_key, cursor.as_deref())?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_track(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibraryTrackSummary>, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().track_by_id(&track_id)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_library_track_properties(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<LibraryTrackProperties>, LibraryCommandError> {
    with_library(&state, move |library| {
        Ok(library.store().track_properties(&track_id)?)
    })
    .await
}

/// Shows the track's file in Explorer, selected.
#[tauri::command]
#[specta::specta]
pub async fn reveal_library_track(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), LibraryCommandError> {
    with_library(&state, move |library| {
        let file = library.store().track_location(&track_id)?.existing()?;
        reveal_in_file_manager(&file.path.to_string_lossy())
    })
    .await
}

#[cfg(windows)]
fn reveal_in_file_manager(path: &str) -> Result<(), LibraryCommandError> {
    use std::os::windows::process::CommandExt;
    // Explorer parses its own command line: `/select,` and the quoted path go through verbatim.
    std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path.replace('/', "\\")))
        .spawn()
        .map(|_| ())
        .map_err(|_| LibraryCommandError::TaskFailed)
}

#[cfg(not(windows))]
fn reveal_in_file_manager(_path: &str) -> Result<(), LibraryCommandError> {
    Err(LibraryCommandError::TaskFailed)
}

#[tauri::command]
#[specta::specta]
pub async fn get_artwork_accent(
    content_hash: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, LibraryCommandError> {
    with_library(&state, move |library| library.artwork_accent(&content_hash)).await
}
