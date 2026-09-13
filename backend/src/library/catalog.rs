use super::policy::effective_track_title;
use super::{
    models::*,
    service::{
        summary_from_row, LibraryCommandError, LibraryShared, ResolvedPlaybackEntry,
        StartLibraryAlbumTrackError,
    },
};
use crate::media::validation::validate_audio_file;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

const PAGE_SIZE: usize = 100;
const CURSOR_VERSION: u8 = 3;
type AlbumDetailsRow = (
    i64,
    Option<i64>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);

#[derive(Debug, Serialize, Deserialize)]
struct CatalogCursor {
    version: u8,
    kind: String,
    owner: String,
    sort_key: String,
    direction: LibrarySortDirection,
    offset: u64,
}

fn validate_album_key(key: &LibraryAlbumKey) -> Result<(), LibraryCommandError> {
    if key.title.trim() != key.title
        || key.album_artist.trim() != key.album_artist
        || key.title.is_empty()
        || key.album_artist.is_empty()
    {
        return Err(LibraryCommandError::InvalidAlbumKey);
    }
    Ok(())
}
fn artist_key(key: &LibraryAlbumArtistKey) -> Result<(), LibraryCommandError> {
    if key.name.trim() != key.name || key.name.is_empty() {
        return Err(LibraryCommandError::InvalidAlbumArtistKey);
    }
    Ok(())
}
fn cursor(
    raw: Option<String>,
    kind: &str,
    owner: &str,
    sort_key: &str,
    direction: LibrarySortDirection,
) -> Result<Option<CatalogCursor>, LibraryCommandError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Err(LibraryCommandError::InvalidCursor);
    }
    let value: CatalogCursor =
        serde_json::from_str(&raw).map_err(|_| LibraryCommandError::InvalidCursor)?;
    if value.version != CURSOR_VERSION
        || value.kind != kind
        || value.owner != owner
        || value.sort_key != sort_key
        || value.direction != direction
    {
        return Err(LibraryCommandError::InvalidCursor);
    }
    Ok(Some(value))
}
fn encode(
    kind: &str,
    owner: &str,
    sort_key: &str,
    direction: LibrarySortDirection,
    offset: usize,
) -> String {
    serde_json::to_string(&CatalogCursor {
        version: CURSOR_VERSION,
        kind: kind.into(),
        owner: owner.into(),
        sort_key: sort_key.into(),
        direction,
        offset: offset as u64,
    })
    .expect("catalog cursor serialization")
}
fn direction_sql(direction: LibrarySortDirection) -> &'static str {
    match direction {
        LibrarySortDirection::Ascending => "ASC",
        LibrarySortDirection::Descending => "DESC",
    }
}
fn sort_key_name<K: std::fmt::Debug>(key: K) -> String {
    format!("{key:?}")
}
fn parse_year(value: Option<&str>) -> Option<i32> {
    let value = value?.trim();
    let year = value.get(..4)?.parse().ok()?;
    (1000..=9999).contains(&year).then_some(year)
}
fn literal_like_pattern(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}
fn track_search_matches(track: &LibraryTrackSummary, search: &str) -> bool {
    if search.is_empty() {
        return true;
    }
    let needle = search.to_ascii_lowercase();
    [
        Some(track.title.as_str()),
        track.artist.as_deref(),
        track.album.as_deref(),
        track.album_artist.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|value| value.to_ascii_lowercase().contains(&needle))
}
fn artwork(hash: Option<String>, mime: Option<String>, path: Option<String>) -> Option<ArtworkRef> {
    match (hash, mime.as_deref(), path) {
        (Some(content_hash), Some("image/jpeg"), Some(relative_path)) => Some(ArtworkRef {
            content_hash,
            mime_type: ArtworkMimeType::Jpeg,
            relative_path,
        }),
        (Some(content_hash), Some("image/png"), Some(relative_path)) => Some(ArtworkRef {
            content_hash,
            mime_type: ArtworkMimeType::Png,
            relative_path,
        }),
        _ => None,
    }
}

