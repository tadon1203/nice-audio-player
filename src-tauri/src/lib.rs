mod audio;

#[cfg(all(feature = "bindings-export", test))]
use std::path::{Path, PathBuf};
use std::thread;

use tauri::{Emitter, Manager};
use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

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
#[specta::specta]
fn validate_audio_file(path: String) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    validate_audio_file_path(&path)
}

#[tauri::command]
#[specta::specta]
fn inspect_audio_file(path: String) -> Result<AudioFileInfo, AudioFileInspectionError> {
    let validated_file = validate_audio_file_path(&path)
        .map_err(|error| AudioFileInspectionError::ValidationFailed { error })?;

    inspect_validated_audio_file(&validated_file)
}

#[tauri::command]
#[specta::specta]
fn list_audio_output_devices() -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    list_output_devices_with_cpal()
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum StartAudioFileError {
    ValidationFailed { error: AudioFileValidationError },
    DecodeFailed,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[tauri::command]
#[specta::specta]
async fn start_audio_file(
    path: String,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, StartAudioFileError> {
    let playback = playback.handle();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let validated_file = validate_audio_file_path(&path)
            .map_err(|error| StartAudioFileError::ValidationFailed { error })?;
        playback.play(validated_file).map_err(map_start_error)
    });
    task.await.map_err(|_| StartAudioFileError::TaskFailed)?
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum StopAudioPlaybackError {
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum PauseAudioPlaybackError {
    PlaybackWorkerUnavailable,
    InvalidPlaybackState,
    OutputFailed,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum ResumeAudioPlaybackError {
    PlaybackWorkerUnavailable,
    InvalidPlaybackState,
    OutputFailed,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum SeekAudioPlaybackError {
    InvalidPlaybackState,
    DurationUnavailable,
    SeekFailed,
    DecodeFailed,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}

fn map_start_error(error: PlaybackServiceError) -> StartAudioFileError {
    match error {
        PlaybackServiceError::WorkerUnavailable => StartAudioFileError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidPlaybackState => StartAudioFileError::OutputFailed,
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            StartAudioFileError::DecodeFailed
        }
        PlaybackServiceError::Output(_) => StartAudioFileError::OutputFailed,
        PlaybackServiceError::Decode => StartAudioFileError::DecodeFailed,
    }
}

#[tauri::command]
#[specta::specta]
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
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            PauseAudioPlaybackError::OutputFailed
        }
        PlaybackServiceError::Output(_) => PauseAudioPlaybackError::OutputFailed,
        PlaybackServiceError::Decode => PauseAudioPlaybackError::OutputFailed,
    }
}

#[tauri::command]
#[specta::specta]
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
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            ResumeAudioPlaybackError::OutputFailed
        }
        PlaybackServiceError::Output(_) => ResumeAudioPlaybackError::OutputFailed,
        PlaybackServiceError::Decode => ResumeAudioPlaybackError::OutputFailed,
    }
}

fn map_seek_error(error: PlaybackServiceError) -> SeekAudioPlaybackError {
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            SeekAudioPlaybackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::InvalidPlaybackState => SeekAudioPlaybackError::InvalidPlaybackState,
        PlaybackServiceError::DurationUnavailable => SeekAudioPlaybackError::DurationUnavailable,
        PlaybackServiceError::Seek => SeekAudioPlaybackError::SeekFailed,
        PlaybackServiceError::Decode => SeekAudioPlaybackError::DecodeFailed,
        PlaybackServiceError::Output(_) => SeekAudioPlaybackError::OutputFailed,
    }
}

#[tauri::command]
#[specta::specta]
async fn seek_audio_playback(
    position_ms: u64,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, SeekAudioPlaybackError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.seek(position_ms))
        .await
        .map_err(|_| SeekAudioPlaybackError::TaskFailed)?
        .map_err(map_seek_error)
}

#[tauri::command]
#[specta::specta]
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
#[specta::specta]
fn get_playback_state(playback: tauri::State<'_, PlaybackService>) -> PlaybackSnapshot {
    playback.snapshot()
}

fn create_specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_specta_commands())
        .error_handling(ErrorHandlingMode::Throw)
        .dangerously_cast_bigints_to_number()
}

fn collect_specta_commands<R: tauri::Runtime>() -> tauri_specta::Commands<R> {
    collect_commands![
        validate_audio_file,
        inspect_audio_file,
        list_audio_output_devices,
        start_audio_file,
        stop_audio_playback,
        pause_audio_playback,
        resume_audio_playback,
        seek_audio_playback,
        get_playback_state,
    ]
}

#[cfg(all(feature = "bindings-export", test))]
fn create_export_builder() -> Builder<tauri::test::MockRuntime> {
    Builder::<tauri::test::MockRuntime>::new()
        .commands(collect_specta_commands())
        .error_handling(ErrorHandlingMode::Throw)
        .dangerously_cast_bigints_to_number()
}

#[cfg(all(feature = "bindings-export", test))]
fn canonical_bindings_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri must have a repository parent")
        .join("src")
        .join("bindings.ts")
}

#[cfg(all(feature = "bindings-export", test))]
fn export_typescript_bindings_to(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let header = "/* eslint-disable */\n";
    create_export_builder()
        .export(
            specta_typescript::Typescript::default().header(header),
            path,
        )
        .map_err(Into::into)
}

#[cfg(all(feature = "bindings-export", test))]
#[test]
#[ignore = "run through pnpm bindings:generate or pnpm bindings:check"]
fn export_typescript_bindings() {
    let output_path = std::env::var_os("TAURI_SPECTA_OUTPUT")
        .map(PathBuf::from)
        .unwrap_or_else(canonical_bindings_path);
    export_typescript_bindings_to(&output_path).expect("failed to export TypeScript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let playback_service = PlaybackService::start().expect("playback service must start");
    let specta_builder = create_specta_builder();
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
        .invoke_handler(specta_builder.invoke_handler())
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
