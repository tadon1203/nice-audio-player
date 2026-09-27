use backend::lyrics::{LyricsCommandError, LyricsResolution};

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_track_lyrics(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<LyricsResolution, LyricsCommandError> {
    state.backend.resolve_lyrics(track_id).await
}
