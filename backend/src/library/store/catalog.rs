//! The catalog lists: Tracks, Albums, Album Artists, an Album Artist's albums and an album's
//! tracks, plus the details of one album or Album Artist, and the scroll index of a list.
//!
//! Tracks are read from the key columns of `track_source_metadata` (see `library/keys.rs`);
//! Albums and Album Artists from their own summary tables (see `library/summary.rs`), so a page
//! of either is an index range and no aggregate runs while paging. An album is its (Album Artist,
//! album, folder) triple, unknown is the empty string and sorts last, and a list pages by keyset
//! (see `paging.rs`). Only the first page of a list says how long the list is.

use super::{
    is_normalized,
    paging::{Ordering, Page, PagedQuery, Phase, Scope, View},
    track::{artwork_ref, summary_from_row, SUMMARY_COLUMNS, SUMMARY_COLUMN_COUNT, SUMMARY_FROM},
    LibraryStore, SearchFilter,
};
use crate::library::{
    artwork::ArtworkRef,
    error::StoreError,
    models::*,
    status::{Availability, InspectionStatus},
    text,
};
use rusqlite::{params, types::Value, Connection, OptionalExtension, Row};

/// An album's tracks in playing order: by disc, then track, unnumbered ones last.
pub(super) const ALBUM_ORDER: &str =
    "COALESCE(m.disc_number, 2147483647), COALESCE(m.track_number, 2147483647), m.track_id";

pub(super) fn validate_album_key(key: &LibraryAlbumKey) -> Result<(), StoreError> {
    if is_normalized(&key.title) && is_normalized(&key.album_artist) {
        Ok(())
    } else {
        Err(StoreError::InvalidAlbumKey)
    }
}

fn validate_artist_key(key: &LibraryAlbumArtistKey) -> Result<(), StoreError> {
    if is_normalized(&key.name) {
        Ok(())
    } else {
        Err(StoreError::InvalidAlbumArtistKey)
    }
}

/// The tracks a search matches: by title, artist, album or Album Artist. Shared by the page and
/// by playback, so "play what I see" cannot drift from the list.
pub(super) fn track_filter(search: Option<&str>) -> SearchFilter {
    SearchFilter::new(search, "m.search_key")
}

/// The sort key column a track sort order is by, when it has a scroll index.
fn track_index_column(key: LibraryTrackSortKey) -> Option<&'static str> {
    match key {
        LibraryTrackSortKey::Title => Some("m.title_sort"),
        LibraryTrackSortKey::Artist => Some("m.artist_sort"),
        LibraryTrackSortKey::Album => Some("m.album_sort"),
        LibraryTrackSortKey::Duration => None,
    }
}

/// The track sort orders. Titles are never unknown; artists, albums and durations may be, and
/// those rows follow the known ones in both directions.
pub(super) fn track_ordering(
    key: LibraryTrackSortKey,
    direction: LibrarySortDirection,
) -> Ordering {
    let phases = match key {
        LibraryTrackSortKey::Title => vec![Phase::new(
            "1",
            &["m.title_sort", "m.title_key", "m.track_id"],
        )],
        LibraryTrackSortKey::Artist => name_phases(
            "m.artist_sort",
            &["m.artist_sort", "m.artist_key", "m.track_id"],
            &["m.artist_key", "m.track_id"],
        ),
        LibraryTrackSortKey::Album => name_phases(
            "m.album_sort",
            &["m.album_sort", "m.album_key", "m.track_id"],
            &["m.album_key", "m.track_id"],
        ),
        LibraryTrackSortKey::Duration => vec![
            Phase::new(
                "m.duration_ms IS NOT NULL",
                &["m.duration_ms", "m.track_id"],
            ),
            Phase::new("m.duration_ms IS NULL", &["m.track_id"]),
        ],
    };
    Ordering { phases, direction }
}

