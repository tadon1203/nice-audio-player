use backend::dto::{Appearance, AppearancePatch, Versioned};

use crate::AppState;

/// Applies a partial update to the appearance and returns it as it is afterwards, with its
/// revision.
#[tauri::command]
#[specta::specta]
pub fn update_appearance(
    patch: AppearancePatch,
    state: tauri::State<'_, AppState>,
) -> Versioned<Appearance> {
    state.backend.update_appearance(&patch)
}
