use backend::app::AppearancePatch;

use crate::AppState;

/// Applies a partial update to the appearance. The Renderer learns the result from the Appearance
/// the Backend sends when it changed.
#[tauri::command]
#[specta::specta]
pub(crate) fn appearance_update(patch: AppearancePatch, state: tauri::State<'_, AppState>) {
    state.backend.appearance_update(&patch);
}
