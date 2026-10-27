//! The read side of the Library: the lists, the track and Playback lookups, and the artwork paths.
//! Its functions take a connection and read the database. They never write, and they do not take
//! `Library`. `Library` (in `library.rs`) calls them.
//!
//! Each domain file holds its types, its SQL, its row mappers and its reads. `lists` holds what
//! the lists share. The modules depend in one direction: `lists` and `artwork` at the bottom, then
//! `artists`, then `tracks`, then `albums` and `playback`. No module imports a module above it.

pub(crate) mod albums;
pub(crate) mod artists;
pub(crate) mod artwork;
pub(crate) mod lists;
pub(crate) mod playback;
pub(crate) mod tracks;

#[cfg(test)]
mod tests;
