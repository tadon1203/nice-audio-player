//! The Backend crate. The Host reaches it through the public modules below and nothing else.
//!
//! - `app`: `BackendApp`, the use cases the Host calls.
//! - `messages`: what the Backend sends and the sink the Host gives it.
//! - `dto`: the IPC types the Backend's answers are made of.
//! - `errors`: the IPC error types.
//! - `tasks`: what a command's error type needs to run on a blocking thread.

pub mod app;
pub mod dto;
pub mod errors;
pub mod ids;
pub mod messages;
pub mod tasks;

pub(crate) mod audio;
pub(crate) mod containment;
pub(crate) mod library;
pub(crate) mod lyrics;
pub(crate) mod media;
pub(crate) mod settings;

#[cfg(test)]
#[path = "audio/test_support.rs"]
pub(crate) mod test_support;
