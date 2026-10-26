use backend::errors::CommandError;
use backend::messages::BackendMessage;
use tauri::ipc::Channel;

use crate::AppState;
use crate::os::open_in_file_manager;

/// Registers `channel` as the one channel to the Renderer, replacing an earlier one. The latest
/// value of every state comes first on it, then the messages as they are sent.
#[tauri::command]
#[specta::specta]
pub(crate) fn app_connect(channel: Channel<BackendMessage>, state: tauri::State<'_, AppState>) {
    state.delivery.connect(channel);
}

/// Opens the directory holding the log files in the file manager.
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_open_log_directory(app: tauri::AppHandle) -> Result<(), CommandError> {
    use tauri::Manager;
    let directory = app
        .path()
        .app_log_dir()
        .inspect_err(|cause| log::warn!("host.library.log_dir_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)?;
    // The filesystem and a spawned process stay off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&directory)
            .inspect_err(|cause| log::warn!("host.library.create_dir_failed cause={cause}"))
            .map_err(|_| CommandError::TaskFailed)?;
        open_in_file_manager(&directory)
    })
    .await
    .inspect_err(|cause| log::warn!("host.library.task_failed cause={cause}"))
    .map_err(|_| CommandError::TaskFailed)?
}
