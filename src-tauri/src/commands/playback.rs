use backend::audio::{
    devices::{list_output_devices, AudioDeviceListError},
    playback::{PlaybackQueueSnapshot, PlaybackSnapshot},
};

use crate::{
    errors::{error_code, playback_error},
    AppState,
};

#[tauri::command]
pub fn get_playback_state(state: tauri::State<'_, AppState>) -> PlaybackSnapshot {
    state.backend.playback.snapshot()
}

#[tauri::command]
pub fn get_playback_queue(state: tauri::State<'_, AppState>) -> PlaybackQueueSnapshot {
    state.backend.playback.queue_snapshot()
}

#[tauri::command]
pub fn pause_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .pause()
        .map_err(playback_error)
}

#[tauri::command]
pub fn resume_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .resume()
        .map_err(playback_error)
}

#[tauri::command]
pub fn previous_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .previous()
        .map_err(playback_error)
}

#[tauri::command]
pub fn next_playback(state: tauri::State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    state
        .backend
        .playback
        .handle()
        .next()
        .map_err(playback_error)
}

#[tauri::command]
pub fn seek_playback(
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
pub fn set_playback_volume(
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
pub fn set_playback_muted(
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
pub fn list_audio_output_devices() -> Result<Vec<backend::audio::devices::AudioOutputDevice>, String>
{
    list_output_devices()
        .map_err(|error: AudioDeviceListError| error_code(error, "enumerationFailed"))
}
