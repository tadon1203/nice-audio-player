use backend::{app::LyricsResolution, errors::LyricsCommandError, ids::TrackId};

use super::blocking;
use crate::AppState;

#[tauri::command]
#[specta::specta]
pub(crate) async fn lyrics_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<LyricsResolution, LyricsCommandError> {
    blocking(&state, move |backend| backend.track_lyrics(track_id)).await
}
