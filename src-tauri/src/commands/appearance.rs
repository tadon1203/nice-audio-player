use backend::app::{Appearance, AppearancePatch, Revisioned};

use crate::AppState;

/// Applies a partial update to the appearance and returns it as it is afterwards, with its
/// revision.
#[tauri::command]
#[specta::specta]
pub(crate) fn appearance_update(
    patch: AppearancePatch,
    state: tauri::State<'_, AppState>,
) -> Revisioned<Appearance> {
    state.backend.appearance_update(&patch)
}
