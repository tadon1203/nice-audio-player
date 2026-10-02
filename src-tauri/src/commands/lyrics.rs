use backend::lyrics::{LyricsCommandError, LyricsResolution};

use super::blocking;
use crate::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_track_lyrics(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<LyricsResolution, LyricsCommandError> {
    blocking(&state, move |backend| backend.resolve_lyrics(track_id)).await
}
