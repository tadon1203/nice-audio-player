use backend::audio::{
    devices::{list_output_devices, AudioDeviceListError},
    playback::{PlaybackQueueSnapshot, PlaybackSnapshot},
};

use crate::{errors::PlaybackCommandError, AppState};

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

#[tauri::command]
#[specta::specta]
pub fn pause_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    state
        .backend
        .playback
        .handle()
        .pause()
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn resume_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    state
        .backend
        .playback
        .handle()
        .resume()
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn previous_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    state
        .backend
        .playback
        .handle()
        .previous()
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn next_playback(
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    state
        .backend
        .playback
        .handle()
        .next()
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn seek_playback(
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
    state
        .backend
        .playback
        .handle()
        .seek(position_ms as u64)
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn set_playback_volume(
    volume: f64,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
        return Err(PlaybackCommandError::InvalidVolume);
    }
    state
        .backend
        .playback
        .handle()
        .set_volume(volume as f32)
        .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn set_playback_muted(
    muted: bool,
    state: tauri::State<'_, AppState>,
) -> Result<PlaybackSnapshot, PlaybackCommandError> {
    let playback = state.backend.playback.handle();
    if muted {
        playback.mute()
    } else {
        playback.unmute()
    }
    .map_err(PlaybackCommandError::from)
}

#[tauri::command]
#[specta::specta]
pub fn list_audio_output_devices(
) -> Result<Vec<backend::audio::devices::AudioOutputDevice>, AudioDeviceListError> {
    list_output_devices()
}
