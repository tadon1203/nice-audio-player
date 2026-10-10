use backend::settings::{Appearance, SettingsPatch};

use crate::AppState;

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Appearance {
    state.backend.settings.appearance().value
}

/// Applies a partial update and returns the appearance settings as they are afterwards.
#[tauri::command]
#[specta::specta]
pub fn update_settings(patch: SettingsPatch, state: tauri::State<'_, AppState>) -> Appearance {
    state.backend.settings.update(&patch)
}
