//! The lists of the Library: Tracks, Albums, Album Artists, one Album Artist's albums and one
//! album's tracks, the letter index of each, and the details of one album or Album Artist.
//!
//! A page is one query: the filter, then `ORDER BY` with the unknown values last in both
//! directions, then `LIMIT` and `OFFSET`. `total` counts with the same filter. Tracks are read from
//! the normalized columns of `track_source_metadata` (see `text.rs`); albums and Album Artists from
//! their summary tables (see `summary.rs`). An album is found by its ID, which is hashed from its
//! (Album Artist, title, directory) (see `ids.rs`).

use super::models::{
    AlbumDetails, AlbumRow, AlbumSortKey, AlbumTrackRow, ArtistAlbumSortKey, ArtistRef, ArtistRow,
    ArtistSortKey, LetterIndexEntry, LetterIndexEntryKind, ListRequest, Page, SortDirection,
    TrackCore, TrackRow, TrackSortKey,
};
use super::{
    Library, StoreError, text,
    tracks::{artwork_ref, non_blank, playable_file_condition, track_album, track_state},
};
use crate::errors::CommandError;
use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, artist_id_column, track_id_column};
use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter, types::Value};

/// An album's tracks in playing order: by disc, then track, unnumbered ones last.
pub(super) const ALBUM_ORDER: &str =
    "COALESCE(m.disc_number, 2147483647), COALESCE(m.track_number, 2147483647), m.track_id";

/// The WHERE clause of a list: its conditions joined by `AND`, and the parameters they bind, which
/// are numbered from `?1` in the order they were added.
#[derive(Debug, Default)]
pub(super) struct Filter {
    conditions: Vec<String>,
    pub(super) params: Vec<Value>,
}

impl Filter {
    /// Adds `condition`, in which `{}` stands for the parameter `value` is bound to.
    fn with(mut self, condition: &str, value: impl Into<Value>) -> Self {
        self.params.push(value.into());
        let placeholder = format!("?{}", self.params.len());
        self.conditions.push(condition.replace("{}", &placeholder));
        self
    }

    /// Adds the search over a folded `column`, when there is a search text. The search is folded
    /// like the keys are, so "ゆず" finds "ユズ", and matched literally anywhere in the value.
    fn search(self, column: &str, search: Option<&str>) -> Self {
        let search = text::search_text(search.unwrap_or_default());
        if search.is_empty() {
            return self;
        }
        self.with(
            &format!("{column} LIKE {{}} ESCAPE '\\'"),
            literal_like_pattern(&search),
        )
    }

