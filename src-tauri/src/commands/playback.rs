use backend::{
    app::BackendApp,
    app::{
        AudioOutputDevice, AudioOutputSelection, PlaybackContext, PlaybackState, QueueState,
        QueueWindow, RepeatMode, Revisioned,
    },
    errors::CommandError,
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
) -> Result<QueueWindow, CommandError> {
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
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend
            .play(&context, start_track_id)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_pause(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, |backend| {
        backend.pause().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_resume(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, |backend| {
        backend.resume().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_previous(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, |backend| {
        backend.previous().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_next(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, |backend| backend.next().map_err(CommandError::from)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_seek(
    position_ms: u64,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend.seek(position_ms).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend
            .set_volume(volume as f32)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend.set_muted(muted).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_list_output_devices(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AudioOutputDevice>, CommandError> {
    blocking(&state, |_| {
        BackendApp::list_output_devices().map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_repeat_mode(
    mode: RepeatMode,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, move |backend| {
        backend.set_repeat_mode(mode).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_shuffle(
    enabled: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, move |backend| {
        backend.set_shuffle(enabled).map_err(CommandError::from)
    })
    .await
}

/// Switches the output device; a loaded track restarts on it at the same position.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_set_output_selection(
    selection: AudioOutputSelection,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend
            .set_output_selection(selection)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_remove_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, move |backend| {
        backend.remove_queue_item(id).map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_move_queue_item(
    id: QueueItemId,
    to: usize,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, move |backend| {
        backend.move_queue_item(id, to).map_err(CommandError::from)
    })
    .await
}

/// Makes an upcoming queue item current and plays it.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_play_queue_item(
    id: QueueItemId,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, move |backend| {
        backend.play_queue_item(id).map_err(CommandError::from)
    })
    .await
}

/// Adds a library track to the queue: right after the current one (`next`) or at the end.
/// With nothing queued it starts playing.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_enqueue_track(
    track_id: TrackId,
    next: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, move |backend| {
        backend
            .enqueue_track(track_id, next)
            .map_err(CommandError::from)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn player_clear_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<QueueState>, CommandError> {
    blocking(&state, |backend| {
        backend.clear_queue().map_err(CommandError::from)
    })
    .await
}

/// Puts back the queue the last replacement or Clear upcoming took away.
#[tauri::command]
#[specta::specta]
pub(crate) async fn player_restore_previous_queue(
    state: tauri::State<'_, AppState>,
) -> Result<Revisioned<PlaybackState>, CommandError> {
    blocking(&state, |backend| {
        backend.restore_previous_queue().map_err(CommandError::from)
    })
    .await
}
