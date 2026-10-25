use backend::{app::Lyrics, errors::CommandError, ids::TrackId};

use super::blocking;
use crate::AppState;

#[tauri::command]
#[specta::specta]
pub(crate) async fn lyrics_track(
    track_id: TrackId,
    state: tauri::State<'_, AppState>,
) -> Result<Lyrics, CommandError> {
    blocking(&state, move |backend| backend.track_lyrics(track_id)).await
}
