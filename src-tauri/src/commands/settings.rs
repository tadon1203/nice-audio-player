use backend::settings::{Settings, SettingsPatch};

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Settings {
    state.backend.settings.get()
}

/// Applies a partial update and returns the settings as they are afterwards.
#[tauri::command]
#[specta::specta]
pub fn update_settings(patch: SettingsPatch, state: tauri::State<'_, AppState>) -> Settings {
    state.backend.settings.update(&patch)
}