const CATALOG_MEMBER_PROJECTION: &str = r#"SELECT t.id, f.root_id, f.relative_path, f.file_name,
  f.availability, f.inspection_status, m.title, m.artist, m.album, m.album_artist,
  m.disc_number, m.track_number, m.artwork_id, m.duration_ms, m.date,
  COALESCE(NULLIF(trim(m.album),''),'Unknown album') AS album_title,
  COALESCE(NULLIF(trim(m.album_artist),''),NULLIF(trim(m.artist),''),'Unknown artist') AS effective_artist,
  m.file_format, m.bit_depth, m.sample_rate
FROM tracks t
JOIN library_files f ON f.id=t.file_id
LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision"#;
type ArtistSummaryRow = (i64, i64, Option<String>, Option<String>, Option<String>);

impl LibraryShared {
    pub fn catalog_tracks(
        &self,
        after: Option<String>,
        search: Option<String>,
        sort_key: LibraryTrackSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        let search = search.unwrap_or_default().trim().to_owned();
        let sort_name = sort_key_name(sort_key);
        let offset = cursor(after, "tracks", &search, &sort_name, sort_direction)?
            .map(|value| value.offset as usize)
            .unwrap_or(0);
        let pattern = literal_like_pattern(&search);
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let total_count = c
            .query_row(
                r#"SELECT COUNT(*)
                FROM tracks t
                JOIN library_files f ON f.id=t.file_id
                LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
                WHERE ?1='' OR COALESCE(NULLIF(trim(m.title),''),CASE WHEN f.extension='' THEN f.file_name ELSE substr(f.file_name,1,length(f.file_name)-length(f.extension)-1) END) LIKE ?2 ESCAPE '\'
                  OR COALESCE(m.artist,'') LIKE ?2 ESCAPE '\'
                  OR COALESCE(NULLIF(trim(m.album),''),'Unknown album') LIKE ?2 ESCAPE '\'
                  OR COALESCE(NULLIF(trim(m.album_artist),''),NULLIF(trim(m.artist),''),'Unknown artist') LIKE ?2 ESCAPE '\'"#,
                params![search, pattern],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)? as u64;
        let title_expr = "COALESCE(NULLIF(trim(m.title),''),CASE WHEN f.extension='' THEN f.file_name ELSE substr(f.file_name,1,length(f.file_name)-length(f.extension)-1) END)";
        let artist_expr = "COALESCE(NULLIF(trim(m.artist),''),'Unknown artist')";
        let album_expr = "COALESCE(NULLIF(trim(m.album),''),'Unknown album')";
        let direction = direction_sql(sort_direction);
        let order_sql = match sort_key {
            LibraryTrackSortKey::Title => {
                format!("{title_expr} COLLATE NOCASE {direction},{title_expr} {direction}")
            }
            LibraryTrackSortKey::Artist => {
                format!("{artist_expr} COLLATE NOCASE {direction},{artist_expr} {direction}")
            }
            LibraryTrackSortKey::Album => {
                format!("{album_expr} COLLATE NOCASE {direction},{album_expr} {direction}")
            }
            LibraryTrackSortKey::Duration => format!(
                "CASE WHEN m.duration_ms IS NULL THEN 1 ELSE 0 END ASC,m.duration_ms {direction}"
            ),
        };
        let mut statement = c
            .prepare(&format!(r#"SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.album,m.album_artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status
                FROM tracks t
                JOIN library_files f ON f.id=t.file_id
                LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
                LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored'
                WHERE (?1='' OR {title_expr} LIKE ?2 ESCAPE '\'
                    OR COALESCE(m.artist,'') LIKE ?2 ESCAPE '\'
                    OR {album_expr} LIKE ?2 ESCAPE '\'
                    OR COALESCE(NULLIF(trim(m.album_artist),''),NULLIF(trim(m.artist),''),'Unknown artist') LIKE ?2 ESCAPE '\')
                ORDER BY {order_sql},t.id ASC"#))
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut rows = statement
            .query(params![search, pattern])
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut all_items = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?
        {
            let track =
                summary_from_row(row).map_err(|_| LibraryCommandError::PersistenceFailed)?;
            if track_search_matches(&track, &search) {
                all_items.push(track);
            }
        }
        let start = offset.min(all_items.len());
        let end = (start + PAGE_SIZE).min(all_items.len());
        let items = all_items[start..end].to_vec();
        let next_after_id = if end < all_items.len() {
            Some(encode("tracks", &search, &sort_name, sort_direction, end))
        } else {
            None
        };
        Ok(LibraryTrackPage {
            items,
            total_count,
            next_after_id,
        })
    }

    pub fn catalog_albums(
        &self,
        after: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        let search = search.unwrap_or_default().trim().to_owned();
        let sort_name = sort_key_name(sort_key);
        let offset = cursor(after, "albums", &search, &sort_name, sort_direction)?
            .map(|value| value.offset as usize)
            .unwrap_or(0);
        let pattern = literal_like_pattern(&search);
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let total_count = c
            .query_row(
                &format!(
                    r#"WITH members AS MATERIALIZED ({}), groups AS (SELECT album_title,effective_artist FROM members GROUP BY album_title,effective_artist)
                    SELECT COUNT(*) FROM groups WHERE (?1='' OR album_title LIKE ?2 ESCAPE '\' OR effective_artist LIKE ?2 ESCAPE '\')"#,
                    CATALOG_MEMBER_PROJECTION
                ),
                params![search, pattern],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)? as u64;
        let direction = direction_sql(sort_direction);
        let order_sql = match sort_key {
            LibraryAlbumSortKey::Title => format!("album_title COLLATE NOCASE {direction},album_title {direction},effective_artist COLLATE NOCASE {direction},effective_artist {direction}"),
            LibraryAlbumSortKey::Artist => format!("effective_artist COLLATE NOCASE {direction},effective_artist {direction},album_title COLLATE NOCASE {direction},album_title {direction}"),
            LibraryAlbumSortKey::Year => format!("CASE WHEN album_year IS NULL THEN 1 ELSE 0 END ASC,album_year {direction},album_title COLLATE NOCASE {direction},album_title {direction},effective_artist COLLATE NOCASE {direction},effective_artist {direction}"),
        };
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), groups AS (SELECT album_title,effective_artist,MIN(CASE WHEN trim(date) GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(substr(trim(date),1,4) AS INTEGER) END) AS album_year FROM members WHERE (?1='' OR album_title LIKE ?2 ESCAPE '\' OR effective_artist LIKE ?2 ESCAPE '\') GROUP BY album_title,effective_artist), ranked AS (SELECT g.album_title,g.effective_artist,g.album_year,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER (PARTITION BY g.album_title,g.effective_artist ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM groups g JOIN members m ON m.album_title=g.album_title AND m.effective_artist=g.effective_artist LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT album_title,effective_artist,album_year,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY {order_sql}"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let rows = stmt
            .query_map(params![search, pattern], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let start = offset.min(raw.len());
        let end = (start + PAGE_SIZE).min(raw.len());
        let page = &raw[start..end];
        let next = if end < raw.len() {
            Some(encode("albums", &search, &sort_name, sort_direction, end))
        } else {
            None
        };
        let items = page
            .iter()
            .map(
                |(title, artist, year, hash, mime, path)| LibraryAlbumSummary {
                    key: LibraryAlbumKey {
                        title: title.clone(),
                        album_artist: artist.clone(),
                    },
                    artwork: artwork(hash.clone(), mime.clone(), path.clone()),
                    year: year.map(|value| value as i32),
                },
            )
            .collect();
        Ok(LibraryAlbumPage {
            items,
            total_count,
            next_cursor: next,
        })
    }

    pub fn catalog_album_artists(
        &self,
        after: Option<String>,
        search: Option<String>,
        sort_key: LibraryAlbumArtistSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
        let search = search.unwrap_or_default().trim().to_owned();
        let sort_name = sort_key_name(sort_key);
        let offset = cursor(after, "albumArtists", &search, &sort_name, sort_direction)?
            .map(|value| value.offset as usize)
            .unwrap_or(0);
        let pattern = literal_like_pattern(&search);
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let total_count = c
            .query_row(
                &format!(
                    r#"WITH members AS MATERIALIZED ({}), groups AS (SELECT effective_artist AS artist_name FROM members GROUP BY effective_artist)
                    SELECT COUNT(*) FROM groups WHERE (?1='' OR artist_name LIKE ?2 ESCAPE '\')"#,
                    CATALOG_MEMBER_PROJECTION
                ),
                params![search, pattern],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)? as u64;
        let direction = direction_sql(sort_direction);
        let order_sql = match sort_key {
            LibraryAlbumArtistSortKey::Artist => {
                format!("artist_name COLLATE NOCASE {direction},artist_name {direction}")
            }
            LibraryAlbumArtistSortKey::AlbumCount => {
                format!("album_count {direction},artist_name COLLATE NOCASE ASC,artist_name ASC")
            }
            LibraryAlbumArtistSortKey::TrackCount => {
                format!("track_count {direction},artist_name COLLATE NOCASE ASC,artist_name ASC")
            }
        };
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), groups AS (SELECT effective_artist AS artist_name,COUNT(DISTINCT album_title) album_count,COUNT(*) track_count FROM members WHERE (?1='' OR effective_artist LIKE ?2 ESCAPE '\') GROUP BY effective_artist), first_albums AS (SELECT effective_artist AS artist_name,album_title FROM (SELECT effective_artist,album_title,ROW_NUMBER() OVER(PARTITION BY effective_artist ORDER BY album_title COLLATE NOCASE,album_title) rank FROM members) WHERE rank=1), ranked AS (SELECT g.artist_name,g.album_count,g.track_count,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER(PARTITION BY g.artist_name ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM groups g JOIN first_albums fa ON fa.artist_name=g.artist_name JOIN members m ON m.effective_artist=fa.artist_name AND m.album_title=fa.album_title LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT artist_name,album_count,track_count,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY {order_sql}"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let rows = stmt
            .query_map(params![search, pattern], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let start = offset.min(raw.len());
        let end = (start + PAGE_SIZE).min(raw.len());
        let page = &raw[start..end];
        let next = if end < raw.len() {
            Some(encode(
                "albumArtists",
                &search,
                &sort_name,
                sort_direction,
                end,
            ))
        } else {
            None
        };
        let items = page
            .iter()
            .map(
                |(name, album_count, track_count, hash, mime, path)| LibraryAlbumArtistSummary {
                    key: LibraryAlbumArtistKey { name: name.clone() },
                    artwork: artwork(hash.clone(), mime.clone(), path.clone()),
                    album_count: *album_count as u64,
                    track_count: *track_count as u64,
                },
            )
            .collect();
        Ok(LibraryAlbumArtistPage {
            items,
            total_count,
            next_cursor: next,
        })
    }

    pub fn catalog_artist_albums(
        &self,
        artist: LibraryAlbumArtistKey,
        after: Option<String>,
        sort_key: LibraryArtistAlbumSortKey,
        sort_direction: LibrarySortDirection,
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        artist_key(&artist)?;
        let sort_name = sort_key_name(sort_key);
        let offset = cursor(
            after,
            "artistAlbums",
            &artist.name,
            &sort_name,
            sort_direction,
        )?
        .map(|value| value.offset as usize)
        .unwrap_or(0);
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let artist_exists: bool = c
            .query_row(
                &format!("WITH members AS MATERIALIZED ({}) SELECT EXISTS(SELECT 1 FROM members WHERE effective_artist=?1)", CATALOG_MEMBER_PROJECTION),
                params![artist.name],
                |row| row.get(0),
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        if !artist_exists {
            return Err(LibraryCommandError::AlbumArtistNotFound);
        }
        let total_count = c
            .query_row(
                &format!(
                    "WITH members AS MATERIALIZED ({}), albums AS (SELECT album_title FROM members WHERE effective_artist=?1 GROUP BY album_title) SELECT COUNT(*) FROM albums",
                    CATALOG_MEMBER_PROJECTION
                ),
                params![artist.name],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| LibraryCommandError::PersistenceFailed)? as u64;
        let direction = direction_sql(sort_direction);
        let order_sql = match sort_key {
            LibraryArtistAlbumSortKey::Title => format!("album_title COLLATE NOCASE {direction},album_title {direction}"),
            LibraryArtistAlbumSortKey::Year => format!("CASE WHEN album_year IS NULL THEN 1 ELSE 0 END ASC,album_year {direction},album_title COLLATE NOCASE {direction},album_title {direction}"),
        };
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), albums AS (SELECT album_title,MIN(CASE WHEN trim(date) GLOB '[0-9][0-9][0-9][0-9]*' THEN CAST(substr(trim(date),1,4) AS INTEGER) END) AS album_year FROM members WHERE effective_artist=?1 GROUP BY album_title), ranked AS (SELECT g.album_title,g.album_year,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER(PARTITION BY g.album_title ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM albums g JOIN members m ON m.album_title=g.album_title AND m.effective_artist=?1 LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT album_title,album_year,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY {order_sql}"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let rows = stmt
            .query_map(params![artist.name], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let start = offset.min(raw.len());
        let end = (start + PAGE_SIZE).min(raw.len());
        let page = &raw[start..end];
        let next = if end < raw.len() {
            Some(encode(
                "artistAlbums",
                &artist.name,
                &sort_name,
                sort_direction,
                end,
            ))
        } else {
            None
        };
        let items = page
            .iter()
            .map(|(title, year, hash, mime, path)| LibraryAlbumSummary {
                key: LibraryAlbumKey {
                    title: title.clone(),
                    album_artist: artist.name.clone(),
                },
                artwork: artwork(hash.clone(), mime.clone(), path.clone()),
                year: year.map(|value| value as i32),
            })
            .collect();
        Ok(LibraryAlbumPage {
            items,
            total_count,
            next_cursor: next,
        })
    }

    pub fn catalog_artist(
        &self,
        artist: LibraryAlbumArtistKey,
    ) -> Result<LibraryAlbumArtistSummary, LibraryCommandError> {
        artist_key(&artist)?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let row: Option<ArtistSummaryRow> = c
            .query_row(
                &format!(
                r#"WITH members AS MATERIALIZED ({}), artist_members AS (
                  SELECT * FROM members WHERE effective_artist=?1
                ), canonical_album AS (
                  SELECT album_title FROM artist_members
                  GROUP BY album_title
                  ORDER BY album_title COLLATE NOCASE, album_title
                  LIMIT 1
                ), ranked_artwork AS (
                  SELECT a.content_hash,a.mime_type,a.relative_path,
                    ROW_NUMBER() OVER (
                      ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,
                        CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,
                        m.disc_number,
                        CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,
                        m.track_number,m.id
                    ) AS rank
                  FROM artist_members m
                  JOIN canonical_album ca ON ca.album_title=m.album_title
                  LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')
                )
                SELECT COUNT(DISTINCT album_title), COUNT(*),
                  (SELECT content_hash FROM ranked_artwork WHERE rank=1),
                  (SELECT mime_type FROM ranked_artwork WHERE rank=1),
                  (SELECT relative_path FROM ranked_artwork WHERE rank=1)
                FROM artist_members
                HAVING COUNT(*) > 0"#,
                    CATALOG_MEMBER_PROJECTION
                ),
                params![artist.name],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((album_count, track_count, hash, mime, path)) = row else {
            return Err(LibraryCommandError::AlbumArtistNotFound);
        };
        Ok(LibraryAlbumArtistSummary {
            key: artist,
            artwork: artwork(hash, mime, path),
            album_count: album_count as u64,
            track_count: track_count as u64,
        })
    }

    pub fn catalog_album_details(
        &self,
        key: LibraryAlbumKey,
    ) -> Result<LibraryAlbumDetails, LibraryCommandError> {
        validate_album_key(&key)?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), album_members AS (SELECT * FROM members WHERE album_title=?1 AND effective_artist=?2), ordered AS (SELECT * FROM album_members ORDER BY CASE WHEN disc_number IS NULL THEN 1 ELSE 0 END,disc_number,CASE WHEN track_number IS NULL THEN 1 ELSE 0 END,track_number,id), ranked_artwork AS (SELECT a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER (ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM ordered m LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT COUNT(*),CASE WHEN COUNT(duration_ms)=COUNT(*) THEN SUM(duration_ms) ELSE NULL END,(SELECT date FROM ordered WHERE date IS NOT NULL AND trim(date)<>'' LIMIT 1),(SELECT CAST(id AS TEXT) FROM ordered WHERE availability='available' AND inspection_status='indexed' LIMIT 1),(SELECT content_hash FROM ranked_artwork WHERE rank=1),(SELECT mime_type FROM ranked_artwork WHERE rank=1),(SELECT relative_path FROM ranked_artwork WHERE rank=1) FROM album_members"#,
            CATALOG_MEMBER_PROJECTION
        );
        let row: Option<AlbumDetailsRow> = c
            .query_row(&sql, params![key.title, key.album_artist], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ))
            })
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((count, duration, date, playable, hash, mime, path)) = row else {
            return Err(LibraryCommandError::AlbumNotFound);
        };
        if count == 0 {
            return Err(LibraryCommandError::AlbumNotFound);
        }
        let cover = artwork(hash, mime, path);
        Ok(LibraryAlbumDetails {
            summary: LibraryAlbumSummary {
                key,
                artwork: cover,
                year: parse_year(date.as_deref()),
            },
            date,
            track_count: count as u64,
            duration_ms: duration.map(|v| v as u64),
            first_playable_track_id: playable,
        })
    }

    pub fn catalog_album_tracks(
        &self,
        key: LibraryAlbumKey,
        offset: u32,
    ) -> Result<LibraryAlbumTrackPage, LibraryCommandError> {
        validate_album_key(&key)?;
        let _ = self.catalog_album_details(key.clone())?;
        let c = self
            .db()?
            .read()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}) SELECT id,file_name,title,artist,track_number,disc_number,file_format,bit_depth,sample_rate,duration_ms,availability,inspection_status FROM members WHERE album_title=?1 AND effective_artist=?2 ORDER BY CASE WHEN disc_number IS NULL THEN 1 ELSE 0 END,disc_number,CASE WHEN track_number IS NULL THEN 1 ELSE 0 END,track_number,id LIMIT 101 OFFSET ?3"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut s = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let rows = s
            .query_map(params![key.title, key.album_artist, offset], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<i64>>(7)?,
                    r.get::<_, Option<i64>>(8)?,
                    r.get::<_, Option<i64>>(9)?,
                    r.get::<_, String>(10)?,
                    r.get::<_, String>(11)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut items = rows
            .map(|x| {
                x.map(
                    |(
                        id,
                        file,
                        title,
                        artist,
                        track,
                        disc,
                        file_format,
                        bit_depth,
                        sample_rate,
                        duration,
                        availability,
                        inspection,
                    )| {
                        LibraryAlbumTrackSummary {
                            id: id.to_string(),
                            title: effective_track_title(title.as_deref(), &file),
                            artist: artist.filter(|v| !v.trim().is_empty()),
                            track_number: track.map(|v| v as u32),
                            disc_number: disc.map(|v| v as u32),
                            file_format: file_format.filter(|v| !v.trim().is_empty()),
                            bit_depth: bit_depth.map(|v| v as u32),
                            sample_rate: sample_rate.map(|v| v as u32),
                            duration_ms: duration.map(|v| v as u64),
                            availability: if availability == "available" {
                                LibraryFileAvailability::Available
                            } else {
                                LibraryFileAvailability::Missing
                            },
                            playable: availability == "available" && inspection == "indexed",
                        }
                    },
                )
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let next = if items.len() > PAGE_SIZE {
            items.pop();
            Some(offset + PAGE_SIZE as u32)
        } else {
            None
        };
        Ok(LibraryAlbumTrackPage {
            items,
            next_offset: next,
        })
    }

    pub fn catalog_playback(
        &self,
        key: LibraryAlbumKey,
        track_id: Option<String>,
    ) -> Result<(Vec<ResolvedPlaybackEntry>, usize), StartLibraryAlbumTrackError> {
        validate_album_key(&key).map_err(|_| StartLibraryAlbumTrackError::InvalidAlbumKey)?;
        let id = track_id
            .as_deref()
            .map(|v| {
                v.parse::<i64>()
                    .map_err(|_| StartLibraryAlbumTrackError::InvalidTrackId)
            })
            .transpose()?;
        let c = self
            .db()
            .map_err(|_| StartLibraryAlbumTrackError::LibraryUnavailable)?
            .read()
            .map_err(|_| StartLibraryAlbumTrackError::PersistenceFailed)?;
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}) SELECT m.id,r.path,m.relative_path,m.file_name,m.availability,m.inspection_status,m.title,m.artist,m.duration_ms FROM members m JOIN library_roots r ON r.id=m.root_id WHERE m.album_title=?1 AND m.effective_artist=?2 ORDER BY CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut s = c
            .prepare(&sql)
            .map_err(|_| StartLibraryAlbumTrackError::PersistenceFailed)?;
        let rows = s
            .query_map(params![key.title, key.album_artist], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                    r.get::<_, Option<i64>>(8)?,
                ))
            })
            .map_err(|_| StartLibraryAlbumTrackError::PersistenceFailed)?;
        let candidates = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| StartLibraryAlbumTrackError::PersistenceFailed)?;
        if candidates.is_empty() {
            return Err(StartLibraryAlbumTrackError::AlbumNotFound);
        };
        if let Some(requested) = id {
            if !candidates.iter().any(|v| v.0 == requested) {
                return Err(StartLibraryAlbumTrackError::TrackNotMember);
            }
        }
        let mut entries = Vec::new();
        let mut requested_index = None;
        let mut playable_index = 0usize;
        for (
            track_id,
            root,
            relative,
            file_name,
            availability,
            inspection,
            title,
            artist,
            duration,
        ) in candidates
        {
            if availability != "available" || inspection != "indexed" {
                if id == Some(track_id) {
                    return Err(if availability != "available" {
                        StartLibraryAlbumTrackError::TrackUnavailable
                    } else {
                        StartLibraryAlbumTrackError::TrackNotPlayable
                    });
                }
                continue;
            }
            let file =
                validate_audio_file(Path::new(&root).join(relative).to_string_lossy().as_ref())
                    .map_err(|_| StartLibraryAlbumTrackError::SourceUnavailable)?;
            if id == Some(track_id) {
                requested_index = Some(playable_index);
            }
            entries.push(ResolvedPlaybackEntry {
                file,
                title: effective_track_title(title.as_deref(), &file_name),
                artist,
                duration_ms: duration.map(|v| v as u64),
            });
            playable_index += 1;
        }
        if entries.is_empty() {
            return Err(StartLibraryAlbumTrackError::NoPlayableTracks);
        };
        Ok((entries, requested_index.unwrap_or(0)))
    }
}
