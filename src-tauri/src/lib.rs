mod audio;

use audio::decoding::{decode_audio_file, DecodeCancellation, PcmDecodeError};
use audio::devices::{
    list_output_devices as list_output_devices_with_cpal, AudioDeviceListError, AudioOutputDevice,
};
use audio::inspection::{
    inspect_audio_file as inspect_validated_audio_file, AudioFileInfo, AudioFileInspectionError,
};
use audio::output::{play_pcm_to_completion, AudioOutputError};
use audio::validation::{
    validate_audio_file as validate_audio_file_path, AudioFileValidationError, ValidatedAudioFile,
};

#[tauri::command]
fn validate_audio_file(path: String) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    validate_audio_file_path(&path)
}

#[tauri::command]
fn inspect_audio_file(path: String) -> Result<AudioFileInfo, AudioFileInspectionError> {
    let validated_file = validate_audio_file_path(&path)
        .map_err(|error| AudioFileInspectionError::ValidationFailed { error })?;

    inspect_validated_audio_file(&validated_file)
}

#[tauri::command]
fn list_audio_output_devices() -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    list_output_devices_with_cpal()
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum PlayAudioFileError {
    ValidationFailed { error: AudioFileValidationError },
    DecodeFailed,
    OutputFailed,
    TaskFailed,
}

#[tauri::command]
async fn play_audio_file(path: String) -> Result<(), PlayAudioFileError> {
    let task = tauri::async_runtime::spawn_blocking(move || {
        let validated_file = validate_audio_file_path(&path)
            .map_err(|error| PlayAudioFileError::ValidationFailed { error })?;
        let cancellation = DecodeCancellation::default();
        let pcm = decode_audio_file(&validated_file, &cancellation)
            .map_err(|_error: PcmDecodeError| PlayAudioFileError::DecodeFailed)?;
        play_pcm_to_completion(pcm)
            .map_err(|_error: AudioOutputError| PlayAudioFileError::OutputFailed)
    });

    task.await.map_err(|_| PlayAudioFileError::TaskFailed)?
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
        .invoke_handler(tauri::generate_handler![
            validate_audio_file,
            inspect_audio_file,
            list_audio_output_devices,
            play_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
