mod audio;
mod library;
mod media;

#[cfg(test)]
#[path = "audio/test_support.rs"]
pub(crate) mod test_support;

#[cfg(all(feature = "bindings-export", test))]
use std::path::{Path, PathBuf};
use std::thread;

use tauri::{Emitter, Manager};
use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use audio::devices::{
    list_output_devices as list_output_devices_with_cpal, AudioDeviceListError, AudioOutputDevice,
    AudioOutputSelection,
};
use audio::playback::{
    PlaybackFailureCode, PlaybackService, PlaybackServiceError, PlaybackSnapshot,
};
use library::{
    models::{
        LibraryAlbumDetails, LibraryAlbumPage, LibraryAlbumTrackPage, LibraryRoot,
        LibraryScanSnapshot, LibraryStatus, LibraryTrackPage, LibraryTrackSummary,
    },
    service::{LibraryCommandError, LibraryService, StartLibraryTrackError},
};
use media::inspection::{
    inspect_audio_file as inspect_validated_audio_file, AudioFileInfo, AudioFileInspectionError,
};
use media::validation::{
    validate_audio_file as validate_audio_file_path, AudioFileValidationError, ValidatedAudioFile,
};

#[tauri::command]
#[specta::specta]
fn get_library_status(library: tauri::State<'_, LibraryService>) -> LibraryStatus {
    library.status()
}
#[tauri::command]
#[specta::specta]
async fn list_library_roots(
    library: tauri::State<'_, LibraryService>,
) -> Result<Vec<LibraryRoot>, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.roots())
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn register_library_root(
    path: String,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryRoot, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.register_root(path))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn set_library_root_enabled(
    id: String,
    enabled: bool,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryRoot, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.set_root_enabled(id, enabled))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
fn start_library_scan(
    library: tauri::State<'_, LibraryService>,
) -> Result<(), LibraryCommandError> {
    library.handle().start_scan()
}
#[tauri::command]
#[specta::specta]
fn cancel_library_scan(
    library: tauri::State<'_, LibraryService>,
) -> Result<(), LibraryCommandError> {
    library.handle().cancel_scan()
}
#[tauri::command]
#[specta::specta]
fn get_library_scan_state(library: tauri::State<'_, LibraryService>) -> LibraryScanSnapshot {
    library.handle().scan_state()
}
#[tauri::command]
#[specta::specta]
async fn list_library_tracks(
    after_id: Option<String>,
    search: Option<String>,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryTrackPage, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.tracks(after_id, search))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn list_library_albums(
    after_id: Option<String>,
    search: Option<String>,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryAlbumPage, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.albums(after_id, search))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn get_library_album_details(
    album_id: String,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryAlbumDetails, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.album_details(album_id))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn list_library_album_tracks(
    album_id: String,
    offset: u32,
    library: tauri::State<'_, LibraryService>,
) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.album_tracks(album_id, offset))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn remove_library_root(
    id: String,
    library: tauri::State<'_, LibraryService>,
) -> Result<(), LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.remove_root(id))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn get_library_track_for_path(
    path: String,
    library: tauri::State<'_, LibraryService>,
) -> Result<Option<LibraryTrackSummary>, LibraryCommandError> {
    let service = library.handle();
    tauri::async_runtime::spawn_blocking(move || service.track_for_path(path))
        .await
        .map_err(|_| LibraryCommandError::TaskFailed)?
}
#[tauri::command]
#[specta::specta]
async fn start_library_track(
    track_id: String,
    library: tauri::State<'_, LibraryService>,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, StartLibraryTrackError> {
    let library = library.handle();
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || {
        let source = library.playable_source(track_id)?;
        playback.play(source).map_err(map_start_library_error)
    })
    .await
    .map_err(|_| StartLibraryTrackError::TaskFailed)?
}

