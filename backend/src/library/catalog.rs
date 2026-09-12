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
const CURSOR_VERSION: u8 = 2;
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
    first: String,
    second: String,
    third: Option<String>,
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
) -> Result<Option<CatalogCursor>, LibraryCommandError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    if raw.is_empty() {
        return Err(LibraryCommandError::InvalidCursor);
    }
    let value: CatalogCursor =
        serde_json::from_str(&raw).map_err(|_| LibraryCommandError::InvalidCursor)?;
    if value.version != CURSOR_VERSION || value.kind != kind || value.owner != owner {
        return Err(LibraryCommandError::InvalidCursor);
    }
    Ok(Some(value))
}
fn encode(kind: &str, owner: &str, first: String, second: String, third: Option<String>) -> String {
    serde_json::to_string(&CatalogCursor {
        version: CURSOR_VERSION,
        kind: kind.into(),
        owner: owner.into(),
        first,
        second,
        third,
    })
    .expect("catalog cursor serialization")
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
type ArtistSummaryRow = (i64, Option<String>, Option<String>, Option<String>);

impl LibraryShared {
    pub fn catalog_tracks(
        &self,
        after: Option<String>,
        search: Option<String>,
    ) -> Result<LibraryTrackPage, LibraryCommandError> {
        let after = match after {
            Some(value) => super::service::parse_id(&value)?,
            None => 0,
        };
        let search = search.unwrap_or_default().trim().to_owned();
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
        let mut statement = c
            .prepare(r#"SELECT t.id,f.file_name,f.availability,f.inspection_status,m.title,m.artist,m.album,m.album_artist,m.duration_ms,a.content_hash,a.mime_type,a.relative_path,m.artwork_status
                FROM tracks t
                JOIN library_files f ON f.id=t.file_id
                LEFT JOIN track_source_metadata m ON m.track_id=t.id AND m.source_revision=f.source_revision
                LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND m.artwork_status='stored'
                WHERE t.id>?1
                  AND (?2='' OR COALESCE(NULLIF(trim(m.title),''),CASE WHEN f.extension='' THEN f.file_name ELSE substr(f.file_name,1,length(f.file_name)-length(f.extension)-1) END) LIKE ?3 ESCAPE '\'
                    OR COALESCE(m.artist,'') LIKE ?3 ESCAPE '\'
                    OR COALESCE(NULLIF(trim(m.album),''),'Unknown album') LIKE ?3 ESCAPE '\'
                    OR COALESCE(NULLIF(trim(m.album_artist),''),NULLIF(trim(m.artist),''),'Unknown artist') LIKE ?3 ESCAPE '\')
                ORDER BY t.id"#)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut rows = statement
            .query(params![after, search, pattern])
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut items = Vec::with_capacity(PAGE_SIZE + 1);
        while let Some(row) = rows
            .next()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?
        {
            let track =
                summary_from_row(row).map_err(|_| LibraryCommandError::PersistenceFailed)?;
            if track_search_matches(&track, &search) {
                items.push(track);
                if items.len() > PAGE_SIZE {
                    break;
                }
            }
        }
        let next_after_id = if items.len() > PAGE_SIZE {
            items.pop();
            items.last().map(|item| item.id.clone())
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
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        let search = search.unwrap_or_default().trim().to_owned();
        let after = cursor(after, "albums", &search)?;
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
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}) , groups AS (SELECT album_title,effective_artist FROM members GROUP BY album_title,effective_artist), page AS (
          SELECT album_title,effective_artist FROM groups WHERE (?1='' OR album_title LIKE ?2 ESCAPE '\' OR effective_artist LIKE ?2 ESCAPE '\') AND (?3 IS NULL OR album_title COLLATE NOCASE > ?3 COLLATE NOCASE OR (album_title COLLATE NOCASE = ?3 COLLATE NOCASE AND effective_artist COLLATE NOCASE > ?4 COLLATE NOCASE) OR (album_title COLLATE NOCASE = ?3 COLLATE NOCASE AND effective_artist COLLATE NOCASE = ?4 COLLATE NOCASE AND (album_title > ?3 OR (album_title = ?3 AND effective_artist > ?4)))) ORDER BY album_title COLLATE NOCASE,effective_artist COLLATE NOCASE,album_title,effective_artist LIMIT 101
        ), ranked AS (SELECT p.*,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER (PARTITION BY p.album_title,p.effective_artist ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM page p JOIN members m ON m.album_title=p.album_title AND m.effective_artist=p.effective_artist LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png'))
        SELECT album_title,effective_artist,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY album_title COLLATE NOCASE,effective_artist COLLATE NOCASE,album_title,effective_artist"#,
            CATALOG_MEMBER_PROJECTION
        );
        let (first, second) = after
            .as_ref()
            .map(|v| (Some(v.first.as_str()), Some(v.second.as_str())))
            .unwrap_or((None, None));
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let rows = stmt
            .query_map(params![search, pattern, first, second], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let next = if raw.len() > PAGE_SIZE {
            raw.pop();
            raw.last()
                .map(|r| encode("albums", &search, r.0.clone(), r.1.clone(), None))
        } else {
            None
        };
        let items = raw
            .into_iter()
            .map(|(title, artist, hash, mime, path)| LibraryAlbumSummary {
                key: LibraryAlbumKey {
                    title,
                    album_artist: artist,
                },
                artwork: artwork(hash, mime, path),
            })
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
    ) -> Result<LibraryAlbumArtistPage, LibraryCommandError> {
        let search = search.unwrap_or_default().trim().to_owned();
        let after = cursor(after, "albumArtists", &search)?;
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
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), groups AS (SELECT effective_artist AS artist_name,COUNT(DISTINCT album_title) album_count FROM members GROUP BY effective_artist), page AS (SELECT artist_name,album_count FROM groups WHERE (?1='' OR artist_name LIKE ?2 ESCAPE '\') AND (?3 IS NULL OR artist_name COLLATE NOCASE > ?3 COLLATE NOCASE OR (artist_name COLLATE NOCASE = ?3 COLLATE NOCASE AND artist_name > ?3)) ORDER BY artist_name COLLATE NOCASE,artist_name LIMIT 101), first_albums AS (SELECT effective_artist AS artist_name,album_title FROM (SELECT effective_artist,album_title,ROW_NUMBER() OVER(PARTITION BY effective_artist ORDER BY album_title COLLATE NOCASE,album_title) rank FROM members) WHERE rank=1), ranked AS (SELECT p.artist_name,p.album_count,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER(PARTITION BY p.artist_name ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM page p JOIN first_albums fa ON fa.artist_name=p.artist_name JOIN members m ON m.effective_artist=fa.artist_name AND m.album_title=fa.album_title LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT artist_name,album_count,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY artist_name COLLATE NOCASE,artist_name"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let after_name = after.as_ref().map(|v| v.first.as_str());
        let rows = stmt
            .query_map(params![search, pattern, after_name], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let next = if raw.len() > PAGE_SIZE {
            raw.pop();
            raw.last()
                .map(|r| encode("albumArtists", &search, r.0.clone(), r.0.clone(), None))
        } else {
            None
        };
        let items = raw
            .into_iter()
            .map(
                |(name, count, hash, mime, path)| LibraryAlbumArtistSummary {
                    key: LibraryAlbumArtistKey { name },
                    artwork: artwork(hash, mime, path),
                    album_count: count as u64,
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
    ) -> Result<LibraryAlbumPage, LibraryCommandError> {
        artist_key(&artist)?;
        let after = cursor(after, "artistAlbums", &artist.name)?;
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
        let sql = format!(
            r#"WITH members AS MATERIALIZED ({}), albums AS (SELECT album_title FROM members WHERE effective_artist=?1 GROUP BY album_title), page AS (SELECT album_title FROM albums WHERE (?2 IS NULL OR album_title COLLATE NOCASE > ?2 COLLATE NOCASE OR (album_title COLLATE NOCASE=?2 AND album_title>?2)) ORDER BY album_title COLLATE NOCASE,album_title LIMIT 101), ranked AS (SELECT p.album_title,a.content_hash,a.mime_type,a.relative_path,ROW_NUMBER() OVER(PARTITION BY p.album_title ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END,CASE WHEN m.disc_number IS NULL THEN 1 ELSE 0 END,m.disc_number,CASE WHEN m.track_number IS NULL THEN 1 ELSE 0 END,m.track_number,m.id) rank FROM page p JOIN members m ON m.album_title=p.album_title AND m.effective_artist=?1 LEFT JOIN artwork_assets a ON a.id=m.artwork_id AND a.mime_type IN ('image/jpeg','image/png')) SELECT album_title,content_hash,mime_type,relative_path FROM ranked WHERE rank=1 ORDER BY album_title COLLATE NOCASE,album_title"#,
            CATALOG_MEMBER_PROJECTION
        );
        let mut stmt = c
            .prepare(&sql)
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let after_title = after.as_ref().map(|v| v.first.as_str());
        let rows = stmt
            .query_map(params![artist.name, after_title], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let mut raw = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let next = if raw.len() > PAGE_SIZE {
            raw.pop();
            raw.last().map(|r| {
                encode(
                    "artistAlbums",
                    &artist.name,
                    r.0.clone(),
                    artist.name.clone(),
                    None,
                )
            })
        } else {
            None
        };
        let items = raw
            .into_iter()
            .map(|(title, hash, mime, path)| LibraryAlbumSummary {
                key: LibraryAlbumKey {
                    title,
                    album_artist: artist.name.clone(),
                },
                artwork: artwork(hash, mime, path),
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
                SELECT COUNT(DISTINCT album_title),
                  (SELECT content_hash FROM ranked_artwork WHERE rank=1),
                  (SELECT mime_type FROM ranked_artwork WHERE rank=1),
                  (SELECT relative_path FROM ranked_artwork WHERE rank=1)
                FROM artist_members
                HAVING COUNT(*) > 0"#,
                    CATALOG_MEMBER_PROJECTION
                ),
                params![artist.name],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()
            .map_err(|_| LibraryCommandError::PersistenceFailed)?;
        let Some((album_count, hash, mime, path)) = row else {
            return Err(LibraryCommandError::AlbumArtistNotFound);
        };
        Ok(LibraryAlbumArtistSummary {
            key: artist,
            artwork: artwork(hash, mime, path),
            album_count: album_count as u64,
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
