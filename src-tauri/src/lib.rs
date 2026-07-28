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
    let playback = playback.handle();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let validated_file = validate_audio_file_path(&path)
            .map_err(|error| StartAudioFileError::ValidationFailed { error })?;
        let cancellation = DecodeCancellation::default();
        let pcm = decode_audio_file(&validated_file, &cancellation)
            .map_err(|_error: PcmDecodeError| StartAudioFileError::DecodeFailed)?;
        playback.play(pcm).map_err(map_start_error)
    });
    task.await.map_err(|_| StartAudioFileError::TaskFailed)?
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum StopAudioPlaybackError {
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum PauseAudioPlaybackError {
    PlaybackWorkerUnavailable,
    InvalidPlaybackState,
    OutputFailed,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum ResumeAudioPlaybackError {
    PlaybackWorkerUnavailable,
    InvalidPlaybackState,
    OutputFailed,
    TaskFailed,
}

fn map_start_error(error: PlaybackServiceError) -> StartAudioFileError {
    match error {
        PlaybackServiceError::WorkerUnavailable => StartAudioFileError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidPlaybackState => StartAudioFileError::OutputFailed,
        PlaybackServiceError::Output(_) => StartAudioFileError::OutputFailed,
    }
}

#[tauri::command]
async fn stop_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, StopAudioPlaybackError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.stop())
        .await
        .map_err(|_| StopAudioPlaybackError::TaskFailed)?
        .map_err(|_| StopAudioPlaybackError::PlaybackWorkerUnavailable)
}

fn map_pause_error(error: PlaybackServiceError) -> PauseAudioPlaybackError {
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            PauseAudioPlaybackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::InvalidPlaybackState => PauseAudioPlaybackError::InvalidPlaybackState,
        PlaybackServiceError::Output(_) => PauseAudioPlaybackError::OutputFailed,
    }
}

#[tauri::command]
async fn pause_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, PauseAudioPlaybackError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.pause())
        .await
        .map_err(|_| PauseAudioPlaybackError::TaskFailed)?
        .map_err(map_pause_error)
}

fn map_resume_error(error: PlaybackServiceError) -> ResumeAudioPlaybackError {
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            ResumeAudioPlaybackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::InvalidPlaybackState => {
            ResumeAudioPlaybackError::InvalidPlaybackState
        }
        PlaybackServiceError::Output(_) => ResumeAudioPlaybackError::OutputFailed,
    }
}

#[tauri::command]
async fn resume_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, ResumeAudioPlaybackError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.resume())
        .await
        .map_err(|_| ResumeAudioPlaybackError::TaskFailed)?
        .map_err(map_resume_error)
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
            if let Some(receiver) = app.state::<PlaybackService>().take_state_changed_receiver() {
                let app_handle = app.handle().clone();
                thread::spawn(move || {
                    while receiver.recv().is_ok() {
                        let snapshot = app_handle.state::<PlaybackService>().snapshot();
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
            pause_audio_playback,
            resume_audio_playback,
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
