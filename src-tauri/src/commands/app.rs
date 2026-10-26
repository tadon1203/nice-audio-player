use backend::errors::CommandError;
use backend::messages::BackendMessage;
use tauri::ipc::Channel;

use crate::AppState;
use crate::commands::respond;
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
    use anyhow::Context;
    use tauri::Manager;
    let opened = async {
        let directory = app
            .path()
            .app_log_dir()
            .context("could not find the log directory")?;
        // The filesystem and a spawned process stay off the main thread.
        tauri::async_runtime::spawn_blocking(move || {
            std::fs::create_dir_all(&directory).context("could not create the log directory")?;
            open_in_file_manager(&directory)
        })
        .await
        .context("the command task failed")?
    };
    respond(opened.await)
}
