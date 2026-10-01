//! The read side of the Library: everything the renderer and playback ask of it. It is built from
//! a database alone, so it can be opened (and tested) without the scanner, the watchers or the
//! sync actor that write to that database.

mod catalog;
mod paging;
mod playback;
#[cfg(test)]
mod tests;
mod track;

pub use playback::{PlayableTrack, PlaybackSelection, PlaybackSourceError};

use super::{
    database::{Database, ReadConnection},
    error::StoreError,
    models::LibraryRoot,
    roots,
};

#[derive(Clone)]
pub struct LibraryStore {
    database: Database,
}

impl LibraryStore {
    pub fn new(database: Database) -> Self {
        Self { database }
    }

    pub fn roots(&self) -> Result<Vec<LibraryRoot>, StoreError> {
        let connection = self.read()?;
        roots::list(&connection)
    }

    fn read(&self) -> Result<ReadConnection, StoreError> {
        Ok(self.database.read()?)
    }
}

/// A search term as a `LIKE` pattern that matches it literally anywhere in a value.
fn literal_like_pattern(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

/// A search over some key columns: its SQL condition ("1" for no search) and its parameters
/// (`?1`).
struct SearchFilter {
    sql: String,
    params: Vec<rusqlite::types::Value>,
}

impl SearchFilter {
    fn new(search: Option<&str>, columns: &[&str]) -> Self {
        let search = search.unwrap_or_default().trim();
        if search.is_empty() {
            return Self {
                sql: "1".into(),
                params: Vec::new(),
            };
        }
        let conditions: Vec<String> = columns
            .iter()
            .map(|column| format!("{column} LIKE ?1 ESCAPE '\\'"))
            .collect();
        Self {
            sql: format!("({})", conditions.join(" OR ")),
            params: vec![literal_like_pattern(search).into()],
        }
    }

    fn text(search: Option<&str>) -> &str {
        search.unwrap_or_default().trim()
    }
}

/// An unnamed album or artist is the empty string; a key with space around it is not one.
fn is_normalized(value: &str) -> bool {
    value.trim() == value
}
