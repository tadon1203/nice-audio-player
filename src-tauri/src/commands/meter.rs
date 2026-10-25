use backend::app::MeterFrame;
use tauri::ipc::Channel;

use crate::AppState;

/// Starts sending Meter frames to `frames` as JSON messages, replacing the channel of an earlier
/// start. A frame the channel cannot deliver is dropped; the Renderer starts again when it needs
/// the frames back.
#[tauri::command]
#[specta::specta]
pub(crate) fn meter_start(frames: Channel<MeterFrame>, state: tauri::State<'_, AppState>) {
    state.backend.meter().start(Box::new(move |frame| {
        frames.send(frame.clone()).ok();
    }));
}

/// Stops sending Meter frames. The measurement continues only while the Player runs.
#[tauri::command]
#[specta::specta]
pub(crate) fn meter_stop(state: tauri::State<'_, AppState>) {
    state.backend.meter().stop();
}