fn map_start_library_error(error: PlaybackServiceError) -> StartLibraryTrackError {
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            StartLibraryTrackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::Output(PlaybackFailureCode::NoOutputDevice) => {
            StartLibraryTrackError::NoOutputDevice
        }
        PlaybackServiceError::Output(PlaybackFailureCode::OutputDeviceUnavailable) => {
            StartLibraryTrackError::OutputDeviceUnavailable
        }
        PlaybackServiceError::Decode
        | PlaybackServiceError::DurationUnavailable
        | PlaybackServiceError::Seek => StartLibraryTrackError::DecodeFailed,
        _ => StartLibraryTrackError::OutputFailed,
    }
}

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
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum SetAudioOutputSelectionError {
    InvalidDeviceId,
    OutputDeviceUnavailable,
    InvalidPlaybackState,
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

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum SetPlaybackVolumeError {
    InvalidVolume,
    PlaybackWorkerUnavailable,
    TaskFailed,
}

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", rename_all = "camelCase")]
enum PlaybackMuteError {
    PlaybackWorkerUnavailable,
    TaskFailed,
}

fn map_start_error(error: PlaybackServiceError) -> StartAudioFileError {
    match error {
        PlaybackServiceError::WorkerUnavailable => StartAudioFileError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidVolume => StartAudioFileError::OutputFailed,
        PlaybackServiceError::InvalidPlaybackState => StartAudioFileError::OutputFailed,
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            StartAudioFileError::DecodeFailed
        }
        PlaybackServiceError::Output(PlaybackFailureCode::NoOutputDevice) => {
            StartAudioFileError::NoOutputDevice
        }
        PlaybackServiceError::Output(PlaybackFailureCode::OutputDeviceUnavailable) => {
            StartAudioFileError::OutputDeviceUnavailable
        }
        PlaybackServiceError::Output(_) => StartAudioFileError::OutputFailed,
        PlaybackServiceError::Decode => StartAudioFileError::DecodeFailed,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            StartAudioFileError::OutputFailed
        }
    }
}

fn map_output_selection_error(error: PlaybackServiceError) -> SetAudioOutputSelectionError {
    match error {
        PlaybackServiceError::InvalidDeviceId => SetAudioOutputSelectionError::InvalidDeviceId,
        PlaybackServiceError::OutputDeviceUnavailable => {
            SetAudioOutputSelectionError::OutputDeviceUnavailable
        }
        PlaybackServiceError::InvalidPlaybackState => {
            SetAudioOutputSelectionError::InvalidPlaybackState
        }
        PlaybackServiceError::WorkerUnavailable => {
            SetAudioOutputSelectionError::PlaybackWorkerUnavailable
        }
        _ => SetAudioOutputSelectionError::PlaybackWorkerUnavailable,
    }
}

#[tauri::command]
#[specta::specta]
async fn set_audio_output_selection(
    selection: AudioOutputSelection,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, SetAudioOutputSelectionError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.set_output_selection(selection))
        .await
        .map_err(|_| SetAudioOutputSelectionError::TaskFailed)?
        .map_err(map_output_selection_error)
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
        PlaybackServiceError::InvalidVolume => PauseAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidPlaybackState => PauseAudioPlaybackError::InvalidPlaybackState,
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            PauseAudioPlaybackError::OutputFailed
        }
        PlaybackServiceError::Output(_) => PauseAudioPlaybackError::OutputFailed,
        PlaybackServiceError::Decode => PauseAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            PauseAudioPlaybackError::OutputFailed
        }
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
        PlaybackServiceError::InvalidVolume => ResumeAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidPlaybackState => {
            ResumeAudioPlaybackError::InvalidPlaybackState
        }
        PlaybackServiceError::DurationUnavailable | PlaybackServiceError::Seek => {
            ResumeAudioPlaybackError::OutputFailed
        }
        PlaybackServiceError::Output(_) => ResumeAudioPlaybackError::OutputFailed,
        PlaybackServiceError::Decode => ResumeAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            ResumeAudioPlaybackError::OutputFailed
        }
    }
}

