use std::{path::PathBuf, sync::Arc, thread};

use backend::{
    activity::ApplicationActivity,
    app::BackendApp,
    audio::{
        devices::{list_output_devices, AudioDeviceListError},
        playback::{
            PlaybackFailureCode, PlaybackQueueSnapshot, PlaybackServiceError, PlaybackSnapshot,
        },
    },
    library::{
        models::{
            LibraryAlbumArtistKey, LibraryAlbumArtistSortKey, LibraryAlbumKey, LibraryAlbumSortKey,
            LibraryArtistAlbumSortKey, LibrarySortDirection, LibraryTrackSortKey,
        },
        service::{LibraryCommandError, StartLibraryAlbumTrackError, StartLibraryTrackError},
    },
};
use serde::Serialize;
use tauri::{Emitter, Manager};

fn artwork_path(uri_path: &str) -> Option<(PathBuf, &'static str)> {
    let relative_path = uri_path
        .strip_prefix("/asset/")
        .or_else(|| uri_path.strip_prefix('/'))?;
    let mut components = relative_path.split('/');
    if components.next()? != "artwork" {
        return None;
    }
    let prefix = components.next()?;
    let file_name = components.next()?;
    if components.next().is_some()
        || prefix.len() != 2
        || !prefix
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return None;
    }

    let (hash, mime_type) = if let Some(hash) = file_name.strip_suffix(".jpg") {
        (hash, "image/jpeg")
    } else {
        let hash = file_name.strip_suffix(".png")?;
        (hash, "image/png")
    };
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        || !hash.starts_with(prefix)
    {
        return None;
    }

    Some((
        PathBuf::from("artwork").join(prefix).join(file_name),
        mime_type,
    ))
}

fn artwork_response(
    status: tauri::http::StatusCode,
    mime_type: &'static str,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, mime_type)
        .header(tauri::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .expect("valid artwork response")
}

fn serve_artwork(
    app_handle: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET || request.uri().query().is_some() {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    }
    let Some((relative_path, mime_type)) = artwork_path(request.uri().path()) else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    let Ok(data_dir) = app_handle.path().app_data_dir() else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    let Ok(body) = std::fs::read(data_dir.join(relative_path)) else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    artwork_response(tauri::http::StatusCode::OK, mime_type, body)
}

#[derive(Clone)]
struct AppState {
    backend: Arc<BackendApp>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
enum AppEvent {
    #[serde(rename = "playbackStateChanged")]
    Playback(PlaybackSnapshot),
    #[serde(rename = "playbackQueueStateChanged")]
    PlaybackQueue(PlaybackQueueSnapshot),
    #[serde(rename = "applicationActivitiesChanged")]
    ApplicationActivities(Vec<ApplicationActivity>),
    #[serde(rename = "libraryScanStateChanged")]
    LibraryScan(backend::library::models::LibraryScanSnapshot),
}

fn error_code<E: Serialize>(error: E, fallback: &'static str) -> String {
    let code = serde_json::to_value(error)
        .ok()
        .and_then(|value| {
            value
                .get("code")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| fallback.to_owned());
    format!("nativeError:{code}")
}

fn library_error(error: LibraryCommandError) -> String {
    error_code(error, "taskFailed")
}

fn track_error(error: StartLibraryTrackError) -> String {
    error_code(error, "taskFailed")
}

fn album_track_error(error: StartLibraryAlbumTrackError) -> String {
    error_code(error, "taskFailed")
}

fn playback_error(error: PlaybackServiceError) -> String {
    let code = match error {
        PlaybackServiceError::WorkerUnavailable => "playbackWorkerUnavailable",
        PlaybackServiceError::QueueItemNotFound => "queueItemNotFound",
        PlaybackServiceError::QueueBusy => "queueBusy",
        PlaybackServiceError::InvalidVolume => "invalidVolume",
        PlaybackServiceError::InvalidDeviceId => "invalidDeviceId",
        PlaybackServiceError::OutputDeviceUnavailable => "outputDeviceUnavailable",
        PlaybackServiceError::InvalidPlaybackState => "invalidPlaybackState",
        PlaybackServiceError::DurationUnavailable => "durationUnavailable",
        PlaybackServiceError::Seek => "seekFailed",
        PlaybackServiceError::Decode => "decodeFailed",
        PlaybackServiceError::Output(error) => match error {
            PlaybackFailureCode::NoOutputDevice => "noOutputDevice",
            PlaybackFailureCode::OutputDeviceUnavailable => "outputDeviceUnavailable",
            PlaybackFailureCode::UnsupportedOutputConfiguration => "unsupportedOutputConfiguration",
            PlaybackFailureCode::OutputStreamBuildFailed => "outputStreamBuildFailed",
            PlaybackFailureCode::OutputStreamStartFailed => "outputStreamStartFailed",
            PlaybackFailureCode::OutputStreamPauseFailed => "outputStreamPauseFailed",
            PlaybackFailureCode::OutputStreamResumeFailed => "outputStreamResumeFailed",
            PlaybackFailureCode::OutputStreamRuntimeFailed => "outputStreamRuntimeFailed",
            PlaybackFailureCode::CompletionTimingFailed => "completionTimingFailed",
            PlaybackFailureCode::DecodeFailed => "decodeFailed",
            PlaybackFailureCode::SampleRateConversionFailed => "sampleRateConversionFailed",
        },
    };
    format!("nativeError:{code}")
}

fn task_error() -> String {
    "nativeError:taskFailed".to_owned()
}

#[tauri::command]
fn get_playback_state(state: tauri::State<'_, AppState>) -> PlaybackSnapshot {
    state.backend.playback.snapshot()
}

#[tauri::command]
fn get_playback_queue(state: tauri::State<'_, AppState>) -> PlaybackQueueSnapshot {
    state.backend.playback.queue_snapshot()
}

#[tauri::command]
fn pause_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .pause()
        .map_err(playback_error)
}

#[tauri::command]
fn resume_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .resume()
        .map_err(playback_error)
}

#[tauri::command]
fn previous_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .previous()
        .map_err(playback_error)
}

