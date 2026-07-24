mod audio;

use audio::validation::{
    validate_audio_file as validate_audio_file_path, AudioFileValidationError, ValidatedAudioFile,
};

#[tauri::command]
fn validate_audio_file(path: String) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    validate_audio_file_path(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![validate_audio_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
