use backend::app::{Appearance, AppearancePatch, Versioned};

use crate::AppState;

/// Applies a partial update to the appearance and returns it as it is afterwards, with its
/// version.
#[tauri::command]
#[specta::specta]
pub(crate) fn appearance_update(
    patch: AppearancePatch,
    state: tauri::State<'_, AppState>,
) -> Versioned<Appearance> {
    state.backend.appearance_update(&patch)
}
