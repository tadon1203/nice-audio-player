//! The catalog lists: Tracks, Albums, Album Artists, an Album Artist's albums and an album's
//! tracks, plus the details of one album or Album Artist, and the scroll index of a list.
//!
//! Tracks are read from the normalized columns of `track_source_metadata` (see `library/keys.rs`);
//! Albums and Album Artists from their own summary tables (see `library/summary.rs`), so a page
//! of either is an index range and no aggregate runs while paging. An album is found by its ID,
//! which is hashed from its (Album Artist, title, directory) (see `ids.rs`). Unknown is the empty
//! string and sorts last, and a list pages by keyset (see `paging.rs`). Only the first page of a
//! list says how long the list is.

use super::{
    LibraryStore, SearchFilter,
    paging::{Ordering, Page, PagedQuery, Phase, Scope, View},
    track::{
        SUMMARY_COLUMN_COUNT, SUMMARY_COLUMNS, SUMMARY_FROM, artwork_ref, playable_file_condition,
        summary_from_row, track_state,
    },
};
use crate::ids::{AlbumId, ArtistId, TrackId, album_id_column, artist_id_column, track_id_column};
use crate::library::{error::StoreError, models::*, text};
use rusqlite::{Connection, OptionalExtension, Row, params, types::Value};

/// An album's tracks in playing order: by disc, then track, unnumbered ones last.
pub(super) const ALBUM_ORDER: &str =
    "COALESCE(m.disc_number, 2147483647), COALESCE(m.track_number, 2147483647), m.track_id";

