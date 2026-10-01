//! Keyset paging shared by every catalog list.
//!
//! A page is the next `PAGE_SIZE` rows after the last row of the previous one, found by comparing
//! the row's sort values (and its id) with the cursor's, so its cost does not depend on how many
//! rows precede it and a write between two requests can neither repeat nor skip a row.
//!
//! Some orders put unknown values last in both directions. They are split into *phases*: runs of
//! rows that share one condition (`artist_key <> ''`, then `artist_key = ''`) and inside which the
//! order is uniform, so each phase is a plain index range. A page continues into the next phase
//! when the current one runs out.

use super::super::{error::StoreError, models::LibrarySortDirection};
use rusqlite::{
    params_from_iter,
    types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, Value, ValueRef},
    Connection, Row, ToSql,
};
use serde::{Deserialize, Serialize};

pub(super) const PAGE_SIZE: usize = 100;
const CURSOR_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) enum View {
    Tracks,
    Albums,
    AlbumArtists,
    ArtistAlbums,
    AlbumTracks,
}

/// What a cursor belongs to. A cursor from another view, search, owner, sort or direction is
/// refused.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct Scope {
    view: View,
    search: String,
    /// The Album Artist or album the list is of, empty for the whole Library.
    owner: String,
    sort: String,
    direction: LibrarySortDirection,
}

impl Scope {
    pub fn new(
        view: View,
        search: &str,
        owner: &str,
        sort: &impl Serialize,
        direction: LibrarySortDirection,
    ) -> Self {
        Self {
            view,
            search: search.to_owned(),
            owner: owner.to_owned(),
            sort: serde_json::to_string(sort).expect("sort keys serialize"),
            direction,
        }
    }
}

/// One sort value of the row a page ended on.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub(super) enum Key {
    Int(i64),
    Text(String),
}

impl ToSql for Key {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            Self::Int(value) => value.to_sql(),
            Self::Text(value) => value.to_sql(),
        }
    }
}

impl FromSql for Key {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value {
            ValueRef::Integer(value) => Ok(Self::Int(value)),
            ValueRef::Text(_) => Ok(Self::Text(value.as_str()?.to_owned())),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Cursor {
    version: u8,
    scope: Scope,
    phase: usize,
    after: Vec<Key>,
}

/// The rows of one phase: the condition that selects them and the sort terms that order them.
/// Terms are SQL expressions, each compared (and collated) as written.
pub(super) struct Phase {
    pub predicate: String,
    pub terms: Vec<String>,
}

impl Phase {
    pub fn new(predicate: &str, terms: &[&str]) -> Self {
        Self {
            predicate: predicate.to_owned(),
            terms: terms.iter().map(|term| (*term).to_owned()).collect(),
        }
    }
}

pub(super) struct Ordering {
    pub phases: Vec<Phase>,
    pub direction: LibrarySortDirection,
}

impl Ordering {
    fn sql_direction(&self) -> &'static str {
        match self.direction {
            LibrarySortDirection::Ascending => "ASC",
            LibrarySortDirection::Descending => "DESC",
        }
    }

