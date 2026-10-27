//! The parts that every list shares: the request and page types, the SQL of a list, and the letter
//! index. A domain file builds its `Listing` and its sort specs. This file turns a `Listing` into
//! SQL, takes one page of it, and reads its letter index. A letter index groups a list's names by
//! their first character, in the list's own order (see CONTEXT.md).

use crate::library::errors::Result;
use crate::library::storage::keys;
use rusqlite::{Connection, Row, params_from_iter, types::Value};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, specta::Type, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Ascending,
    Descending,
}

/// One page of a list: which rows, how many the whole list has, and the Library version it was
/// read at. A page whose version differs from the first one's means the list changed under it.
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: u32,
    pub version: u64,
}

/// A page request: the search (`None` when empty), the sort, and the window of rows.
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ListRequest<K> {
    pub search: Option<String>,
    pub sort: K,
    pub direction: SortDirection,
    pub offset: u32,
    pub limit: u32,
}

/// What kind of label a letter index entry has. `Unknown` is the entry for the names with no
/// value to file them by, which comes last.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LetterIndexEntryKind {
    Letter,
    Kana,
    Kanji,
    Unknown,
}

/// One entry of a list's letter index: the label its names are filed under, the offset of its
/// first row in the list, and how many rows it has. Entries come in the list's own order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LetterIndexEntry {
    pub label: String,
    pub kind: LetterIndexEntryKind,
    pub start: u32,
    pub count: u32,
}

/// Which sort key a list uses, as SQL. `unknown` is the flag that puts the unknown values last, in
/// both directions. `terms` order the rows: the last term is unique, so pages never overlap.
/// `index_column` is the sort key column the letter index groups by, when there is one.
pub(crate) struct SortSpec {
    pub unknown: Option<&'static str>,
    pub terms: &'static [&'static str],
    pub index_column: Option<&'static str>,
}

/// The WHERE clause of a list: its conditions joined by `AND`, and the parameters they bind. The
/// parameters are numbered from `?1` in the order they were added.
#[derive(Debug, Default)]
pub(crate) struct Filter {
    conditions: Vec<String>,
    pub(crate) params: Vec<Value>,
}

impl Filter {
    /// Adds the condition that `column` equals `value`.
    pub(crate) fn equals(mut self, column: &str, value: impl Into<Value>) -> Self {
        self.params.push(value.into());
        self.conditions
            .push(format!("{column} = ?{}", self.params.len()));
        self
    }

    /// Adds the search over a folded `column`, when there is a search text. The search is folded
    /// like the keys are, so "ゆず" finds "ユズ", and matched literally anywhere in the value.
    pub(crate) fn search(mut self, column: &str, search: Option<&str>) -> Self {
        let search = keys::search_text(search.unwrap_or_default());
        if search.is_empty() {
            return self;
        }
        self.params.push(literal_like_pattern(&search).into());
        self.conditions
            .push(format!("{column} LIKE ?{} ESCAPE '\\'", self.params.len()));
        self
    }