/// The tracks a search matches: by title, artist, album or Album Artist. Shared by the page and
/// by playback, so "play what I see" cannot drift from the list.
pub(super) fn track_filter(search: Option<&str>) -> SearchFilter {
    SearchFilter::new(search, "m.search_text")
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
        LibraryTrackSortKey::Title => {
            vec![Phase::new("1", &["m.title_sort", "m.title", "m.track_id"])]
        }
        LibraryTrackSortKey::Artist => name_phases(
            "m.artist_sort",
            &["m.artist_sort", "m.artist", "m.track_id"],
            &["m.artist", "m.track_id"],
        ),
        LibraryTrackSortKey::Album => name_phases(
            "m.album_sort",
            &["m.album_sort", "m.album", "m.track_id"],
            &["m.album", "m.track_id"],
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
const ALBUM_COLUMNS: &str =
    "al.title, al.album_artist, al.year, a.content_hash, a.mime_type, al.artist_id, al.id";
const ALBUM_COLUMN_COUNT: usize = 7;
const ALBUM_FROM: &str = "FROM albums al LEFT JOIN artwork_assets a ON a.id = al.cover_artwork_id";

fn album_summary(row: &Row<'_>) -> rusqlite::Result<LibraryAlbumSummary> {
    Ok(LibraryAlbumSummary {
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

/// The columns of an Album Artist row, in the order `artist_summary` reads them.
const ARTIST_COLUMNS: &str =
    "ar.id, ar.name, ar.album_count, ar.track_count, a.content_hash, a.mime_type";
const ARTIST_COLUMN_COUNT: usize = 6;
const ARTIST_FROM: &str =
    "FROM artists ar LEFT JOIN artwork_assets a ON a.id = ar.cover_artwork_id";

fn artist_summary(row: &Row<'_>) -> rusqlite::Result<LibraryAlbumArtistSummary> {
    Ok(LibraryAlbumArtistSummary {
        id: artist_id_column(row, 0)?,
        name: row.get(1)?,
        album_count: row.get::<_, i64>(2)? as u64,
        track_count: row.get::<_, i64>(3)? as u64,
        artwork: artwork_ref(row.get(4)?, row.get(5)?),
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
            "al.title_sort",
            &[
                "al.title_sort",
                "al.title",
                "al.album_artist_sort",
                "al.album_artist",
                "al.id",
            ],
            &["al.album_artist_sort", "al.album_artist", "al.id"],
        ),
        LibraryAlbumSortKey::Artist => name_phases(
            "al.album_artist_sort",
            &[
                "al.album_artist_sort",
                "al.album_artist",
                "al.title_sort",
                "al.title",
                "al.id",
            ],
            &["al.title_sort", "al.title", "al.id"],
        ),
        LibraryAlbumSortKey::Year => year_phases(
            "al.year",
            "al.title_sort",
            &[
                "al.title_sort",
                "al.title",
                "al.album_artist_sort",
                "al.album_artist",
                "al.id",
            ],
            &["al.album_artist_sort", "al.album_artist", "al.id"],
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
        SearchFilter::new(search, "al.search_text"),
    )
}

fn album_artist_ordering(
    sort_key: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
) -> Ordering {
    let phases = match sort_key {
        LibraryAlbumArtistSortKey::Artist => {
            name_phases("ar.name_sort", &["ar.name_sort", "ar.name"], &["ar.name"])
        }
        LibraryAlbumArtistSortKey::AlbumCount => vec![Phase::new(
            "1",
            &["ar.album_count", "ar.name_sort", "ar.name"],
        )],
        LibraryAlbumArtistSortKey::TrackCount => vec![Phase::new(
            "1",
            &["ar.track_count", "ar.name_sort", "ar.name"],
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
        (ARTIST_FROM, "FROM artists ar"),
        SearchFilter::new(search, "ar.search_text"),
    )
}

/// The albums of one Album Artist.
pub(super) fn artist_albums_query(
    artist: ArtistId,
    sort_key: LibraryArtistAlbumSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    let artist_id = artist.to_hex();
    let phases = match sort_key {
        LibraryArtistAlbumSortKey::Title => name_phases(
            "al.title_sort",
            &["al.title_sort", "al.title", "al.id"],
            &["al.id"],
        ),
        LibraryArtistAlbumSortKey::Year => year_phases(
            "al.year",
            "al.title_sort",
            &["al.title_sort", "al.title", "al.id"],
            &["al.id"],
        ),
    };
    let mut query = build_query(
        Scope::new(View::ArtistAlbums, "", &artist_id, &sort_key, direction),
        Ordering { phases, direction },
        (ALBUM_COLUMNS, ALBUM_COLUMN_COUNT),
        (ALBUM_FROM, "FROM albums al"),
        SearchFilter {
            sql: "al.artist_id = ?1".into(),
            params: vec![artist_id.clone().into()],
        },
    );
    query.params = vec![artist_id.into()];
    query
}

/// The tracks of one album, in playing order. `album_id` is the album's ID, which the cursor is
/// scoped to as well.
fn album_tracks_query(album_id: &str) -> PagedQuery {
    build_query(
        Scope::new(
            View::AlbumTracks,
            "",
            album_id,
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
            "t.id, m.title, m.artist, m.track_number, m.disc_number, m.file_format, m.bit_depth, m.sample_rate, m.duration_ms, f.availability, f.inspection_status, a.content_hash, a.mime_type",
            13,
        ),
        (
            "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id LEFT JOIN artwork_assets a ON a.id = m.artwork_id",
            "FROM track_source_metadata m",
        ),
        SearchFilter {
            sql: "m.album_id = ?1".into(),
            params: vec![album_id.to_owned().into()],
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
    #[cfg(test)]
    pub fn catalog_tracks(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, StoreError> {
        self.catalog_tracks_from(&TrackListRequest {
            query: TrackQuery {
                search: search.map(str::to_owned),
                sort_key,
                sort_direction: direction,
            },
            cursor: cursor.map(str::to_owned),
            skip: 0,
        })
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_tracks_from(
        &self,
        request: &TrackListRequest,
    ) -> Result<LibraryTrackPage, StoreError> {
        let TrackQuery {
            search,
            sort_key,
            sort_direction,
        } = &request.query;
        let cursor = request.cursor.as_deref();
        let connection = self.read()?;
        let query = tracks_query(search.as_deref(), *sort_key, *sort_direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } =
            query.fetch(&connection, cursor, request.skip, summary_from_row)?;
        Ok(LibraryTrackPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_track_index(
        &self,
        query: &TrackQuery,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        let Some(column) = track_index_column(query.sort_key) else {
            return Ok(Vec::new());
        };
        let paged = tracks_query(
            query.search.as_deref(),
            query.sort_key,
            query.sort_direction,
        );
        let connection = self.read()?;
        name_buckets(
            &connection,
            &paged.count_from_where,
            &paged.params,
            column,
            query.sort_direction,
        )
    }

    /// A page of the list from its start (see [`Self::catalog_albums_from`]).
    #[cfg(test)]
    pub fn catalog_albums(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        self.catalog_albums_from(&AlbumListRequest {
            query: AlbumQuery {
                search: search.map(str::to_owned),
                sort_key,
                sort_direction: direction,
            },
            cursor: cursor.map(str::to_owned),
            skip: 0,
        })
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_albums_from(
        &self,
        request: &AlbumListRequest,
    ) -> Result<LibraryAlbumPage, StoreError> {
        let AlbumQuery {
            search,
            sort_key,
            sort_direction,
        } = &request.query;
        let cursor = request.cursor.as_deref();
        let connection = self.read()?;
        let query = albums_query(search.as_deref(), *sort_key, *sort_direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } =
            query.fetch(&connection, cursor, request.skip, album_summary)?;
        Ok(LibraryAlbumPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_album_index(
        &self,
        query: &AlbumQuery,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        let direction = query.sort_direction;
        let paged = albums_query(query.search.as_deref(), query.sort_key, direction);
        let connection = self.read()?;
        match query.sort_key {
            LibraryAlbumSortKey::Title => name_buckets(
                &connection,
                &paged.count_from_where,
                &paged.params,
                "al.title_sort",
                direction,
            ),
            LibraryAlbumSortKey::Artist => name_buckets(
                &connection,
                &paged.count_from_where,
                &paged.params,
                "al.album_artist_sort",
                direction,
            ),
            LibraryAlbumSortKey::Year => year_buckets(
                &connection,
                &paged.count_from_where,
                &paged.params,
                direction,
            ),
        }
    }

    /// A page of the list from its start (see [`Self::catalog_album_artists_from`]).
    #[cfg(test)]
    pub fn catalog_album_artists(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumArtistPage, StoreError> {
        self.catalog_album_artists_from(&AlbumArtistListRequest {
            query: AlbumArtistQuery {
                search: search.map(str::to_owned),
                sort_key,
                sort_direction: direction,
            },
            cursor: cursor.map(str::to_owned),
            skip: 0,
        })
    }

    /// A page of the list; with no cursor it starts after the first `skip` rows, which is how the
    /// scroll index jumps to a letter without paging through what precedes it.
    pub fn catalog_album_artists_from(
        &self,
        request: &AlbumArtistListRequest,
    ) -> Result<LibraryAlbumArtistPage, StoreError> {
        let AlbumArtistQuery {
            search,
            sort_key,
            sort_direction,
        } = &request.query;
        let cursor = request.cursor.as_deref();
        let connection = self.read()?;
        let query = album_artists_query(search.as_deref(), *sort_key, *sort_direction);
        let total_count = first_page_total(&query, &connection, cursor)?;
        let Page { items, next_cursor } =
            query.fetch(&connection, cursor, request.skip, artist_summary)?;
        Ok(LibraryAlbumArtistPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_album_artist_index(
        &self,
        query: &AlbumArtistQuery,
    ) -> Result<Vec<LibraryIndexBucket>, StoreError> {
        if query.sort_key != LibraryAlbumArtistSortKey::Artist {
            return Ok(Vec::new());
        }
        let paged = album_artists_query(
            query.search.as_deref(),
            query.sort_key,
            query.sort_direction,
        );
        let connection = self.read()?;
        name_buckets(
            &connection,
            &paged.count_from_where,
            &paged.params,
            "ar.name_sort",
            query.sort_direction,
        )
    }

    pub fn catalog_artist_albums(
        &self,
        artist: ArtistId,
        cursor: Option<&str>,
        sort_key: LibraryArtistAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        let connection = self.read()?;
        let query = artist_albums_query(artist, sort_key, direction);
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
        artist: ArtistId,
    ) -> Result<LibraryAlbumArtistSummary, StoreError> {
        let connection = self.read()?;
        connection
            .query_row(
                &format!("SELECT {ARTIST_COLUMNS} {ARTIST_FROM} WHERE ar.id = ?1"),
                params![artist.to_hex()],
                artist_summary,
            )
            .optional()?
            .ok_or(StoreError::AlbumArtistNotFound)
    }

    /// The details of an album by its ID.
    pub fn catalog_album(&self, album_id: AlbumId) -> Result<LibraryAlbumDetails, StoreError> {
        let connection = self.read()?;
        Self::album_details(&connection, album_id)
    }

    /// The details of an album: its summary row, and its tracks for the counts.
    fn album_details(
        connection: &Connection,
        album_id: AlbumId,
    ) -> Result<LibraryAlbumDetails, StoreError> {
        let album_hex = album_id.to_hex();
        let summary = connection
            .query_row(
                &format!("SELECT {ALBUM_COLUMNS} {ALBUM_FROM} WHERE al.id = ?1"),
                params![album_hex],
                album_summary,
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
        Ok(LibraryAlbumDetails {
            summary: LibraryAlbumSummary { year, ..summary },
            date,
            track_count: count as u64,
            duration_ms: duration.map(|value| value as u64),
            first_playable_track_id: playable.and_then(TrackId::try_from_rowid),
        })
    }

    /// A page of an album's tracks by its ID.
    pub fn catalog_album_tracks_by_id(
        &self,
        album_id: AlbumId,
        cursor: Option<&str>,
    ) -> Result<LibraryAlbumTrackPage, StoreError> {
        let connection = self.read()?;
        Self::album_tracks(&connection, album_id, cursor)
    }

    /// A page of an album's tracks in playing order.
    fn album_tracks(
        connection: &Connection,
        album_id: AlbumId,
        cursor: Option<&str>,
    ) -> Result<LibraryAlbumTrackPage, StoreError> {
        let query = album_tracks_query(&album_id.to_hex());
        let total_count = first_page_total(&query, connection, cursor)?;
        if total_count == Some(0) {
            return Err(StoreError::AlbumNotFound);
        }
        let Page { items, next_cursor } = query.fetch(connection, cursor, 0, |row| {
            let artist: String = row.get(2)?;
            let number = |index: usize| -> rusqlite::Result<Option<u32>> {
                Ok(row.get::<_, Option<i64>>(index)?.map(|value| value as u32))
            };
            Ok(LibraryAlbumTrackSummary {
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
                file_format: super::track::non_blank(row.get(5)?),
                bit_depth: number(6)?,
                sample_rate: number(7)?,
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
