use backend::{
    app::BackendApp,
    app::{
        AudioOutputDevice, AudioOutputSelection, PlaybackContext, PlaybackState, QueueState,
        QueueWindow, RepeatMode, Revisioned,
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
pub(crate) async fn player_queue_window(
    offset: u32,
    limit: u32,
    state: tauri::State<'_, AppState>,
) -> Result<QueueWindow, PlaybackServiceError> {
    blocking(&state, move |backend| {
        Ok(backend.queue_window(offset, limit))
    })
    .await
}

/// Replaces the queue with `context` and plays from `start_track_id`, or from the context's
/// first track when it is `None`.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_play(
    context: PlaybackContext,
    start_track_id: Option<TrackId>,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.play(&context, start_track_id)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_pause(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, BackendApp::pause).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_resume(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, BackendApp::resume).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_previous(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, BackendApp::previous).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_next(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, BackendApp::next).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_seek(
    position_ms: u64,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.seek(position_ms)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_volume(volume as f32)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_muted(muted)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_list_output_devices(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AudioOutputDevice>, AudioDeviceListError> {
    blocking(&state, |_| BackendApp::list_output_devices()).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_repeat_mode(
    mode: RepeatMode,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_repeat_mode(mode)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_shuffle(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.set_shuffle(enabled)).await
}

/// Switches the output device; a loaded track restarts on it at the same position.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_output_selection(
    selection: AudioOutputSelection,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| {
        backend.set_output_selection(selection)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_remove_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.remove_queue_item(id)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_move_queue_item(
    id: QueueItemId,
    to: usize,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.move_queue_item(id, to)).await
}

/// Makes an upcoming queue item current and plays it.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_play_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.play_queue_item(id)).await
}

/// Adds a library track to the queue: right after the current one (`next`) or at the end.
/// With nothing queued it starts playing.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_enqueue_track(
    track_id: TrackId,
    next: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, move |backend| backend.enqueue_track(track_id, next)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_clear_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, PlaybackServiceError> {
    blocking(&state, BackendApp::clear_queue).await
}

/// Puts back the queue the last replacement or Clear upcoming took away.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_restore_previous_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, PlaybackServiceError> {
    blocking(&state, BackendApp::restore_previous_queue).await
}