/// Orders of rows by a sort key: unknown (empty) keys last, then `terms` for the known ones and
/// `unknown_terms` for the rest.
fn name_phases(key: &str, terms: &[&str], unknown_terms: &[&str]) -> Vec<Phase> {
    vec![
        Phase::new(&format!("{key} > ''"), terms),
        Phase::new(&format!("{key} = ''"), unknown_terms),
    ]
}

/// Orders of albums by year: albums with a year first, each half with unnamed albums last.
/// `rest` are the terms that follow the year for a named album, `unnamed` those for an unnamed
/// one.
fn year_phases(year: &str, album_sort: &str, rest: &[&str], unnamed: &[&str]) -> Vec<Phase> {
    let with_year = |terms: &[&str]| -> Vec<String> {
        std::iter::once(year)
            .chain(terms.iter().copied())
            .map(str::to_owned)
            .collect()
    };
    let without =
        |terms: &[&str]| -> Vec<String> { terms.iter().map(|t| (*t).to_owned()).collect() };
    let phase = |predicate: String, terms: Vec<String>| Phase { predicate, terms };
    vec![
        phase(
            format!("{year} IS NOT NULL AND {album_sort} > ''"),
            with_year(rest),
        ),
        phase(
            format!("{year} IS NOT NULL AND {album_sort} = ''"),
            with_year(unnamed),
        ),
        phase(
            format!("{year} IS NULL AND {album_sort} > ''"),
            without(rest),
        ),
        phase(
            format!("{year} IS NULL AND {album_sort} = ''"),
            without(unnamed),
        ),
    ]
}

/// The columns of an album row, in the order `album_summary` reads them, and what they come from.
const ALBUM_COLUMNS: &str = "al.album_key, al.album_artist_key, al.album_dir, al.year, a.content_hash, a.mime_type, a.relative_path";
const ALBUM_COLUMN_COUNT: usize = 7;
const ALBUM_FROM: &str = "FROM albums al LEFT JOIN artwork_assets a ON a.id = al.cover_artwork_id";

fn album_summary(row: &Row<'_>) -> rusqlite::Result<LibraryAlbumSummary> {
    Ok(LibraryAlbumSummary {
        key: LibraryAlbumKey {
            title: row.get(0)?,
            album_artist: row.get(1)?,
            album_edition: row.get(2)?,
        },
        year: row.get(3)?,
        artwork: artwork_ref(row.get(4)?, row.get(5)?, row.get(6)?),
    })
}

/// The columns of an Album Artist row, in the order `artist_summary` reads them.
const ARTIST_COLUMNS: &str =
    "ar.name, ar.album_count, ar.track_count, a.content_hash, a.mime_type, a.relative_path";
const ARTIST_COLUMN_COUNT: usize = 6;
const ARTIST_FROM: &str =
    "FROM album_artists ar LEFT JOIN artwork_assets a ON a.id = ar.cover_artwork_id";

fn artist_summary(row: &Row<'_>) -> rusqlite::Result<LibraryAlbumArtistSummary> {
    Ok(LibraryAlbumArtistSummary {
        key: LibraryAlbumArtistKey { name: row.get(0)? },
        album_count: row.get::<_, i64>(1)? as u64,
        track_count: row.get::<_, i64>(2)? as u64,
        artwork: artwork_ref(row.get(3)?, row.get(4)?, row.get(5)?),
    })
}

/// A list's query from the one filter it is counted and paged by.
fn build_query(
    scope: Scope,
    ordering: Ordering,
    (select, select_count): (&str, usize),
    (from, count_from): (&str, &str),
    filter: SearchFilter,
) -> PagedQuery {
    PagedQuery {
        scope,
        ordering,
        select: select.into(),
        select_count,
        from_where: format!("{from} WHERE {}", filter.sql),
        count_from_where: format!("{count_from} WHERE {}", filter.sql),
        params: filter.params,
    }
}

