use backend::{dto::LyricsResolution, errors::LyricsCommandError};

use super::blocking;
use crate::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_track_lyrics(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<LyricsResolution, LyricsCommandError> {
    blocking(&state, move |backend| backend.track_lyrics(&track_id)).await
}
