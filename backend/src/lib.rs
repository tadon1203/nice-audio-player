//! The Backend crate. The Host reaches it through the public modules below and nothing else.
//!
//! - `app`: `BackendApp`, the use cases the Host calls.
//! - `messages`: what the Backend sends and the `Notifier` the Host gives it.
//! - `errors`: `CommandError`, the code every command answers with, and `contain`, which keeps a
//!   panic from a parser from reaching the Host.
//! - `ids`: the id types the Host names.
//! - `threads`: `Cancellation`, `request`, and `run_in_background`.

pub mod app;
pub mod errors;
pub mod ids;
pub mod messages;
pub mod threads;

pub(crate) mod library;
pub(crate) mod lyrics;
pub(crate) mod meter;
pub(crate) mod player;
pub(crate) mod settings;
pub(crate) mod state_store;

#[cfg(test)]
pub(crate) mod test_support;