/// The Tracks list: every track, filtered by `search`, in `sort_key` order.
pub(super) fn tracks_query(
    search: Option<&str>,
    sort_key: LibraryTrackSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    build_query(
        Scope::new(
            View::Tracks,
            &SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        track_ordering(sort_key, direction),
        (SUMMARY_COLUMNS, SUMMARY_COLUMN_COUNT),
        (SUMMARY_FROM, "FROM track_source_metadata m"),
        track_filter(search),
    )
}

fn album_ordering(sort_key: LibraryAlbumSortKey, direction: LibrarySortDirection) -> Ordering {
    let phases = match sort_key {
        LibraryAlbumSortKey::Title => name_phases(
            "al.album_sort",
            &[
                "al.album_sort",
                "al.album_key",
                "al.artist_sort",
                "al.album_artist_key",
                "al.album_dir",
            ],
            &["al.artist_sort", "al.album_artist_key", "al.album_dir"],
        ),
        LibraryAlbumSortKey::Artist => name_phases(
            "al.artist_sort",
            &[
                "al.artist_sort",
                "al.album_artist_key",
                "al.album_sort",
                "al.album_key",
                "al.album_dir",
            ],
            &["al.album_sort", "al.album_key", "al.album_dir"],
        ),
        LibraryAlbumSortKey::Year => year_phases(
            "al.year",
            "al.album_sort",
            &[
                "al.album_sort",
                "al.album_key",
                "al.artist_sort",
                "al.album_artist_key",
                "al.album_dir",
            ],
            &["al.artist_sort", "al.album_artist_key", "al.album_dir"],
        ),
    };
    Ordering { phases, direction }
}

/// The Albums list: one row per album, filtered by `search`.
pub(super) fn albums_query(
    search: Option<&str>,
    sort_key: LibraryAlbumSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    build_query(
        Scope::new(
            View::Albums,
            &SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        album_ordering(sort_key, direction),
        (ALBUM_COLUMNS, ALBUM_COLUMN_COUNT),
        (ALBUM_FROM, "FROM albums al"),
        SearchFilter::new(search, "al.search_key"),
    )
}

fn album_artist_ordering(
    sort_key: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
) -> Ordering {
    let phases = match sort_key {
        LibraryAlbumArtistSortKey::Artist => {
            name_phases("ar.sort_key", &["ar.sort_key", "ar.name"], &["ar.name"])
        }
        LibraryAlbumArtistSortKey::AlbumCount => vec![Phase::new(
            "1",
            &["ar.album_count", "ar.sort_key", "ar.name"],
        )],
        LibraryAlbumArtistSortKey::TrackCount => vec![Phase::new(
            "1",
            &["ar.track_count", "ar.sort_key", "ar.name"],
        )],
    };
    Ordering { phases, direction }
}

/// The Album Artists list: one row per Album Artist, filtered by `search`.
pub(super) fn album_artists_query(
    search: Option<&str>,
    sort_key: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    build_query(
        Scope::new(
            View::AlbumArtists,
            &SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        album_artist_ordering(sort_key, direction),
        (ARTIST_COLUMNS, ARTIST_COLUMN_COUNT),
        (ARTIST_FROM, "FROM album_artists ar"),
        SearchFilter::new(search, "ar.search_key"),
    )
}

/// The albums of one Album Artist.
pub(super) fn artist_albums_query(
    artist: &LibraryAlbumArtistKey,
    sort_key: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    let phases = match sort_key {
        LibraryArtistAlbumSortKey::Title => name_phases(
            "al.album_sort",
            &["al.album_sort", "al.album_key", "al.album_dir"],
            &["al.album_dir"],
        ),
        LibraryArtistAlbumSortKey::Year => year_phases(
            "al.year",
            "al.album_sort",
            &["al.album_sort", "al.album_key", "al.album_dir"],
            &["al.album_dir"],
        ),
    };
    let mut query = build_query(
        Scope::new(View::ArtistAlbums, "", &artist.name, &sort_key, direction),
        Ordering { phases, direction },
        (ALBUM_COLUMNS, ALBUM_COLUMN_COUNT),
        (ALBUM_FROM, "FROM albums al"),
        SearchFilter {
            sql: "al.album_artist_key = ?1".into(),
            params: vec![artist.name.clone().into()],
        },
    );
    query.params = vec![artist.name.clone().into()];
    query
}

/// The tracks of one album, in playing order.
fn album_tracks_query(key: &LibraryAlbumKey) -> PagedQuery {
    build_query(
        Scope::new(
            View::AlbumTracks,
            "",
            &format!("{}\u{1f}{}\u{1f}{}", key.album_artist, key.title, key.album_edition),
            &"position",
            LibrarySortDirection::Ascending,
        ),
        Ordering {
            phases: vec![Phase::new(
                "1",
                &[
                    "COALESCE(m.disc_number, 2147483647)",
                    "COALESCE(m.track_number, 2147483647)",
                    "m.track_id",
                ],
            )],
            direction: LibrarySortDirection::Ascending,
        },
        (
            "t.id, m.title_key, m.artist_key, m.track_number, m.disc_number, m.file_format, m.bit_depth, m.sample_rate, m.duration_ms, f.availability, f.inspection_status",
            11,
        ),
        (
            "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id",
            "FROM track_source_metadata m",
        ),
        SearchFilter {
            sql: "m.album_artist_key = ?1 AND m.album_key = ?2 AND m.album_dir = ?3".into(),
            params: vec![
                key.album_artist.clone().into(),
                key.title.clone().into(),
                key.album_edition.clone().into(),
            ],
        },
    )
}

/// Buckets of a list's names by their first character, in the list's order, with the unknown ones
/// last. `from` is `FROM … WHERE <filter>` (parameters `params`), `column` the sort key column.
fn name_buckets(
    connection: &Connection,
    from: &str,
    params: &[Value],
    column: &str,
    direction: LibrarySortDirection,
) -> Result<Vec<LibraryIndexBucket>, StoreError> {
    let order = match direction {
        LibrarySortDirection::Ascending => "ASC",
        LibrarySortDirection::Descending => "DESC",
    };
    let mut statement = connection.prepare(&format!(
        "SELECT substr({column}, 1, 1) AS c, COUNT(*) {from} AND {column} > '' GROUP BY c ORDER BY c {order}"
    ))?;
    let rows = statement.query_map(rusqlite::params_from_iter(params), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64))
    })?;
    let mut buckets: Vec<LibraryIndexBucket> = Vec::new();
    for row in rows {
        let (first, count) = row?;
        let label = text::index_label(&first);
        match buckets.last_mut() {
            Some(last) if last.label == label => last.count += count,
            _ => buckets.push(LibraryIndexBucket { label, count }),
        }
    }
    let unknown: i64 = connection.query_row(
        &format!("SELECT COUNT(*) {from} AND {column} = ''"),
        rusqlite::params_from_iter(params),
        |row| row.get(0),
    )?;
    if unknown > 0 {
        buckets.push(LibraryIndexBucket {
            label: text::UNKNOWN_LABEL.into(),
            count: unknown as u64,
        });
    }
    Ok(buckets)
}

