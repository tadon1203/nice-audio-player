use backend::{
    app::playback_context::PlaybackContext,
    audio::{
        devices::{list_output_devices, AudioDeviceListError, AudioOutputSelection},
        playback::{
            PlaybackQueueSnapshot, PlaybackQueueWindow, PlaybackRepeatMode, PlaybackServiceError,
            PlaybackSnapshot,
        },
        waveform::PlaybackWaveform,
    },
};

use super::blocking;
use crate::AppState;

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

/// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
/// snapshot does not carry.
#[tauri::command]
#[specta::specta]
pub fn get_playback_queue_window(
    offset: u32,
    limit: u32,
    state: tauri::State<'_, AppState>,
) -> PlaybackQueueWindow {
    state
        .backend
        .playback
        .handle()
        .queue_window(offset as usize, limit as usize)
}

/// Replaces the queue with `context` and plays from `start_track_id`, or from the context's
/// first track when it is `None`.
#[tauri::command]
#[specta::specta]
pub async fn start_playback(
    context: PlaybackContext,
    start_track_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.start_playback(&context, start_track_id.as_deref())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn pause_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| backend.playback.handle().pause()).await
}

#[tauri::command]
#[specta::specta]
pub async fn resume_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| backend.playback.handle().resume()).await
}

#[tauri::command]
#[specta::specta]
pub async fn previous_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| backend.playback.handle().previous()).await
}

#[tauri::command]
#[specta::specta]
pub async fn next_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| backend.playback.handle().next()).await
}

#[tauri::command]
#[specta::specta]
pub async fn seek_playback(
    position_ms: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    if !position_ms.is_finite() {
        return Err(PlaybackServiceError::InvalidArgument);
    }
    // A position between milliseconds is rounded down; one outside the track is clamped by the
    // worker.
    let position_ms = position_ms.clamp(0.0, 9_007_199_254_740_991.0).floor() as u64;
    blocking(&state, move |backend| {
        backend.playback.handle().seek(position_ms)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().set_volume(volume as f32)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        let handle = backend.playback.handle();
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
    state: tauri::State<'_, AppState>,
) -> Result<Vec<backend::audio::devices::AudioOutputDevice>, AudioDeviceListError> {
    blocking(&state, |_| list_output_devices()).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_repeat_mode(
    mode: PlaybackRepeatMode,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().set_repeat_mode(mode)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_shuffle(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().set_shuffle(enabled)
    })
    .await
}

/// Switches the output device; a loaded track restarts on it at the same position.
#[tauri::command]
#[specta::specta]
pub async fn set_audio_output_selection(
    selection: AudioOutputSelection,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().set_output_selection(selection)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_queue_item(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().remove_queue_item(id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn move_queue_item(
    id: String,
    to: usize,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().move_queue_item(id, to)
    })
    .await
}

/// Makes an upcoming queue item current and plays it.
#[tauri::command]
#[specta::specta]
pub async fn play_queue_item(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().play_queue_item(id)
    })
    .await
}

/// Adds a library track to the queue: right after the current one (`next`) or at the end.
/// With nothing queued it starts playing.
#[tauri::command]
#[specta::specta]
pub async fn enqueue_track(
    track_id: String,
    next: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.enqueue_track(&track_id, next)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_queue(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueSnapshot, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.playback.handle().clear_queue()
    })
    .await
}

/// Waveform of the loaded track, or `None` while it is analyzed; `waveformChanged` follows.
#[tauri::command]
#[specta::specta]
pub async fn get_playback_waveform(
    state: tauri::State<'_, AppState>,
) -> Result<Option<PlaybackWaveform>, PlaybackServiceError> {
    blocking(&state, move |backend| Ok(backend.playback_waveform())).await
}
