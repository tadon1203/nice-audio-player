//! The catalog lists: Tracks, Albums, Album Artists, an Album Artist's albums and an album's
//! tracks, plus the details of one album or Album Artist.
//!
//! Everything is read from the normalized key columns of `track_source_metadata` (see
//! `library/keys.rs`). An album is its (Album Artist, album) pair, unknown is the empty string and
//! sorts last, and a list pages by keyset (see `paging.rs`). Lists ordered by an aggregate (year,
//! counts) are the exception to constant-time paging: the aggregate is computed for every group
//! and the page is taken from that.

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
};
use rusqlite::{params, types::Value, Connection, OptionalExtension};

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
    SearchFilter::new(
        search,
        &[
            "m.title_key",
            "m.artist_key",
            "m.album_key",
            "m.album_artist_key",
        ],
    )
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
            &["m.title_key COLLATE NOCASE", "m.title_key", "m.track_id"],
        )],
        LibraryTrackSortKey::Artist => unknown_last(
            "m.artist_key COLLATE NOCASE",
            &["m.artist_key COLLATE NOCASE", "m.artist_key", "m.track_id"],
        ),
        LibraryTrackSortKey::Album => unknown_last(
            "m.album_key COLLATE NOCASE",
            &["m.album_key COLLATE NOCASE", "m.album_key", "m.track_id"],
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

/// Rows whose `key` is known, in `terms` order, then the unknown ones. Those share one key, so
/// they follow the rest of the terms after the collated first one, which the index still orders.
fn unknown_last(key: &str, terms: &[&str]) -> Vec<Phase> {
    vec![
        Phase::new(&format!("{key} > ''"), terms),
        Phase::new(&format!("{key} = ''"), &terms[1..]),
    ]
}

/// Orders of groups by name: unknown names last, then `terms` for the known ones.
fn name_phases(key: &str, terms: &[&str], unknown_terms: &[&str]) -> Vec<Phase> {
    vec![
        Phase::new(&format!("{key} > ''"), terms),
        Phase::new(&format!("{key} = ''"), unknown_terms),
    ]
}

/// Orders of albums by year: albums with a year first, each half with unnamed albums last.
/// `album` is the album key column, `rest` the terms that follow the year for a named album,
/// `unnamed` those for an unnamed one.
fn year_phases<'a>(album: &str, rest: &[&'a str], unnamed: &[&'a str]) -> Vec<Phase> {
    let with_year = |terms: &[&str]| -> Vec<String> {
        std::iter::once("g.year")
            .chain(terms.iter().copied())
            .map(str::to_owned)
            .collect()
    };
    let phase = |predicate: String, terms: Vec<String>| Phase { predicate, terms };
    vec![
        phase(
            format!("g.year IS NOT NULL AND {album} <> ''"),
            with_year(rest),
        ),
        phase(
            format!("g.year IS NOT NULL AND {album} = ''"),
            with_year(unnamed),
        ),
        phase(
            format!("g.year IS NULL AND {album} <> ''"),
            rest.iter().map(|term| (*term).to_owned()).collect(),
        ),
        phase(
            format!("g.year IS NULL AND {album} = ''"),
            unnamed.iter().map(|term| (*term).to_owned()).collect(),
        ),
    ]
}