    pub(super) fn sql(&self) -> String {
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
pub(super) struct Listing {
    pub(super) columns: &'static str,
    pub(super) from: &'static str,
    pub(super) filter: Filter,
    pub(super) order: String,
}

impl Listing {
    fn total(&self, connection: &Connection) -> Result<u32, StoreError> {
        let count: i64 = connection.query_row(
            &format!("SELECT COUNT(*) {} WHERE {}", self.from, self.filter.sql()),
            params_from_iter(&self.filter.params),
            |row| row.get(0),
        )?;
        Ok(u32::try_from(count).expect("a row count fits in u32"))
    }

    fn rows<T>(
        &self,
        connection: &Connection,
        offset: u32,
        limit: u32,
        row: fn(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Vec<T>, StoreError> {
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
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }
}

/// The `ORDER BY` of a list: the unknown flag of its sort key first (so unknown values come last
/// in both directions), then the key terms in the list's direction. The last term is unique, so
/// pages never overlap.
fn order_by(unknown: Option<&str>, terms: &[&str], direction: SortDirection) -> String {
    let mut parts: Vec<String> = unknown
        .map(|flag| format!("({flag}) ASC"))
        .into_iter()
        .collect();
    parts.extend(
        terms
            .iter()
            .map(|term| format!("{term} {}", sql_direction(direction))),
    );
    parts.join(", ")
}

fn sql_direction(direction: SortDirection) -> &'static str {
    match direction {
        SortDirection::Ascending => "ASC",
        SortDirection::Descending => "DESC",
    }
}

/// The columns of a track row, in the order `track_row` reads them.
const TRACK_COLUMNS: &str = "t.id, m.title, m.artist, m.album, al.album_artist, m.duration_ms, a.content_hash, a.mime_type, f.availability, f.inspection_status, m.album_id, al.artist_id";
const TRACK_FROM: &str = "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id LEFT JOIN albums al ON al.id = m.album_id";

fn track_row(row: &Row<'_>) -> rusqlite::Result<TrackRow> {
    let artist: String = row.get(2)?;
    let album = track_album(
        row.get(3)?,
        album_id_column(row, 10)?,
        row.get::<_, Option<String>>(11)?
            .and_then(|hex| ArtistId::from_hex(&hex)),
        row.get(4)?,
    );
    Ok(TrackRow {
        core: TrackCore {
            id: track_id_column(row, 0)?,
            title: row.get(1)?,
            artist: (!artist.is_empty()).then_some(artist),
            duration_ms: row.get::<_, Option<i64>>(5)?.map(|value| value as u64),
            artwork: artwork_ref(row.get(6)?, row.get(7)?),
        },
        state: track_state(row.get(8)?, row.get(9)?),
        album,
    })
}

/// The Tracks list: every track, filtered by `search`, in `sort` order.
pub(super) fn track_listing(
    search: Option<&str>,
    sort: TrackSortKey,
    direction: SortDirection,
) -> Listing {
    let (unknown, terms): (Option<&str>, &[&str]) = match sort {
        TrackSortKey::Title => (
            Some("m.title_sort = ''"),
            &["m.title_sort", "m.title", "m.track_id"],
        ),
        TrackSortKey::Artist => (
            Some("m.artist_sort = ''"),
            &["m.artist_sort", "m.artist", "m.track_id"],
        ),
        TrackSortKey::Album => (
            Some("m.album_sort = ''"),
            &["m.album_sort", "m.album", "m.track_id"],
        ),
        TrackSortKey::Duration => (
            Some("m.duration_ms IS NULL"),
            &["m.duration_ms", "m.track_id"],
        ),
    };
    Listing {
        columns: TRACK_COLUMNS,
        from: TRACK_FROM,
        filter: Filter::default().search("m.search_text", search),
        order: order_by(unknown, terms, direction),
    }
}

/// The sort key column of a track sort order, when the letter index is by it.
fn track_index_column(sort: TrackSortKey) -> Option<&'static str> {
    match sort {
        TrackSortKey::Title => Some("m.title_sort"),
        TrackSortKey::Artist => Some("m.artist_sort"),
        TrackSortKey::Album => Some("m.album_sort"),
        TrackSortKey::Duration => None,
    }
}

/// The columns of an album row, in the order `album_row` reads them.
const ALBUM_COLUMNS: &str =
    "al.title, al.album_artist, al.year, a.content_hash, a.mime_type, al.artist_id, al.id";
const ALBUM_FROM: &str = "FROM albums al LEFT JOIN artwork_assets a ON a.id = al.cover_artwork_id";

fn album_row(row: &Row<'_>) -> rusqlite::Result<AlbumRow> {
    Ok(AlbumRow {
        id: album_id_column(row, 6)?,
        title: row.get(0)?,
        album_artist: ArtistRef {
            id: artist_id_column(row, 5)?,
            name: row.get(1)?,
        },
        year: row.get(2)?,
        artwork: artwork_ref(row.get(3)?, row.get(4)?),
    })
}

/// The Albums list: one row per album, filtered by `search`.
fn album_listing(search: Option<&str>, sort: AlbumSortKey, direction: SortDirection) -> Listing {
    let (unknown, terms): (Option<&str>, &[&str]) = match sort {
        AlbumSortKey::Title => (
            Some("al.title_sort = ''"),
            &[
                "al.title_sort",
                "al.title",
                "al.album_artist_sort",
                "al.album_artist",
                "al.id",
            ],
        ),
        AlbumSortKey::Artist => (
            Some("al.album_artist_sort = ''"),
            &[
                "al.album_artist_sort",
                "al.album_artist",
                "al.title_sort",
                "al.title",
                "al.id",
            ],
        ),
        AlbumSortKey::Year => (
            Some("al.year IS NULL"),
            &[
                "al.year",
                "al.title_sort",
                "al.title",
                "al.album_artist_sort",
                "al.album_artist",
                "al.id",
            ],
        ),
    };
    Listing {
        columns: ALBUM_COLUMNS,
        from: ALBUM_FROM,
        filter: Filter::default().search("al.search_text", search),
        order: order_by(unknown, terms, direction),
    }
}

/// The sort key column of an album sort order, when the letter index is by name.
fn album_index_column(sort: AlbumSortKey) -> Option<&'static str> {
    match sort {
        AlbumSortKey::Title => Some("al.title_sort"),
        AlbumSortKey::Artist => Some("al.album_artist_sort"),
        AlbumSortKey::Year => None,
    }
}

/// The columns of an Album Artist row, in the order `read_artist` reads them.
const ARTIST_COLUMNS: &str =
    "ar.id, ar.name, ar.album_count, ar.track_count, a.content_hash, a.mime_type";
const ARTIST_FROM: &str =
    "FROM artists ar LEFT JOIN artwork_assets a ON a.id = ar.cover_artwork_id";

fn read_artist(row: &Row<'_>) -> rusqlite::Result<ArtistRow> {
    Ok(ArtistRow {
        id: artist_id_column(row, 0)?,
        name: row.get(1)?,
        album_count: row.get::<_, i64>(2)? as u64,
        track_count: row.get::<_, i64>(3)? as u64,
        artwork: artwork_ref(row.get(4)?, row.get(5)?),
    })
}

/// The Album Artists list: one row per Album Artist, filtered by `search`.
fn artist_listing(search: Option<&str>, sort: ArtistSortKey, direction: SortDirection) -> Listing {
    let (unknown, terms): (Option<&str>, &[&str]) = match sort {
        ArtistSortKey::Artist => (
            Some("ar.name_sort = ''"),
            &["ar.name_sort", "ar.name", "ar.id"],
        ),
        ArtistSortKey::AlbumCount => (
            None,
            &["ar.album_count", "ar.name_sort", "ar.name", "ar.id"],
        ),
        ArtistSortKey::TrackCount => (
            None,
            &["ar.track_count", "ar.name_sort", "ar.name", "ar.id"],
        ),
    };
    Listing {
        columns: ARTIST_COLUMNS,
        from: ARTIST_FROM,
        filter: Filter::default().search("ar.search_text", search),
        order: order_by(unknown, terms, direction),
    }
}

/// The albums of one Album Artist, filtered by `search`.
fn artist_album_listing(
    artist: ArtistId,
    search: Option<&str>,
    sort: ArtistAlbumSortKey,
    direction: SortDirection,
) -> Listing {
    let (unknown, terms): (Option<&str>, &[&str]) = match sort {
        ArtistAlbumSortKey::Title => (
            Some("al.title_sort = ''"),
            &["al.title_sort", "al.title", "al.id"],
        ),
        ArtistAlbumSortKey::Year => (
            Some("al.year IS NULL"),
            &["al.year", "al.title_sort", "al.title", "al.id"],
        ),
    };
    Listing {
        columns: ALBUM_COLUMNS,
        from: ALBUM_FROM,
        filter: Filter::default()
            .with("al.artist_id = {}", artist.to_hex())
            .search("al.search_text", search),
        order: order_by(unknown, terms, direction),
    }
}

/// The tracks of one album, in playing order.
fn album_track_listing(album: AlbumId) -> Listing {
    Listing {
        columns: "t.id, m.title, m.artist, m.track_number, m.disc_number, m.file_format, m.bit_depth, m.sample_rate, m.duration_ms, f.availability, f.inspection_status, a.content_hash, a.mime_type",
        from: "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id",
        filter: Filter::default().with("m.album_id = {}", album.to_hex()),
        order: ALBUM_ORDER.to_owned(),
    }
}

fn album_track_row(row: &Row<'_>) -> rusqlite::Result<AlbumTrackRow> {
    let artist: String = row.get(2)?;
    let number = |index: usize| -> rusqlite::Result<Option<u32>> {
        Ok(row.get::<_, Option<i64>>(index)?.map(|value| value as u32))
    };
    Ok(AlbumTrackRow {
        core: TrackCore {
            id: track_id_column(row, 0)?,
            title: row.get(1)?,
            artist: (!artist.is_empty()).then_some(artist),
            duration_ms: row.get::<_, Option<i64>>(8)?.map(|value| value as u64),
            artwork: artwork_ref(row.get(11)?, row.get(12)?),
        },
        state: track_state(row.get(9)?, row.get(10)?),
        track_number: number(3)?,
        disc_number: number(4)?,
        file_format: non_blank(row.get(5)?),
        bit_depth: number(6)?,
        sample_rate: number(7)?,
    })
}

/// The letter index of a list by one key: the first character of each name (or the year), grouped
/// in the list's order, with the unknown ones last. `key` groups the rows, `known` and `unknown`
/// split them, and `to_label` gives each group's label.
fn letter_entries(
    connection: &Connection,
    listing: &Listing,
    key: &str,
    (known, unknown): (&str, &str),
    direction: SortDirection,
    to_label: fn(&str) -> String,
) -> Result<Vec<LetterIndexEntry>, StoreError> {
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
            label: text::UNKNOWN_LABEL.into(),
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
        text::UNKNOWN_LABEL => LetterIndexEntryKind::Unknown,
        text::KANJI_LABEL => LetterIndexEntryKind::Kanji,
        "あ" | "か" | "さ" | "た" | "な" | "は" | "ま" | "や" | "ら" | "わ" => {
            LetterIndexEntryKind::Kana
        }
        _ => LetterIndexEntryKind::Letter,
    }
}

