//! The failure of a Player function. A variant exists only where a caller matches it. Every other
//! failure is `Internal`. The messages are for the log.

use crate::errors::CommandError;
use crate::library::errors::LibraryError;

#[derive(Debug, thiserror::Error)]
pub(crate) enum PlayerError {
    #[error("the queue item is not upcoming or is not in the queue")]
    QueueItemNotFound,
    #[error(transparent)]
    Library(#[from] LibraryError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub(crate) type Result<T> = std::result::Result<T, PlayerError>;

impl PlayerError {
    /// The code the Renderer sees.
    pub(crate) fn code(&self) -> CommandError {
        match self {
            Self::QueueItemNotFound => CommandError::NotFound,
            Self::Library(error) => error.code(),
            Self::Internal(_) => CommandError::Internal,
        }
    }
}

/// `?` turns a file or audio device error into `Internal`. A variant of its own is not needed,
/// because no caller matches these errors.
macro_rules! internal_from {
    ($($error:ty),+) => {$(
        impl From<$error> for PlayerError {
            fn from(error: $error) -> Self {
                Self::Internal(error.into())
            }
        }
    )+};
}

internal_from!(std::io::Error, cpal::Error);