    pub(crate) fn sql(&self) -> String {
        if self.conditions.is_empty() {
            "1".into()
        } else {
            self.conditions.join(" AND ")
        }
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

/// A list before its page is taken: what it selects, what it is selected from, its filter, and its
/// `ORDER BY`.
pub(crate) struct Listing {
    pub(crate) columns: &'static str,
    pub(crate) from: &'static str,
    pub(crate) filter: Filter,
    pub(crate) order: String,
}

impl Listing {
    /// How many rows the filter matches.
    pub(crate) fn total(&self, connection: &Connection) -> Result<u32> {
        let count: i64 = connection.query_row(
            &format!("SELECT COUNT(*) {} WHERE {}", self.from, self.filter.sql()),
            params_from_iter(&self.filter.params),
            |row| row.get(0),
        )?;
        Ok(u32::try_from(count).expect("a row count fits in u32"))
    }

    /// One window of the rows, in the list's order.
    pub(crate) fn page_rows<T>(
        &self,
        connection: &Connection,
        offset: u32,
        limit: u32,
        row: fn(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Vec<T>> {
        let limit_at = self.filter.params.len() + 1;
        let mut params = self.filter.params.clone();
        params.push(Value::Integer(i64::from(limit)));
        params.push(Value::Integer(i64::from(offset)));
        let mut statement = connection.prepare(&format!(
            "SELECT {} {} WHERE {} ORDER BY {} LIMIT ?{limit_at} OFFSET ?{}",
            self.columns,
            self.from,
            self.filter.sql(),
            self.order,
            limit_at + 1
        ))?;
        let rows = statement.query_map(params_from_iter(&params), row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

/// The `ORDER BY` of a list: the unknown flag of its sort key first (so unknown values come last
/// in both directions), then the key terms in the list's direction.
pub(crate) fn order_by(spec: &SortSpec, direction: SortDirection) -> String {
    let mut parts: Vec<String> = spec
        .unknown
        .map(|flag| format!("({flag}) ASC"))
        .into_iter()
        .collect();
    parts.extend(
        spec.terms
            .iter()
            .map(|term| format!("{term} {}", sql_direction(direction))),
    );
    parts.join(", ")
}

pub(crate) fn sql_direction(direction: SortDirection) -> &'static str {
    match direction {
        SortDirection::Ascending => "ASC",
        SortDirection::Descending => "DESC",
    }
}

/// The letter index of a list by one key: the first character of each name (or the year), grouped
/// in the list's order, with the unknown ones last. `key` groups the rows, `known` and `unknown`
/// split them, and `to_label` gives each group's label.
pub(crate) fn letter_entries(
    connection: &Connection,
    listing: &Listing,
    key: &str,
    (known, unknown): (&str, &str),
    direction: SortDirection,
    to_label: fn(&str) -> String,
) -> Result<Vec<LetterIndexEntry>> {
    let filter = listing.filter.sql();
    let mut statement = connection.prepare(&format!(
        "SELECT CAST({key} AS TEXT), COUNT(*) {} WHERE {filter} AND {known} GROUP BY {key} ORDER BY {key} {}",
        listing.from,
        sql_direction(direction)
    ))?;
    let rows = statement.query_map(params_from_iter(&listing.filter.params), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;
    let mut entries: Vec<LetterIndexEntry> = Vec::new();
    let mut known_total: u32 = 0;
    for row in rows {
        let (group, count) = row?;
        let count = u32::try_from(count).expect("a row count fits in u32");
        let label = to_label(&group);
        match entries.last_mut() {
            Some(last) if last.label == label => last.count += count,
            _ => entries.push(LetterIndexEntry {
                kind: entry_kind(&label),
                label,
                start: known_total,
                count,
            }),
        }
        known_total += count;
    }
    let unknown_count: i64 = connection.query_row(
        &format!(
            "SELECT COUNT(*) {} WHERE {filter} AND {unknown}",
            listing.from
        ),
        params_from_iter(&listing.filter.params),
        |row| row.get(0),
    )?;
    if unknown_count > 0 {
        entries.push(LetterIndexEntry {
            label: keys::UNKNOWN_LABEL.into(),
            kind: LetterIndexEntryKind::Unknown,
            start: known_total,
            count: u32::try_from(unknown_count).expect("a row count fits in u32"),
        });
    }
    Ok(entries)
}

/// The kind of a letter index label: the kana rows, the kanji entry, or a letter (or digit,
/// symbol or year) entry.
fn entry_kind(label: &str) -> LetterIndexEntryKind {
    match label {
        keys::UNKNOWN_LABEL => LetterIndexEntryKind::Unknown,
        keys::KANJI_LABEL => LetterIndexEntryKind::Kanji,
        "あ" | "か" | "さ" | "た" | "な" | "は" | "ま" | "や" | "ら" | "わ" => {
            LetterIndexEntryKind::Kana
        }
        _ => LetterIndexEntryKind::Letter,
    }
}

/// The letter index of a list by a name column.
pub(crate) fn name_index(
    connection: &Connection,
    listing: &Listing,
    column: &str,
    direction: SortDirection,
) -> Result<Vec<LetterIndexEntry>> {
    letter_entries(
        connection,
        listing,
        &format!("substr({column}, 1, 1)"),
        (&format!("{column} <> ''"), &format!("{column} = ''")),
        direction,
        keys::index_label,
    )
}
