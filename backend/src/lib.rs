//! The Backend crate. The Host reaches it through the public modules below and nothing else.
//!
//! - `app`: `BackendApp`, the use cases the Host calls.
//! - `messages`: `BackendMessage`, what the Backend sends the Host on the channel the Host gives it.
//! - `errors`: `Error`, the failure of a Backend function, and `CommandError`, the code the Host
//!   answers the Renderer with.
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

#[cfg(test)]
pub(crate) mod test_support;

pub use errors::{Error, Result};
