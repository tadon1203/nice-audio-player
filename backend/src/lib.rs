//! The Backend crate. The Host reaches it through the public modules below and nothing else.
//!
//! - `app`: `BackendApp`, the use cases the Host calls.
//! - `cleanup`: `remove_file_best_effort`, which logs a file that cannot be removed.
//! - `messages`: what the Backend sends and the sink the Host gives it.
//! - `diagnostics`: `logged`, which logs a dropped error cause and keeps the typed code, and
//!   `log_failed`, which logs a `Result` that has no caller.
//! - `dto`: the IPC types the Backend's answers are made of.
//! - `errors`: the IPC error types.
//! - `sync`: the locks the Backend and the Host take, with poisoned locks recovered.
//! - `tasks`: what a command's error type needs to run on a blocking thread.

pub mod app;
pub mod cleanup;
pub mod diagnostics;
pub mod dto;
pub mod errors;
pub mod ids;
pub mod messages;
pub mod sync;
pub mod tasks;

pub(crate) mod audio;
pub(crate) mod containment;
pub(crate) mod library;
pub(crate) mod lyrics;
pub(crate) mod media;
pub(crate) mod settings;
pub(crate) mod slices;

#[cfg(test)]
#[path = "audio/test_support.rs"]
pub(crate) mod test_support;