/// The letter index of a list by a name column.
fn name_index(
    connection: &Connection,
    listing: &Listing,
    column: &str,
    direction: SortDirection,
) -> Result<Vec<LetterIndexEntry>, StoreError> {
    letter_entries(
        connection,
        listing,
        &format!("substr({column}, 1, 1)"),
        (&format!("{column} <> ''"), &format!("{column} = ''")),
        direction,
        text::index_label,
    )
}

/// The letter index of albums by year, newest or oldest first as the list is, with the undated last.
fn year_index(
    connection: &Connection,
    listing: &Listing,
    direction: SortDirection,
) -> Result<Vec<LetterIndexEntry>, StoreError> {
    letter_entries(
        connection,
        listing,
        "al.year",
        ("al.year IS NOT NULL", "al.year IS NULL"),
        direction,
        str::to_owned,
    )
}

/// The details of an album: its summary row, and its tracks for the counts.
fn album_details_of(
    connection: &Connection,
    album_id: AlbumId,
) -> Result<AlbumDetails, StoreError> {
    let album_hex = album_id.to_hex();
    let summary = connection
        .query_row(
            &format!("SELECT {ALBUM_COLUMNS} {ALBUM_FROM} WHERE al.id = ?1"),
            params![album_hex],
            album_row,
        )
        .optional()?
        .ok_or(StoreError::AlbumNotFound)?;
    let in_album = "m.album_id = ?1";
    let playable_file = playable_file_condition();
    let (count, duration, year, date, playable): (
        i64,
        Option<i64>,
        Option<i32>,
        Option<String>,
        Option<i64>,
    ) = connection.query_row(
        &format!(
            "SELECT COUNT(*),
                CASE WHEN COUNT(m.duration_ms) = COUNT(*) THEN SUM(m.duration_ms) END,
                MIN(m.year),
                (SELECT m.date FROM track_source_metadata m
                  WHERE {in_album} AND trim(COALESCE(m.date, '')) <> ''
                  ORDER BY {ALBUM_ORDER} LIMIT 1),
                (SELECT m.track_id FROM track_source_metadata m
                  JOIN tracks t ON t.id = m.track_id
                  JOIN library_files f ON f.id = t.file_id
                  WHERE {in_album} AND {playable_file}
                  ORDER BY {ALBUM_ORDER} LIMIT 1)
             FROM track_source_metadata m WHERE {in_album}"
        ),
        params![album_hex],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )?;
    if count == 0 {
        return Err(StoreError::AlbumNotFound);
    }
    Ok(AlbumDetails {
        summary: AlbumRow { year, ..summary },
        date,
        track_count: count as u64,
        duration_ms: duration.map(|value| value as u64),
        first_playable_track_id: playable.and_then(TrackId::try_from_rowid),
    })
}

