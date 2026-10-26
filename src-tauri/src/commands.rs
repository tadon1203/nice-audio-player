#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri passes State and AppHandle by value"
)]

pub(crate) mod app;
pub(crate) mod appearance;
pub(crate) mod library;
pub(crate) mod lyrics;
pub(crate) mod meter;
pub(crate) mod player;

use std::sync::Arc;

use backend::{app::BackendApp, errors::CommandError};

use crate::AppState;

/// Runs `work` with the backend on a blocking thread. Every command that touches the database,
/// the playback worker or the filesystem goes through here, so none runs on the main thread.
pub(crate) async fn blocking<T: Send + 'static>(
    state: &tauri::State<'_, AppState>,
    work: impl FnOnce(&BackendApp) -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    let backend = Arc::clone(&state.backend);
    tauri::async_runtime::spawn_blocking(move || work(&backend))
        .await
        .inspect_err(|cause| log::warn!("host.task.failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)?
}