/// The Tracks list: every track, filtered by `search`, in `sort_key` order.
pub(super) fn tracks_query(
    search: Option<&str>,
    sort_key: LibraryTrackSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    let filter = track_filter(search);
    PagedQuery {
        scope: Scope::new(
            View::Tracks,
            SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        ordering: track_ordering(sort_key, direction),
        select: SUMMARY_COLUMNS.into(),
        select_count: SUMMARY_COLUMN_COUNT,
        from_where: format!("{SUMMARY_FROM} WHERE {}", filter.sql),
        params: filter.params,
        group_by: String::new(),
    }
}

/// The Albums list: one row per (Album Artist, album), filtered by `search`.
pub(super) fn albums_query(
    search: Option<&str>,
    sort_key: LibraryAlbumSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    let filter = SearchFilter::new(search, &["m.album_key", "m.album_artist_key"]);
    let album = "m.album_key COLLATE NOCASE";
    let artist = "m.album_artist_key COLLATE NOCASE";
    let (phases, select, from_where, group_by) = match sort_key {
        LibraryAlbumSortKey::Title => (
            name_phases(
                album,
                &[album, "m.album_key", artist, "m.album_artist_key"],
                &[artist, "m.album_artist_key"],
            ),
            "m.album_key, m.album_artist_key, MIN(m.year)",
            format!("FROM track_source_metadata m WHERE {}", filter.sql),
            "GROUP BY m.album_key COLLATE NOCASE, m.album_key, m.album_artist_key COLLATE NOCASE, m.album_artist_key",
        ),
        LibraryAlbumSortKey::Artist => (
            name_phases(
                artist,
                &[artist, "m.album_artist_key", album, "m.album_key"],
                &[album, "m.album_key"],
            ),
            "m.album_key, m.album_artist_key, MIN(m.year)",
            format!("FROM track_source_metadata m WHERE {}", filter.sql),
            "GROUP BY m.album_artist_key COLLATE NOCASE, m.album_artist_key, m.album_key COLLATE NOCASE, m.album_key",
        ),
        LibraryAlbumSortKey::Year => (
            year_phases(
                "g.album",
                &["g.album COLLATE NOCASE", "g.album", "g.artist COLLATE NOCASE", "g.artist"],
                &["g.artist COLLATE NOCASE", "g.artist"],
            ),
            "g.album, g.artist, g.year",
            format!(
                "FROM (SELECT m.album_key AS album, m.album_artist_key AS artist, MIN(m.year) AS year FROM track_source_metadata m WHERE {} GROUP BY m.album_artist_key, m.album_key) AS g WHERE 1",
                filter.sql
            ),
            "",
        ),
    };
    PagedQuery {
        scope: Scope::new(
            View::Albums,
            SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        ordering: Ordering { phases, direction },
        select: select.into(),
        select_count: 3,
        from_where,
        params: filter.params,
        group_by: group_by.into(),
    }
}

/// The Album Artists list: one row per Album Artist, filtered by `search`.
pub(super) fn album_artists_query(
    search: Option<&str>,
    sort_key: LibraryAlbumArtistSortKey,
    direction: LibrarySortDirection,
) -> PagedQuery {
    let filter = SearchFilter::new(search, &["m.album_artist_key"]);
    let artist = "m.album_artist_key COLLATE NOCASE";
    let (phases, select, from_where, group_by) = match sort_key {
        LibraryAlbumArtistSortKey::Artist => (
            name_phases(
                artist,
                &[artist, "m.album_artist_key"],
                &["m.album_artist_key"],
            ),
            "m.album_artist_key, COUNT(DISTINCT m.album_key), COUNT(*)",
            format!("FROM track_source_metadata m WHERE {}", filter.sql),
            "GROUP BY m.album_artist_key COLLATE NOCASE, m.album_artist_key",
        ),
        LibraryAlbumArtistSortKey::AlbumCount | LibraryAlbumArtistSortKey::TrackCount => {
            let by = match sort_key {
                LibraryAlbumArtistSortKey::AlbumCount => "g.album_count",
                _ => "g.track_count",
            };
            (
                vec![Phase::new(
                    "1",
                    &[by, "g.artist COLLATE NOCASE", "g.artist"],
                )],
                "g.artist, g.album_count, g.track_count",
                format!(
                    "FROM (SELECT m.album_artist_key AS artist, COUNT(DISTINCT m.album_key) AS album_count, COUNT(*) AS track_count FROM track_source_metadata m WHERE {} GROUP BY m.album_artist_key) AS g WHERE 1",
                    filter.sql
                ),
                "",
            )
        }
    };
    PagedQuery {
        scope: Scope::new(
            View::AlbumArtists,
            SearchFilter::text(search),
            "",
            &sort_key,
            direction,
        ),
        ordering: Ordering { phases, direction },
        select: select.into(),
        select_count: 3,
        from_where,
        params: filter.params,
        group_by: group_by.into(),
    }
}

impl LibraryStore {
    pub fn catalog_tracks(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryTrackSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, StoreError> {
        let filter = track_filter(search);
        let connection = self.read()?;
        let total_count = count(
            &connection,
            &format!(
                "SELECT COUNT(*) FROM track_source_metadata m WHERE {}",
                filter.sql
            ),
            &filter.params,
        )?;
        let query = tracks_query(search, sort_key, direction);
        let Page { items, next_cursor } = query.fetch(&connection, cursor, summary_from_row)?;
        Ok(LibraryTrackPage {
            items,
            total_count,
            next_cursor,
        })
    }

    pub fn catalog_albums(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, StoreError> {
        let filter = SearchFilter::new(search, &["m.album_key", "m.album_artist_key"]);
        let connection = self.read()?;
        let total_count = count(
            &connection,
            &format!(
                "SELECT COUNT(*) FROM (SELECT 1 FROM track_source_metadata m WHERE {} GROUP BY m.album_artist_key, m.album_key)",
                filter.sql
            ),
            &filter.params,
        )?;
        let query = albums_query(search, sort_key, direction);
        album_page(&connection, &query, cursor, total_count)
    }

    pub fn catalog_album_artists(
        &self,
        cursor: Option<&str>,
        search: Option<&str>,
        sort_key: LibraryAlbumArtistSortKey,
        direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumArtistPage, StoreError> {
        let filter = SearchFilter::new(search, &["m.album_artist_key"]);
        let connection = self.read()?;
        let total_count = count(
            &connection,
            &format!(
                "SELECT COUNT(*) FROM (SELECT 1 FROM track_source_metadata m WHERE {} GROUP BY m.album_artist_key)",
                filter.sql
            ),
            &filter.params,
        )?;
        let query = album_artists_query(search, sort_key, direction);
        let Page { items, next_cursor } = query.fetch(&connection, cursor, |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? as u64,
                row.get::<_, i64>(2)? as u64,
            ))
        })?;
        let items = items
            .into_iter()
            .map(|(name, album_count, track_count)| {
                Ok(LibraryAlbumArtistSummary {
                    artwork: artist_cover(&connection, &name)?,
                    key: LibraryAlbumArtistKey { name },
                    album_count,
                    track_count,
                })
            })
            .collect::<Result<_, StoreError>>()?;
        Ok(LibraryAlbumArtistPage {
            items,
            total_count,
            next_cursor,
        })
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
        let total_count = count(
            &connection,
            "SELECT COUNT(DISTINCT album_key) FROM track_source_metadata WHERE album_artist_key = ?1",
            &[artist.name.clone().into()],
        )?;
        if total_count == 0 {
            return Err(StoreError::AlbumArtistNotFound);
        }
        let album = "m.album_key COLLATE NOCASE";
        let (phases, from_where, group_by) = match sort_key {
            LibraryArtistAlbumSortKey::Title => (
                name_phases(album, &[album, "m.album_key"], &["m.album_key"]),
                "FROM track_source_metadata m WHERE m.album_artist_key = ?1".to_owned(),
                "GROUP BY m.album_key COLLATE NOCASE, m.album_key",
            ),
            LibraryArtistAlbumSortKey::Year => (
                year_phases(
                    "g.album",
                    &["g.album COLLATE NOCASE", "g.album"],
                    &["g.album"],
                ),
                "FROM (SELECT m.album_key AS album, m.album_artist_key AS artist, MIN(m.year) AS year FROM track_source_metadata m WHERE m.album_artist_key = ?1 GROUP BY m.album_key) AS g WHERE 1".to_owned(),
                "",
            ),
        };
        let select = match sort_key {
            LibraryArtistAlbumSortKey::Title => "m.album_key, m.album_artist_key, MIN(m.year)",
            LibraryArtistAlbumSortKey::Year => "g.album, g.artist, g.year",
        };
        let query = PagedQuery {
            scope: Scope::new(View::ArtistAlbums, "", &artist.name, &sort_key, direction),
            ordering: Ordering { phases, direction },
            select: select.into(),
            select_count: 3,
            from_where,
            params: vec![artist.name.into()],
            group_by: group_by.into(),
        };
        album_page(&connection, &query, cursor, total_count)
    }

    pub fn catalog_artist(
        &self,
        artist: LibraryAlbumArtistKey,
    ) -> Result<LibraryAlbumArtistSummary, StoreError> {
        validate_artist_key(&artist)?;
        let connection = self.read()?;
        let (album_count, track_count): (i64, i64) = connection.query_row(
            "SELECT COUNT(DISTINCT album_key), COUNT(*) FROM track_source_metadata WHERE album_artist_key = ?1",
            params![artist.name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if track_count == 0 {
            return Err(StoreError::AlbumArtistNotFound);
        }
        Ok(LibraryAlbumArtistSummary {
            artwork: artist_cover(&connection, &artist.name)?,
            key: artist,
            album_count: album_count as u64,
            track_count: track_count as u64,
        })
    }

    pub fn catalog_album_details(
        &self,
        key: LibraryAlbumKey,
    ) -> Result<LibraryAlbumDetails, StoreError> {
        validate_album_key(&key)?;
        let connection = self.read()?;
        let in_album = "m.album_artist_key = ?1 AND m.album_key = ?2";
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
                      WHERE {in_album} AND f.availability = ?3 AND f.inspection_status = ?4
                      ORDER BY {ALBUM_ORDER} LIMIT 1)
                 FROM track_source_metadata m WHERE {in_album}"
            ),
            params![
                key.album_artist,
                key.title,
                Availability::Available,
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
                artwork: album_cover(&connection, &key.album_artist, &key.title)?,
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
        let album: [Value; 2] = [key.album_artist.clone().into(), key.title.clone().into()];
        let total_count = count(
            &connection,
            "SELECT COUNT(*) FROM track_source_metadata m WHERE m.album_artist_key = ?1 AND m.album_key = ?2",
            &album,
        )?;
        if total_count == 0 {
            return Err(StoreError::AlbumNotFound);
        }
        let query = PagedQuery {
            scope: Scope::new(
                View::AlbumTracks,
                "",
                &format!("{}\u{1f}{}", key.album_artist, key.title),
                &"position",
                LibrarySortDirection::Ascending,
            ),
            ordering: Ordering {
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
            select: "t.id, m.title_key, m.artist_key, m.track_number, m.disc_number, m.file_format, m.bit_depth, m.sample_rate, m.duration_ms, f.availability, f.inspection_status".into(),
            select_count: 11,
            from_where: "FROM track_source_metadata m JOIN tracks t ON t.id = m.track_id JOIN library_files f ON f.id = t.file_id WHERE m.album_artist_key = ?1 AND m.album_key = ?2".into(),
            params: album.to_vec(),
            group_by: String::new(),
        };
        let Page { items, next_cursor } = query.fetch(&connection, cursor, |row| {
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

fn count(connection: &Connection, sql: &str, params: &[Value]) -> Result<u64, StoreError> {
    let count: i64 =
        connection.query_row(sql, rusqlite::params_from_iter(params), |row| row.get(0))?;
    Ok(count as u64)
}

/// A page of albums: each row is (album, Album Artist, year), and its cover is looked up for the
/// page's rows only.
fn album_page(
    connection: &Connection,
    query: &PagedQuery,
    cursor: Option<&str>,
    total_count: u64,
) -> Result<LibraryAlbumPage, StoreError> {
    let Page { items, next_cursor } = query.fetch(connection, cursor, |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<i32>>(2)?,
        ))
    })?;
    let items = items
        .into_iter()
        .map(|(title, album_artist, year)| {
            Ok(LibraryAlbumSummary {
                artwork: album_cover(connection, &album_artist, &title)?,
                key: LibraryAlbumKey {
                    title,
                    album_artist,
                },
                year,
            })
        })
        .collect::<Result<_, StoreError>>()?;
    Ok(LibraryAlbumPage {
        items,
        total_count,
        next_cursor,
    })
}

/// The cover of an album: the artwork of its first track that has any, in playing order.
fn album_cover(
    connection: &Connection,
    album_artist: &str,
    album: &str,
) -> Result<Option<ArtworkRef>, StoreError> {
    Ok(connection
        .prepare_cached(&format!(
            "SELECT a.content_hash, a.mime_type, a.relative_path
             FROM track_source_metadata m
             JOIN artwork_assets a ON a.id = m.artwork_id
             WHERE m.album_artist_key = ?1 AND m.album_key = ?2
             ORDER BY {ALBUM_ORDER} LIMIT 1"
        ))?
        .query_row(params![album_artist, album], |row| {
            Ok(artwork_ref(row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .optional()?
        .flatten())
}

/// The cover of an Album Artist: the cover of their first album by title, whether or not another
/// album has artwork.
fn artist_cover(
    connection: &Connection,
    album_artist: &str,
) -> Result<Option<ArtworkRef>, StoreError> {
    let first_album: Option<String> = connection
        .prepare_cached(
            "SELECT album_key FROM track_source_metadata WHERE album_artist_key = ?1
             GROUP BY album_key ORDER BY album_key = '', album_key COLLATE NOCASE, album_key LIMIT 1",
        )?
        .query_row(params![album_artist], |row| row.get(0))
        .optional()?;
    first_album.map_or(Ok(None), |album| {
        album_cover(connection, album_artist, &album)
    })
}