/// Buckets of albums by year, newest or oldest first as the list is, with the undated last.
fn year_buckets(
    connection: &Connection,
    from: &str,
    params: &[Value],
    direction: LibrarySortDirection,
) -> Result<Vec<LibraryIndexBucket>, StoreError> {
    let order = match direction {
        LibrarySortDirection::Ascending => "ASC",
        LibrarySortDirection::Descending => "DESC",
    };
    let mut statement = connection.prepare(&format!(
        "SELECT al.year, COUNT(*) {from} AND al.year IS NOT NULL GROUP BY al.year ORDER BY al.year {order}"
    ))?;
    let mut buckets: Vec<LibraryIndexBucket> = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryIndexBucket {
                label: row.get::<_, i64>(0)?.to_string(),
                count: row.get::<_, i64>(1)? as u64,
            })
        })?
        .collect::<Result<_, _>>()?;
    let undated: i64 = connection.query_row(
        &format!("SELECT COUNT(*) {from} AND al.year IS NULL"),
        rusqlite::params_from_iter(params),
        |row| row.get(0),
    )?;
    if undated > 0 {
        buckets.push(LibraryIndexBucket {
            label: text::UNKNOWN_LABEL.into(),
            count: undated as u64,
        });
    }
    Ok(buckets)
}

