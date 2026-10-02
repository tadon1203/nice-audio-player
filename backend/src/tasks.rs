//! What a command's error type needs for the host to run it on a blocking thread.

/// An error type that can say its blocking thread died before answering.
pub trait TaskError {
    fn task_failed() -> Self;
}