    /// The whole order as one `ORDER BY` list, for a query that returns every row.
    pub fn order_by(&self) -> String {
        let direction = self.sql_direction();
        let mut parts = Vec::new();
        if self.phases.len() > 1 {
            let arms: String = self
                .phases
                .iter()
                .enumerate()
                .map(|(index, phase)| format!("WHEN {} THEN {index} ", phase.predicate))
                .collect();
            parts.push(format!("CASE {arms}END"));
        }
        parts.extend(
            self.phases[0]
                .terms
                .iter()
                .map(|term| format!("{term} {direction}")),
        );
        parts.join(", ")
    }
}

pub(super) struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

/// A paged list: how to select its rows, in which order, and what its cursor is valid for.
pub(super) struct PagedQuery {
    pub scope: Scope,
    pub ordering: Ordering,
    /// The columns a row is built from, read by position from 0.
    pub select: String,
    pub select_count: usize,
    /// `FROM … WHERE <filters>`, ending in a complete condition ("1" for none). Its parameters
    /// are `params`, numbered from `?1`.
    pub from_where: String,
    pub params: Vec<Value>,
    /// `GROUP BY …`, or empty.
    pub group_by: String,
}

impl PagedQuery {
    pub fn fetch<T>(
        &self,
        connection: &Connection,
        raw_cursor: Option<&str>,
        build: impl Fn(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Page<T>, StoreError> {
        let cursor = raw_cursor.map(|raw| self.decode(raw)).transpose()?;
        let start = cursor.as_ref().map_or(0, |cursor| cursor.phase);
        let mut rows: Vec<(T, usize, Vec<Key>)> = Vec::new();
        for (index, phase) in self.ordering.phases.iter().enumerate().skip(start) {
            let after = cursor
                .as_ref()
                .filter(|cursor| cursor.phase == index)
                .map(|cursor| &cursor.after);
            if after.is_some_and(|after| after.len() != phase.terms.len()) {
                return Err(StoreError::InvalidCursor);
            }
            let sql = self.sql(phase, after.is_some(), PAGE_SIZE + 1 - rows.len());
            let mut params = self.params.clone();
            for key in after.into_iter().flatten() {
                params.push(match key {
                    Key::Int(value) => Value::Integer(*value),
                    Key::Text(value) => Value::Text(value.clone()),
                });
            }
            let mut statement = connection.prepare_cached(&sql)?;
            let found = statement.query_map(params_from_iter(params), |row| {
                let keys = (0..phase.terms.len())
                    .map(|term| row.get(self.select_count + term))
                    .collect::<rusqlite::Result<Vec<Key>>>()?;
                Ok((build(row)?, index, keys))
            })?;
            for row in found {
                rows.push(row?);
            }
            if rows.len() > PAGE_SIZE {
                break;
            }
        }
        let next_cursor = (rows.len() > PAGE_SIZE).then(|| {
            rows.truncate(PAGE_SIZE);
            let (_, phase, keys) = rows.last().expect("a full page has rows");
            self.encode(*phase, keys.clone())
        });
        Ok(Page {
            items: rows.into_iter().map(|(item, ..)| item).collect(),
            next_cursor,
        })
    }

    /// How SQLite runs a phase's query, one line per step. For checking that a list reads an
    /// index range instead of the whole table.
    #[cfg(test)]
    pub fn plan(&self, connection: &Connection, phase: usize, after: bool) -> Vec<String> {
        let phase = &self.ordering.phases[phase];
        let sql = format!(
            "EXPLAIN QUERY PLAN {}",
            self.sql(phase, after, PAGE_SIZE + 1)
        );
        let mut params = self.params.clone();
        if after {
            params.extend(phase.terms.iter().map(|_| Value::Text("m".into())));
        }
        let mut statement = connection.prepare(&sql).expect("plan statement");
        let rows = statement
            .query_map(params_from_iter(params), |row| row.get::<_, String>(3))
            .expect("plan rows");
        rows.map(|row| row.expect("plan row")).collect()
    }

    fn sql(&self, phase: &Phase, after: bool, limit: usize) -> String {
        let direction = self.ordering.sql_direction();
        let values: String = phase
            .terms
            .iter()
            .enumerate()
            .map(|(index, term)| format!(", {term} AS k{index}"))
            .collect();
        let mut condition = format!("({})", phase.predicate);
        if after {
            let first = self.params.len() + 1;
            let terms = phase.terms.join(", ");
            let marks = (first..first + phase.terms.len())
                .map(|index| format!("?{index}"))
                .collect::<Vec<_>>()
                .join(", ");
            let comparison = match self.ordering.direction {
                LibrarySortDirection::Ascending => ">",
                LibrarySortDirection::Descending => "<",
            };
            condition.push_str(&format!(" AND ({terms}) {comparison} ({marks})"));
        }
        let order = phase
            .terms
            .iter()
            .map(|term| format!("{term} {direction}"))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "SELECT {select}{values} {from_where} AND {condition} {group_by} ORDER BY {order} LIMIT {limit}",
            select = self.select,
            from_where = self.from_where,
            group_by = self.group_by,
        )
    }

    fn decode(&self, raw: &str) -> Result<Cursor, StoreError> {
        let cursor: Cursor = serde_json::from_str(raw).map_err(|_| StoreError::InvalidCursor)?;
        if cursor.version != CURSOR_VERSION
            || cursor.scope != self.scope
            || cursor.phase >= self.ordering.phases.len()
        {
            return Err(StoreError::InvalidCursor);
        }
        Ok(cursor)
    }

    fn encode(&self, phase: usize, after: Vec<Key>) -> String {
        serde_json::to_string(&Cursor {
            version: CURSOR_VERSION,
            scope: self.scope.clone(),
            phase,
            after,
        })
        .expect("a cursor serializes")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(direction: LibrarySortDirection) -> PagedQuery {
        PagedQuery {
            scope: Scope::new(View::Tracks, "", "", &"title", direction),
            ordering: Ordering {
                phases: vec![
                    Phase::new("name <> ''", &["name COLLATE NOCASE", "name", "id"]),
                    Phase::new("name = ''", &["id"]),
                ],
                direction,
            },
            select: "id".into(),
            select_count: 1,
            from_where: "FROM items WHERE 1".into(),
            params: Vec::new(),
            group_by: String::new(),
        }
    }

    fn items() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT NOT NULL);")
            .unwrap();
        // Two hundred and fifty named items and fifty unnamed ones, interleaved by id.
        for id in 1..=300 {
            let name = if id % 6 == 0 {
                String::new()
            } else {
                format!("{}{:03}", if id % 2 == 0 { "b" } else { "B" }, id)
            };
            connection
                .execute(
                    "INSERT INTO items VALUES(?1, ?2)",
                    rusqlite::params![id, name],
                )
                .unwrap();
        }
        connection
    }

