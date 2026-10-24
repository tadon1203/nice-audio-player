use backend::messages::BackendMessage;
use tauri::ipc::Channel;

use crate::AppState;

/// Registers `channel` as the one channel to the Renderer, replacing an earlier one. Returns the
/// current value of every state topic. A message sent in between has a revision that is not
/// older than the returned value, so the Renderer can order them by revision.
#[tauri::command]
#[specta::specta]
pub(crate) fn app_connect(
    channel: Channel<BackendMessage>,
    state: tauri::State<'_, AppState>,
) -> Vec<BackendMessage> {
    state.subscriber.replace(channel);
    state.backend.messages()
}
