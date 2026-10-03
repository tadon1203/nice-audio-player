pub mod library;
pub mod lyrics;
pub mod meter;
pub mod playback;
pub mod settings;

use std::sync::Arc;

use backend::{app::BackendApp, tasks::TaskError};

use crate::AppState;

/// Runs `work` with the backend on a blocking thread. Every command that touches the database,
/// the playback worker or the filesystem goes through here, so none runs on the main thread.
pub(crate) async fn blocking<T, E>(
    state: &tauri::State<'_, AppState>,
    work: impl FnOnce(&BackendApp) -> Result<T, E> + Send + 'static,
) -> Result<T, E>
where
    T: Send + 'static,
    E: TaskError + Send + 'static,
{
    let backend = Arc::clone(&state.backend);
    tauri::async_runtime::spawn_blocking(move || work(&backend))
        .await
        .map_err(|_| E::task_failed())?
}