fn map_seek_error(error: PlaybackServiceError) -> SeekAudioPlaybackError {
    match error {
        PlaybackServiceError::WorkerUnavailable => {
            SeekAudioPlaybackError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::InvalidVolume => SeekAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidPlaybackState => SeekAudioPlaybackError::InvalidPlaybackState,
        PlaybackServiceError::DurationUnavailable => SeekAudioPlaybackError::DurationUnavailable,
        PlaybackServiceError::Seek => SeekAudioPlaybackError::SeekFailed,
        PlaybackServiceError::Decode => SeekAudioPlaybackError::DecodeFailed,
        PlaybackServiceError::Output(_) => SeekAudioPlaybackError::OutputFailed,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            SeekAudioPlaybackError::OutputFailed
        }
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

fn map_set_volume_error(error: PlaybackServiceError) -> SetPlaybackVolumeError {
    match error {
        PlaybackServiceError::InvalidVolume => SetPlaybackVolumeError::InvalidVolume,
        PlaybackServiceError::WorkerUnavailable => {
            SetPlaybackVolumeError::PlaybackWorkerUnavailable
        }
        PlaybackServiceError::InvalidPlaybackState
        | PlaybackServiceError::DurationUnavailable
        | PlaybackServiceError::Seek
        | PlaybackServiceError::Output(_)
        | PlaybackServiceError::Decode => SetPlaybackVolumeError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            SetPlaybackVolumeError::PlaybackWorkerUnavailable
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn set_playback_volume(
    volume: f32,
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, SetPlaybackVolumeError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.set_volume(volume))
        .await
        .map_err(|_| SetPlaybackVolumeError::TaskFailed)?
        .map_err(map_set_volume_error)
}

fn map_mute_error(error: PlaybackServiceError) -> PlaybackMuteError {
    match error {
        PlaybackServiceError::WorkerUnavailable => PlaybackMuteError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidVolume
        | PlaybackServiceError::InvalidPlaybackState
        | PlaybackServiceError::DurationUnavailable
        | PlaybackServiceError::Seek
        | PlaybackServiceError::Output(_)
        | PlaybackServiceError::Decode => PlaybackMuteError::PlaybackWorkerUnavailable,
        PlaybackServiceError::InvalidDeviceId | PlaybackServiceError::OutputDeviceUnavailable => {
            PlaybackMuteError::PlaybackWorkerUnavailable
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn mute_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, PlaybackMuteError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.mute())
        .await
        .map_err(|_| PlaybackMuteError::TaskFailed)?
        .map_err(map_mute_error)
}

#[tauri::command]
#[specta::specta]
async fn unmute_audio_playback(
    playback: tauri::State<'_, PlaybackService>,
) -> Result<PlaybackSnapshot, PlaybackMuteError> {
    let playback = playback.handle();
    tauri::async_runtime::spawn_blocking(move || playback.unmute())
        .await
        .map_err(|_| PlaybackMuteError::TaskFailed)?
        .map_err(map_mute_error)
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
        set_audio_output_selection,
        set_playback_volume,
        mute_audio_playback,
        unmute_audio_playback,
        get_playback_state,
        get_library_status,
        list_library_roots,
        register_library_root,
        set_library_root_enabled,
        start_library_scan,
        cancel_library_scan,
        get_library_scan_state,
        list_library_tracks,
        list_library_albums,
        get_library_album_details,
        list_library_album_tracks,
        remove_library_root,
        get_library_track_for_path,
        start_library_track,
    ]
}

#[cfg(all(feature = "bindings-export", test))]
fn create_export_builder() -> Builder<tauri::test::MockRuntime> {
    Builder::<tauri::test::MockRuntime>::new()
        .commands(collect_specta_commands())
        .semantic_types(
            specta_typescript::semantic::Configuration::default().enable_lossless_floats(),
        )
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
            let library_directory = app
                .path()
                .app_local_data_dir()
                .map_err(|_| "library storage path unavailable")?;
            app.manage(LibraryService::initialize(library_directory));
            if let Some(receiver) = app
                .state::<LibraryService>()
                .take_scan_state_changed_receiver()
            {
                let app_handle = app.handle().clone();
                thread::spawn(move || {
                    while receiver.recv().is_ok() {
                        let snapshot = app_handle.state::<LibraryService>().handle().scan_state();
                        let _ = app_handle.emit("library-scan-progress", snapshot);
                    }
                });
            }
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
            app_handle.state::<LibraryService>().shutdown();
        }
    });
}
