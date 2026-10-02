use backend::settings::{AppearanceSettings, SettingsPatch};

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: tauri::State<'_, AppState>) -> AppearanceSettings {
    state.backend.settings.appearance()
}

/// Applies a partial update and returns the appearance settings as they are afterwards.
#[tauri::command]
#[specta::specta]
pub fn update_settings(
    patch: SettingsPatch,
    state: tauri::State<'_, AppState>,
) -> AppearanceSettings {
    state.backend.settings.update(&patch)
}
