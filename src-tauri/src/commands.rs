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

use anyhow::Context;
use backend::{app::BackendApp, errors::CommandError};

use crate::AppState;

/// Runs `work` with the backend on a blocking thread. Every command that touches the database,
/// the playback worker or the filesystem goes through here, so none runs on the main thread.
pub(crate) async fn blocking<T: Send + 'static>(
    state: &tauri::State<'_, AppState>,
    work: impl FnOnce(&BackendApp) -> anyhow::Result<T> + Send + 'static,
) -> Result<T, CommandError> {
    let backend = Arc::clone(&state.backend);
    let result = tauri::async_runtime::spawn_blocking(move || work(&backend))
        .await
        .context("the command task failed")
        .and_then(|result| result);
    respond(result)
}

/// The answer to the Renderer. The code is all that it gets. The failure is logged here, once,
/// with its chain of causes: `warn` when it is internal, `debug` when the Renderer can act on it.
pub(crate) fn respond<T>(result: anyhow::Result<T>) -> Result<T, CommandError> {
    result.map_err(|error| {
        let code = CommandError::of(&error);
        if code == CommandError::Internal {
            log::warn!("host.command.failed code={code:?} cause={error:#}");
        } else {
            log::debug!("host.command.failed code={code:?} cause={error:#}");
        }
        code
    })
}

#[cfg(test)]
mod tests {
    use super::respond;
    use backend::errors::CommandError;

    #[test]
    fn an_io_failure_is_internal() {
        let error = anyhow::Error::from(std::io::Error::other("disk"));

        assert_eq!(respond::<()>(Err(error)), Err(CommandError::Internal));
    }

    #[test]
    fn a_success_passes_through() {
        assert_eq!(respond(Ok(7)), Ok(7));
    }
}