impl LibraryStore {
    /// A page of the list from its start (see [`Self::catalog_tracks_from`]).
    pub fn catalog_tracks(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, StoreError> {
        self.catalog_tracks_from(cursor, 0, search, sort_key, direction)
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_tracks_from(
        &self,
        cursor: Option<&str>,
        skip: u64,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, StoreError> {
        let connection = self.read()?;
        let query = tracks_query(search, sort_key, direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } =
            query.fetch(&connection, cursor, skip, summary_from_row)?;
        Ok(LibraryTrackPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_track_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        let Some(column) = track_index_column(sort_key) else {
            return Ok(Vec::new());
        };
        let query = tracks_query(search, sort_key, direction);
        let connection = self.read()?;
        name_buckets(
            &connection,
            &query.count_from_where,
            &query.params,
            column,
            direction,
        )
    }

    /// A page of the list from its start (see [`Self::catalog_albums_from`]).
    pub fn catalog_albums(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        self.catalog_albums_from(cursor, 0, search, sort_key, direction)
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_albums_from(
        &self,
        cursor: Option<&str>,
        skip: u64,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        let connection = self.read()?;
        let query = albums_query(search, sort_key, direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } = query.fetch(&connection, cursor, skip, album_summary)?;
        Ok(LibraryAlbumPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_album_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        let query = albums_query(search, sort_key, direction);
        let connection = self.read()?;
        match sort_key {
            LibraryAlbumSortKey::Title => name_buckets(
                &connection,
                &query.count_from_where,
                &query.params,
                "al.album_sort",
                direction,
            ),
            LibraryAlbumSortKey::Artist => name_buckets(
                &connection,
                &query.count_from_where,
                &query.params,
                "al.artist_sort",
                direction,
            ),
            LibraryAlbumSortKey::Year => year_buckets(
                &connection,
                &query.count_from_where,
                &query.params,
                direction,
            ),
        }
    }

    /// A page of the list from its start (see [`Self::catalog_album_artists_from`]).
    pub fn catalog_album_artists(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumArtistPage, StoreError> {
        self.catalog_album_artists_from(cursor, 0, search, sort_key, direction)
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_album_artists_from(
        &self,
        cursor: Option<&str>,
        skip: u64,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumArtistPage, StoreError> {
        let connection = self.read()?;
        let query = album_artists_query(search, sort_key, direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } = query.fetch(&connection, cursor, skip, artist_summary)?;
        Ok(LibraryAlbumArtistPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_album_artist_index(
        &self,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        direction: LibrarySortDirection,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        if sort_key != LibraryAlbumArtistSortKey::Artist {
            return Ok(Vec::new());
        }
        let query = album_artists_query(search, sort_key, direction);
        let connection = self.read()?;
        name_buckets(
            &connection,
            &query.count_from_where,
            &query.params,
            "ar.sort_key",
            direction,
        )
    }

    pub fn catalog_artist_albums(
        &self,
        artist: LibraryAlbumArtistKey,
        cursor: Option<&str>,
        sort_key: LibraryArtistAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        validate_artist_key(&artist)?;
        let connection = self.read()?;
        let query = artist_albums_query(&artist, sort_key, direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        if total_count == Some(0) {
            return Err(StoreError::AlbumArtistNotFound);
        }
        let Page { items, next_cursor } = query.fetch(&connection, cursor, 0, album_summary)?;
        Ok(LibraryAlbumPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_artist(
        &self,
        artist: LibraryAlbumArtistKey,
    ) -> Result<LibraryAlbumArtistSummary, StoreError> {
        validate_artist_key(&artist)?;
        let connection = self.read()?;
        connection
            .query_row(
                &format!("SELECT {ARTIST_COLUMNS} {ARTIST_FROM} WHERE ar.name = ?1"),
                params![artist.name],
                artist_summary,
            )
            .optional()?
            .ok_or(StoreError::AlbumArtistNotFound)
    }

    pub fn catalog_album_details(
        &self,
        key: LibraryAlbumKey,
    ) -> Result<LibraryAlbumDetails, StoreError> {
        validate_album_key(&key)?;
        let connection = self.read()?;
        let in_album = "m.album_artist_key = ?1 AND m.album_key = ?2 AND m.album_dir = ?4";
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
                      WHERE {in_album} AND f.availability = ?3 AND f.inspection_status = ?5
                      ORDER BY {ALBUM_ORDER} LIMIT 1)
                 FROM track_source_metadata m WHERE {in_album}"
            ),
            params![
                key.album_artist,
                key.title,
                Availability::Available,
                key.album_edition,
                InspectionStatus::Indexed
            ],
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
        Ok(LibraryAlbumDetails {
            summary: LibraryAlbumSummary {
                artwork: album_cover(&connection, &key)?,
                key,
                year,
            },
            date,
            track_count: count as u64,
            duration_ms: duration.map(|value| value as u64),
            first_playable_track_id: playable.map(|id| id.to_string()),
        })
    }

    pub fn catalog_album_tracks(
        &self,
        key: LibraryAlbumKey,
        cursor: Option<&str>,
    ) -> Result<LibraryAlbumTrackPage, StoreError> {
        validate_album_key(&key)?;
        let connection = self.read()?;
        let query = album_tracks_query(&key);
        let total_count = first_page_total(&query, &connection, cursor)?;
        if total_count == Some(0) {
            return Err(StoreError::AlbumNotFound);
        }
        let Page { items, next_cursor } = query.fetch(&connection, cursor, 0, |row| {
            let id: i64 = row.get(0)?;
            let artist: String = row.get(2)?;
            let number = |index: usize| -> rusqlite::Result<Option<u32>> {
                Ok(row.get::<_, Option<i64>>(index)?.map(|value| value as u32))
            };
            let availability: Availability = row.get(9)?;
            let inspection: InspectionStatus = row.get(10)?;
            Ok(LibraryAlbumTrackSummary {
                id: id.to_string(),
                title: row.get(1)?,
                artist: (!artist.is_empty()).then_some(artist),
                track_number: number(3)?,
                disc_number: number(4)?,
                file_format: super::track::non_blank(row.get(5)?),
                bit_depth: number(6)?,
                sample_rate: number(7)?,
                duration_ms: row.get::<_, Option<i64>>(8)?.map(|value| value as u64),
                availability,
                playable: availability == Availability::Available
                    && inspection == InspectionStatus::Indexed,
            })
        })?;
        Ok(LibraryAlbumTrackPage {
            items,
            total_count,
            next_cursor,
        })
    }
}

/// How long the list is, for the page that starts it; later pages do not count again.
fn first_page_total(
    query: &PagedQuery,
    connection: &Connection,
    cursor: Option<&str>,
) -> Result<Option<u64>, StoreError> {
    cursor.map_or_else(|| query.total(connection).map(Some), |_| Ok(None))
}

/// The cover of an album, from its summary row.
fn album_cover(
    connection: &Connection,
    key: &LibraryAlbumKey,
) -> Result<Option<ArtworkRef>, StoreError> {
    Ok(connection
        .prepare_cached(&format!(
            "SELECT a.content_hash, a.mime_type, a.relative_path {ALBUM_FROM}
             WHERE al.album_artist_key = ?1 AND al.album_key = ?2 AND al.album_dir = ?3"
        ))?
        .query_row(
            params![key.album_artist, key.title, key.album_edition],
            |row| Ok(artwork_ref(row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .flatten())
}