#[tauri::command]
fn next_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .next()
        .map_err(playback_error)
}

#[tauri::command]
fn seek_playback(
    position_ms: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    if !position_ms.is_finite()
        || position_ms < 0.0
        || position_ms.fract() != 0.0
        || position_ms > 9_007_199_254_740_991.0
    {
        return Err("nativeError:invalidArgument".to_owned());
    }
    state
        .backend
        .playback
        .handle()
        .seek(position_ms as u64)
        .map_err(playback_error)
}

#[tauri::command]
fn set_playback_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
        return Err("nativeError:invalidVolume".to_owned());
    }
    state
        .backend
        .playback
        .handle()
        .set_volume(volume as f32)
        .map_err(playback_error)
}

#[tauri::command]
fn set_playback_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    let playback = state.backend.playback.handle();
    if muted {
        playback.mute()
    } else {
        playback.unmute()
    }
    .map_err(playback_error)
}

#[tauri::command]
fn list_audio_output_devices() -> Result<Vec<backend::audio::devices::AudioOutputDevice>, String> {
    list_output_devices()
        .map_err(|error: AudioDeviceListError| error_code(error, "enumerationFailed"))
}

#[tauri::command]
fn get_library_status(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryStatus {
    state.backend.library.status()
}

#[tauri::command]
fn get_library_scan_state(
    state: tauri::State<'_, AppState>,
) -> backend::library::models::LibraryScanSnapshot {
    state.backend.library.handle().scan_state()
}

#[tauri::command]
async fn list_library_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<backend::library::models::LibraryRoot>, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.roots().map_err(library_error))
        .await
        .map_err(|_| task_error())?
}

#[tauri::command]
async fn register_library_root(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || library.register_root(path).map_err(library_error))
        .await
        .map_err(|_| task_error())?
}

