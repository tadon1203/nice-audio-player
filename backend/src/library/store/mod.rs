//! The read side of the Library: everything the renderer and playback ask of it. It is built from
//! a database alone, so it can be opened (and tested) without the scanner, the watchers or the
//! sync actor that write to that database.

mod catalog;
mod paging;
mod playback;
#[cfg(test)]
mod tests;
mod track;

pub(crate) use playback::{
    PlayableTrack, PlaybackLookupError, PlaybackSelection, PlaybackSourceError,
};

use super::{
    database::{Database, ReadConnection},
    error::StoreError,
    models::LibraryRoot,
    roots, text,
};

#[derive(Clone)]
pub(crate) struct LibraryStore {
    database: Database,
}

impl LibraryStore {
    pub(crate) fn new(database: Database) -> Self {
        Self { database }
    }

    pub(crate) fn roots(&self) -> Result<Vec<LibraryRoot>, StoreError> {
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

/// A search over a folded key column (see `text.rs`): its SQL condition ("1" for no search) and
/// its parameters (`?1`). The search text is folded like the keys are, so "ゆず" finds "ユズ".
struct SearchFilter {
    sql: String,
    params: Vec<rusqlite::types::Value>,
}

impl SearchFilter {
    fn new(search: Option<&str>, column: &str) -> Self {
        let search = text::search_text(search.unwrap_or_default());
        if search.is_empty() {
            return Self {
                sql: "1".into(),
                params: Vec::new(),
            };
        }
        Self {
            sql: format!("{column} LIKE ?1 ESCAPE '\\'"),
            params: vec![literal_like_pattern(&search).into()],
        }
    }

    /// The search as the scope of a cursor: cursors of another search are refused.
    fn text(search: Option<&str>) -> String {
        text::search_text(search.unwrap_or_default())
    }
}
