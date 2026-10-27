use std::path::PathBuf;

use backend::app::{
    AlbumDetails, AlbumListItem, AlbumSortKey, AlbumTrackListItem, ArtistAlbumSortKey,
    ArtistListItem, ArtistSortKey, BackendApp, LetterIndexEntry, ListRequest, Page, TrackListItem,
    TrackProperties, TrackSortKey,
};
use backend::errors::CommandError;
use backend::ids::{AlbumId, ArtistId, DirectoryId, TrackId};

use super::blocking;
use crate::{AppState, os::reveal_in_file_manager};

/// Deletes the library database and its artwork, then restarts the app, which creates an empty
/// database and rescans the directories.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_reset(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, BackendApp::reset_library).await?;
    // `restart` skips the exit event, so close the database cleanly first.
    state.backend.shutdown();
    app.restart()
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_add_directory(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.add_directory(PathBuf::from(path))?)
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
        Ok(backend.library()?.set_directory_enabled(id, enabled)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_remove_directory(
    id: DirectoryId,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.remove_directory(id)?)
    })
    .await
}

/// Deletes the Missing tracks from the Library. Never touches a source file.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_delete_missing_tracks(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, |backend| {
        Ok(backend.library()?.delete_missing_tracks()?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_start_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, |backend| Ok(backend.library()?.start_scan()?)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_cancel_scan(
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    blocking(&state, |backend| Ok(backend.library()?.cancel_scan()?)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_tracks(
    request: ListRequest<TrackSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<TrackListItem>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.list_tracks(&request)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_albums(
    request: ListRequest<AlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<AlbumListItem>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.list_albums(&request)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artists(
    request: ListRequest<ArtistSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<ArtistListItem>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.list_artists(&request)?)
    })
    .await
}

/// The letter index of the Tracks list: how many names start under each label, in list order.
#[tauri::command]
#[specta::specta]
pub(crate) async fn library_track_index(
    request: ListRequest<TrackSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.track_index(&request)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_album_index(
    request: ListRequest<AlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.album_index(&request)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist_index(
    request: ListRequest<ArtistSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LetterIndexEntry>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.artist_index(&request)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artist(
    artist_id: ArtistId,
    state: tauri::State<'_, AppState>,
) -> Result<ArtistListItem, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.artist(artist_id)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_artist_albums(
    artist_id: ArtistId,
    request: ListRequest<ArtistAlbumSortKey>,
    state: tauri::State<'_, AppState>,
) -> Result<Page<AlbumListItem>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.list_artist_albums(artist_id, &request)?)
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
        Ok(backend.library()?.album(album_id)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_list_album_tracks(
    album_id: AlbumId,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AlbumTrackListItem>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.list_album_tracks(album_id)?)
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
        Ok(backend.library()?.track_properties(track_id)?)
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
    blocking(&state, move |backend| {
        reveal_in_file_manager(&backend.library()?.track_file(track_id)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn library_artwork_accent(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, CommandError> {
    blocking(&state, move |backend| {
        Ok(backend.library()?.artwork_accent(&path)?)
    })
    .await
}
