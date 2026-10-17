use backend::{
    dto::{
        AudioOutputDevice, AudioOutputSelection, PlaybackContext, PlaybackQueueSnapshot,
        PlaybackQueueWindow, PlaybackRepeatMode, PlaybackSnapshot, PlaybackWaveform, Versioned,
    },
    errors::{AudioDeviceListError, PlaybackServiceError},
    ids::{QueueItemId, TrackId},
};

use super::blocking;
use crate::AppState;

/// Upcoming queue items from `offset` (at most `limit`), for the parts of a long queue the
/// snapshot does not carry. Their tracks are read from the library now.
#[tauri::command]
#[specta::specta]
pub async fn get_playback_queue_window(
    offset: u32,
    limit: u32,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackQueueWindow, PlaybackServiceError> {
    blocking(&state, move |backend| {
        Ok(backend.queue_window(offset, limit))
    })
    .await
}

/// Replaces the queue with `context` and plays from `start_track_id`, or from the context's
/// first track when it is `None`.
#[tauri::command]
#[specta::specta]
pub async fn start_playback(
    context: PlaybackContext,
    start_track_id: Option<TrackId>,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.start_playback(&context, start_track_id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn pause_playback(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.pause()).await
}

#[tauri::command]
#[specta::specta]
pub async fn resume_playback(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.resume()).await
}

#[tauri::command]
#[specta::specta]
pub async fn previous_playback(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.previous()).await
}

#[tauri::command]
#[specta::specta]
pub async fn next_playback(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.next()).await
}

#[tauri::command]
#[specta::specta]
pub async fn seek_playback(
    position_ms: u64,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.seek(position_ms)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_volume(volume as f32)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_muted(muted)).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_audio_output_devices(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    blocking(&state, |backend| backend.list_output_devices()).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_repeat_mode(
    mode: PlaybackRepeatMode,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_repeat_mode(mode)).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_playback_shuffle(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_shuffle(enabled)).await
}

/// Switches the output device; a loaded track restarts on it at the same position.
#[tauri::command]
#[specta::specta]
pub async fn set_audio_output_selection(
    selection: AudioOutputSelection,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.set_output_selection(selection)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn remove_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.remove_queue_item(id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn move_queue_item(
    id: QueueItemId,
    to: usize,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.move_queue_item(id, to)).await
}

/// Makes an upcoming queue item current and plays it.
#[tauri::command]
#[specta::specta]
pub async fn play_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.play_queue_item(id)).await
}

/// Adds a library track to the queue: right after the current one (`next`) or at the end.
/// With nothing queued it starts playing.
#[tauri::command]
#[specta::specta]
pub async fn enqueue_track(
    track_id: TrackId,
    next: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.enqueue_track(track_id, next)).await
}

#[tauri::command]
#[specta::specta]
pub async fn clear_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackQueueSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.clear_queue()).await
}

/// Puts back the queue the last replacement or Clear upcoming took away.
#[tauri::command]
#[specta::specta]
pub async fn restore_previous_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<PlaybackSnapshot>, PlaybackServiceError> {
    blocking(&state, |backend| backend.restore_previous_queue()).await
}

/// Waveform of the loaded track, or `None` while it is analyzed, with the Waveform's revision; the
/// channel carries each waveform the Backend has, as a state message.
#[tauri::command]
#[specta::specta]
pub async fn get_playback_waveform(
    state: tauri::State<'_, AppState>,
) -> Result<Versioned<Option<PlaybackWaveform>>, PlaybackServiceError> {
    blocking(&state, |backend| Ok(backend.playback_waveform())).await
}
