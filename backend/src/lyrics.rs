pub(crate) mod lrc;
pub(crate) mod model;
pub(crate) mod service;

pub use model::{LyricsCommandError, LyricsResolution};
pub(crate) use service::LyricsService;
