use backend::{
    app::playback_context::{PlaybackContext, StartPlaybackError},
    audio::{
        devices::{list_output_devices, AudioDeviceListError, AudioOutputSelection},
        playback::{
            PlaybackQueueMoveDirection, PlaybackQueueSnapshot, PlaybackRepeatMode,
            PlaybackServiceError, PlaybackSnapshot,
        },
        waveform::PlaybackWaveform,
    },
};

use crate::{errors::PlaybackCommandError, AppState};

/// Playback requests wait on the worker's reply, so they run off the main thread.
async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, PlaybackServiceError> + Send + 'static,
) -> Result<T, PlaybackCommandError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| PlaybackCommandError::PlaybackWorkerUnavailable)?
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn get_playback_state(state: tauri::State<'_, AppState>) -> PlaybackSnapshot {
    state.backend.playback.snapshot()
}

#[tauri::command]
#[specta::specta]
pub fn get_playback_queue(state: tauri::State<'_, AppState>) -> PlaybackQueueSnapshot {
    state.backend.playback.queue_snapshot()
}

/// Replaces the queue with `context` and plays from `start_track_id`, or from the context's
/// first track when it is `None`.
#[tauri::command]
#[specta::specta]
pub async fn start_playback(
    context: PlaybackContext,
    start_track_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, StartPlaybackError> {
    state.backend.start_playback(context, start_track_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn pause_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.pause()).await
}

#[tauri::command]
#[specta::specta]
pub async fn resume_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.resume()).await
}

#[tauri::command]
#[specta::specta]
pub async fn previous_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.previous()).await
}

#[tauri::command]
#[specta::specta]
pub async fn next_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.next()).await
}

#[tauri::command]
#[specta::specta]
pub async fn seek_playback(
    position_ms: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    if !position_ms.is_finite()
        || position_ms < 0.0
        || position_ms.fract() != 0.0
        || position_ms > 9_007_199_254_740_991.0
    {
        return Err(PlaybackCommandError::InvalidArgument);
    }
    let handle = state.backend.playback.handle();
    blocking(move || handle.seek(position_ms as u64)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
        return Err(PlaybackCommandError::InvalidVolume);
    }
    let handle = state.backend.playback.handle();
    blocking(move || handle.set_volume(volume as f32)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || {
        if muted {
            handle.mute()
        } else {
            handle.unmute()
        }
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_audio_output_devices(
) -> Result<Vec<backend::audio::devices::AudioOutputDevice>, AudioDeviceListError> {
    tauri::async_runtime::spawn_blocking(list_output_devices)
        .await
        .map_err(|_| AudioDeviceListError::EnumerationFailed)?
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_repeat_mode(
    mode: PlaybackRepeatMode,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.set_repeat_mode(mode)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_shuffle(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.set_shuffle(enabled)).await
}

/// Switches the output device; a loaded track restarts on it at the same position.
#[tauri::command]
#[specta::specta]
pub async fn set_audio_output_selection(
    selection: AudioOutputSelection,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.set_output_selection(selection)).await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_queue_item(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.remove_queue_item(id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn move_queue_item(
    id: String,
    direction: PlaybackQueueMoveDirection,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.move_queue_item(id, direction)).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_queue(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackCommandError> {
    let handle = state.backend.playback.handle();
    blocking(move || handle.clear_queue()).await
}

/// Waveform of the loaded track, or `None` while it is analyzed; `waveformReady` follows.
#[tauri::command]
#[specta::specta]
pub fn get_playback_waveform(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Option<PlaybackWaveform> {
    state.backend.playback_waveform(&path)
}
