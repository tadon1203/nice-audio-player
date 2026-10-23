pub(crate) mod appearance;
pub(crate) mod library;
pub(crate) mod lyrics;
pub(crate) mod meter;
pub(crate) mod playback;
pub(crate) mod session;

use std::sync::Arc;

use backend::{
    app::BackendApp,
    errors::{
        AudioDeviceListError, CommandError, LibraryCommandError, LyricsCommandError,
        PlaybackServiceError, logged,
    },
};

use crate::AppState;

/// An error type that can say its blocking thread died before answering.
pub(crate) trait TaskError {
    fn task_failed() -> Self;
}

impl TaskError for AudioDeviceListError {
    fn task_failed() -> Self {
        Self::EnumerationFailed
    }
}

impl TaskError for LibraryCommandError {
    fn task_failed() -> Self {
        Self::Common {
            error: CommandError::TaskFailed,
        }
    }
}

impl TaskError for LyricsCommandError {
    fn task_failed() -> Self {
        Self::Common {
            error: CommandError::TaskFailed,
        }
    }
}

impl TaskError for PlaybackServiceError {
    fn task_failed() -> Self {
        Self::Common {
            error: CommandError::TaskFailed,
        }
    }
}

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
        .map_err(logged(E::task_failed(), "host.task.failed"))?
}