impl Library {
    /// One page of a list, with the Library version it was read at.
    fn page<T>(
        &self,
        listing: &Listing,
        offset: u32,
        limit: u32,
        row: fn(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Page<T>, StoreError> {
        // The version is read before the rows: a change that lands while the page is read makes the
        // page look older than it is, so the Renderer restarts the list rather than miss it.
        let version = self.version();
        let connection = self.read()?;
        Ok(Page {
            items: listing.rows(&connection, offset, limit, row)?,
            total: listing.total(&connection)?,
            version,
        })
    }

    pub fn list_tracks(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Page<TrackRow>, CommandError> {
        let listing = track_listing(request.search.as_deref(), request.sort, request.direction);
        Ok(self.page(&listing, request.offset, request.limit, track_row)?)
    }

    pub fn list_albums(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Page<AlbumRow>, CommandError> {
        let listing = album_listing(request.search.as_deref(), request.sort, request.direction);
        Ok(self.page(&listing, request.offset, request.limit, album_row)?)
    }

    pub fn list_artists(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Page<ArtistRow>, CommandError> {
        let listing = artist_listing(request.search.as_deref(), request.sort, request.direction);
        Ok(self.page(&listing, request.offset, request.limit, read_artist)?)
    }

    /// A page of one Album Artist's albums. An Album Artist with no albums is not found.
    pub fn list_artist_albums(
        &self,
        artist: ArtistId,
        request: &ListRequest<ArtistAlbumSortKey>,
    ) -> Result<Page<AlbumRow>, CommandError> {
        let listing = artist_album_listing(
            artist,
            request.search.as_deref(),
            request.sort,
            request.direction,
        );
        let page = self.page(&listing, request.offset, request.limit, album_row)?;
        if page.total == 0 {
            return Err(CommandError::ArtistNotFound);
        }
        Ok(page)
    }

    /// Every track of one album, in playing order. An album with no tracks is not found.
    pub fn list_album_tracks(&self, album: AlbumId) -> Result<Vec<AlbumTrackRow>, CommandError> {
        let listing = album_track_listing(album);
        let connection = self.read()?;
        let rows = listing.rows(&connection, 0, u32::MAX, album_track_row)?;
        if rows.is_empty() {
            return Err(CommandError::AlbumNotFound);
        }
        Ok(rows)
    }

    /// The letter index of the Tracks list. A list by duration has none.
    pub fn track_index(
        &self,
        request: &ListRequest<TrackSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        let Some(column) = track_index_column(request.sort) else {
            return Ok(Vec::new());
        };
        let listing = track_listing(request.search.as_deref(), request.sort, request.direction);
        let connection = self.read()?;
        Ok(name_index(
            &connection,
            &listing,
            column,
            request.direction,
        )?)
    }

    /// The letter index of the Albums list: by name, or by year.
    pub fn album_index(
        &self,
        request: &ListRequest<AlbumSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        let listing = album_listing(request.search.as_deref(), request.sort, request.direction);
        let connection = self.read()?;
        Ok(match album_index_column(request.sort) {
            Some(column) => name_index(&connection, &listing, column, request.direction)?,
            None => year_index(&connection, &listing, request.direction)?,
        })
    }

    /// The letter index of the Album Artists list. Only a list by name has one.
    pub fn artist_index(
        &self,
        request: &ListRequest<ArtistSortKey>,
    ) -> Result<Vec<LetterIndexEntry>, CommandError> {
        if request.sort != ArtistSortKey::Artist {
            return Ok(Vec::new());
        }
        let listing = artist_listing(request.search.as_deref(), request.sort, request.direction);
        let connection = self.read()?;
        Ok(name_index(
            &connection,
            &listing,
            "ar.name_sort",
            request.direction,
        )?)
    }

    /// One Album Artist's row, by its ID.
    pub fn artist_row(&self, artist: ArtistId) -> Result<ArtistRow, CommandError> {
        let connection = self.read()?;
        Ok(connection
            .query_row(
                &format!("SELECT {ARTIST_COLUMNS} {ARTIST_FROM} WHERE ar.id = ?1"),
                params![artist.to_hex()],
                read_artist,
            )
            .optional()
            .map_err(StoreError::from)?
            .ok_or(StoreError::AlbumArtistNotFound)?)
    }

    /// The details of an album by its ID.
    pub fn album_details(&self, album_id: AlbumId) -> Result<AlbumDetails, CommandError> {
        let connection = self.read()?;
        Ok(album_details_of(&connection, album_id)?)
    }
}