    fn all_ids(query: &PagedQuery, connection: &Connection) -> Vec<i64> {
        let mut ids = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let page = query
                .fetch(connection, cursor.as_deref(), |row| row.get::<_, i64>(0))
                .unwrap();
            ids.extend(page.items);
            match page.next_cursor {
                Some(next) => cursor = Some(next),
                None => return ids,
            }
        }
    }

    #[test]
    fn pages_cover_every_row_once_in_both_directions_with_unknown_last() {
        let connection = items();
        for direction in [
            LibrarySortDirection::Ascending,
            LibrarySortDirection::Descending,
        ] {
            let ids = all_ids(&query(direction), &connection);

            let mut sorted = ids.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), 300, "{direction:?}: every row exactly once");
            let first_unnamed = ids.iter().position(|id| id % 6 == 0).unwrap();
            assert!(
                ids[first_unnamed..].iter().all(|id| id % 6 == 0),
                "{direction:?}: unknown names come last"
            );
            assert_eq!(first_unnamed, 250);
        }
    }

    #[test]
    fn a_row_written_between_pages_neither_repeats_nor_skips_one() {
        let connection = items();
        let query = query(LibrarySortDirection::Ascending);
        let first = query
            .fetch(&connection, None, |row| row.get::<_, i64>(0))
            .unwrap();
        // Rows land before and after the cursor while the listener scrolls.
        connection
            .execute("INSERT INTO items VALUES(1000, 'A000')", [])
            .unwrap();
        connection
            .execute("INSERT INTO items VALUES(1001, 'z999')", [])
            .unwrap();

        let second = query
            .fetch(&connection, first.next_cursor.as_deref(), |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();

        assert!(!first.items.contains(&1000));
        assert!(!second.items.contains(&1000), "inserted before the cursor");
        assert!(second.items.iter().all(|id| !first.items.contains(id)));
        assert_eq!(second.items.len(), 100);
        let rest = all_ids_after(&query, &connection, first.next_cursor);
        assert!(rest.contains(&1001), "inserted after the cursor");
    }

    fn all_ids_after(
        query: &PagedQuery,
        connection: &Connection,
        mut cursor: Option<String>,
    ) -> Vec<i64> {
        let mut ids = Vec::new();
        while cursor.is_some() {
            let page = query
                .fetch(connection, cursor.as_deref(), |row| row.get::<_, i64>(0))
                .unwrap();
            ids.extend(page.items);
            cursor = page.next_cursor;
        }
        ids
    }

    #[test]
    fn a_cursor_is_refused_by_any_list_it_does_not_belong_to() {
        let connection = items();
        let ascending = query(LibrarySortDirection::Ascending);
        let cursor = ascending
            .fetch(&connection, None, |row| row.get::<_, i64>(0))
            .unwrap()
            .next_cursor
            .unwrap();

        let descending = query(LibrarySortDirection::Descending);
        for bad in [cursor.as_str(), "", "not json", r#"{"version":1}"#] {
            let error = match descending.fetch(&connection, Some(bad), |row| row.get::<_, i64>(0)) {
                Err(error) => error,
                Ok(_) => panic!("{bad:?} was accepted"),
            };
            assert_eq!(error, StoreError::InvalidCursor);
        }
    }
}
