mod audio;

use std::thread;

use tauri::{Emitter, Manager};

use audio::decoding::{decode_audio_file, DecodeCancellation, PcmDecodeError};
use audio::devices::{
    list_output_devices as list_output_devices_with_cpal, AudioDeviceListError, AudioOutputDevice,
};
use audio::inspection::{
    inspect_audio_file as inspect_validated_audio_file, AudioFileInfo, AudioFileInspectionError,
};
use audio::playback::{PlaybackService, PlaybackServiceError, PlaybackSnapshot};
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
enum StartAudioFileError {
    ValidationFailed { error: AudioFileValidationError },
    DecodeFailed,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[tauri::command]
async fn start_audio_file(
    path: String,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, StartAudioFileError> {
    let task = tauri::async_runtime::spawn_blocking(move || {
        let validated_file = validate_audio_file_path(&path)
            .map_err(|error| StartAudioFileError::ValidationFailed { error })?;
        let cancellation = DecodeCancellation::default();
        let pcm = decode_audio_file(&validated_file, &cancellation)
            .map_err(|_error: PcmDecodeError| StartAudioFileError::DecodeFailed)?;
        Ok::<_, StartAudioFileError>(pcm)
    });
    let pcm = task.await.map_err(|_| StartAudioFileError::TaskFailed)??;
    playback.play(pcm).map_err(map_start_error)
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum StopAudioPlaybackError {
    PlaybackWorkerUnavailable,
    #[allow(dead_code)]
    TaskFailed,
}

fn map_start_error(error: PlaybackServiceError) -> StartAudioFileError {
    match error {
        PlaybackServiceError::WorkerUnavailable | PlaybackServiceError::StatePoisoned => {
            StartAudioFileError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::Output(_) => StartAudioFileError::OutputFailed,
    }
}

#[tauri::command]
async fn stop_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, StopAudioPlaybackError> {
    playback
        .stop()
        .map_err(|_| StopAudioPlaybackError::PlaybackWorkerUnavailable)
}

#[tauri::command]
fn get_playback_state(playback: tauri::State<'_, PlaybackService>) -> PlaybackSnapshot {
    playback.snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let playback_service = PlaybackService::start().expect("playback service must start");
    let app = tauri::Builder::default()
        .manage(playback_service)
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(receiver) = app.state::<PlaybackService>().take_state_receiver() {
                let app_handle = app.handle().clone();
                thread::spawn(move || {
                    while let Ok(snapshot) = receiver.recv() {
                        let _ = app_handle.emit("playback-state-changed", snapshot);
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            validate_audio_file,
            inspect_audio_file,
            list_audio_output_devices,
            start_audio_file,
            stop_audio_playback,
            get_playback_state
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            app_handle.state::<PlaybackService>().shutdown();
        }
    });
}
