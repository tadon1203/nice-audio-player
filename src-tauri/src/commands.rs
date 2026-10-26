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
    work: impl FnOnce(&BackendApp) -> backend::Result<T> + Send + 'static,
) -> Result<T, CommandError> {
    let backend = Arc::clone(&state.backend);
    match tauri::async_runtime::spawn_blocking(move || work(&backend)).await {
        Ok(result) => result.map_err(command_error),
        Err(cause) => {
            log::warn!("host.task.failed cause={cause}");
            Err(CommandError::Internal)
        }
    }
}

/// The code a Backend failure answers the Renderer with. The failure is logged here, once, with
/// its chain of causes: `warn` when it is internal, `debug` when the Renderer can act on it.
fn command_error(error: backend::Error) -> CommandError {
    let code = error.code();
    let chain = cause_chain(&error);
    if code == CommandError::Internal {
        log::warn!("host.command.failed code={code:?} cause={chain}");
    } else {
        log::debug!("host.command.failed code={code:?} cause={chain}");
    }
    code
}

/// The error's text, then the text of each cause below it.
fn cause_chain(error: &dyn std::error::Error) -> String {
    let mut chain = error.to_string();
    let mut cause = error.source();
    while let Some(next) = cause {
        chain.push_str(": ");
        chain.push_str(&next.to_string());
        cause = next.source();
    }
    chain
}

#[cfg(test)]
mod tests {
    use super::command_error;
    use backend::{Error, errors::CommandError};

    #[test]
    fn an_io_failure_is_internal() {
        let error = Error::Io(std::io::Error::other("disk"));

        assert_eq!(command_error(error), CommandError::Internal);
    }

    #[test]
    fn a_failure_the_renderer_can_act_on_keeps_its_code() {
        assert_eq!(
            command_error(Error::DuplicateDirectory),
            CommandError::DuplicateDirectory
        );
    }
}