#[tauri::command]
async fn set_library_root_enabled(
    id: String,
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryRoot, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.set_root_enabled(id, enabled).map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
fn remove_library_root(id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .remove_root(id)
        .map_err(library_error)
}

#[tauri::command]
fn start_library_scan(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .start_scan()
        .map_err(library_error)
}

#[tauri::command]
fn cancel_library_scan(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .backend
        .library
        .handle()
        .cancel_scan()
        .map_err(library_error)
}

#[tauri::command]
async fn list_library_tracks(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryTrackSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryTrackPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_tracks(cursor, search, sort_key, sort_direction)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn list_library_albums(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_albums(cursor, search, sort_key, sort_direction)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn list_library_album_artists(
    cursor: Option<String>,
    search: Option<String>,
    sort_key: LibraryAlbumArtistSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_artists(cursor, search, sort_key, sort_direction)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn get_library_album_artist(
    artist_key: LibraryAlbumArtistKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumArtistSummary, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.catalog_artist(artist_key).map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn list_library_artist_albums(
    artist_key: LibraryAlbumArtistKey,
    cursor: Option<String>,
    sort_key: LibraryArtistAlbumSortKey,
    sort_direction: LibrarySortDirection,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_artist_albums(artist_key, cursor, sort_key, sort_direction)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn get_library_album_details(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumDetails, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_details(album_key)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn list_library_album_tracks(
    album_key: LibraryAlbumKey,
    cursor: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<backend::library::models::LibraryAlbumTrackPage, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library
            .catalog_album_tracks(album_key, cursor)
            .map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn get_library_track_for_path(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<backend::library::models::LibraryTrackSummary>, String> {
    let library = state.backend.library.handle();
    tauri::async_runtime::spawn_blocking(move || {
        library.track_for_path(path).map_err(library_error)
    })
    .await
    .map_err(|_| task_error())?
}

#[tauri::command]
async fn start_library_track(
    track_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .start_library_track(track_id)
        .await
        .map_err(track_error)
}

#[tauri::command]
async fn start_library_album(
    album_key: LibraryAlbumKey,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .start_library_album(album_key)
        .await
        .map_err(album_track_error)
}

fn forward_events(app: tauri::AppHandle, backend: Arc<BackendApp>) {
    if let Some(receiver) = backend.playback.take_state_changed_receiver() {
        let app = app.clone();
        let backend = Arc::clone(&backend);
        thread::spawn(move || {
            while receiver.recv().is_ok() {
                if app
                    .emit("app:event", AppEvent::Playback(backend.playback.snapshot()))
                    .is_err()
                {
                    log::error!("ipc.event_emit_failed event_name=playbackStateChanged");
                }
            }
        });
    }
    if let Some(receiver) = backend.playback.take_queue_state_changed_receiver() {
        let app = app.clone();
        let backend = Arc::clone(&backend);
        thread::spawn(move || {
            while receiver.recv().is_ok() {
                if app
                    .emit(
                        "app:event",
                        AppEvent::PlaybackQueue(backend.playback.queue_snapshot()),
                    )
                    .is_err()
                {
                    log::error!("ipc.event_emit_failed event_name=playbackQueueStateChanged");
                }
            }
        });
    }
    if let Some(receiver) = backend.library.take_scan_state_changed_receiver() {
        let app = app.clone();
        let backend = Arc::clone(&backend);
        thread::spawn(move || {
            while receiver.recv().is_ok() {
                if app
                    .emit(
                        "app:event",
                        AppEvent::LibraryScan(backend.library.handle().scan_state()),
                    )
                    .is_err()
                {
                    log::error!("ipc.event_emit_failed event_name=libraryScanStateChanged");
                }
            }
        });
    }
    if let Some(receiver) = backend.activities.take_changed_receiver() {
        let app = app.clone();
        let backend = Arc::clone(&backend);
        thread::spawn(move || {
            while receiver.recv().is_ok() {
                if app
                    .emit(
                        "app:event",
                        AppEvent::ApplicationActivities(backend.activities.handle().snapshot()),
                    )
                    .is_err()
                {
                    log::error!("ipc.event_emit_failed event_name=applicationActivitiesChanged");
                }
            }
        });
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .register_uri_scheme_protocol("nice-artwork", |context, request| {
            serve_artwork(context.app_handle(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let data_dir = match std::env::var_os("NICE_AUDIO_PLAYER_TEST_DATA_DIR") {
                Some(path) => PathBuf::from(path),
                None => app.path().app_data_dir()?,
            };
            let backend = tauri::async_runtime::block_on(BackendApp::initialize(data_dir))
                .map_err(|_| std::io::Error::other("backend startup failed"))?;
            let backend = Arc::new(backend);
            app.manage(AppState {
                backend: Arc::clone(&backend),
            });
            forward_events(app.handle().clone(), backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_playback_state,
            get_playback_queue,
            pause_playback,
            resume_playback,
            previous_playback,
            next_playback,
            seek_playback,
            set_playback_volume,
            set_playback_muted,
            list_audio_output_devices,
            get_library_status,
            get_library_scan_state,
            list_library_roots,
            register_library_root,
            set_library_root_enabled,
            remove_library_root,
            start_library_scan,
            cancel_library_scan,
            list_library_tracks,
            list_library_albums,
            list_library_album_artists,
            get_library_album_artist,
            list_library_artist_albums,
            get_library_album_details,
            list_library_album_tracks,
            get_library_track_for_path,
            start_library_track,
            start_library_album
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            handle.state::<AppState>().backend.shutdown();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::artwork_path;

    #[test]
    fn artwork_paths_accept_canonical_content_addresses() {
        let hash = "ab".repeat(32);
        let direct = format!("/artwork/ab/{hash}.jpg");
        let windows_origin = format!("/asset/artwork/ab/{hash}.jpg");

        assert_eq!(artwork_path(&direct).unwrap().1, "image/jpeg");
        assert_eq!(artwork_path(&windows_origin).unwrap().1, "image/jpeg");
    }

    #[test]
    fn artwork_paths_reject_noncanonical_or_traversal_paths() {
        let hash = "ab".repeat(32);

        assert!(artwork_path("/artwork/../secret.png").is_none());
        assert!(artwork_path(&format!("/artwork/aa/{hash}.jpg")).is_none());
        assert!(artwork_path(&format!("/artwork/ab/{}.jpg", "AB".repeat(32))).is_none());
        assert!(artwork_path(&format!("/artwork/ab/{hash}.jpg/extra")).is_none());
    }
}
