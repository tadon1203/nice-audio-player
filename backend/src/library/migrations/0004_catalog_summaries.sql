-- What the catalog sorts and filters by (library/text.rs): a key per sortable name, one for the
-- filter, and the folder that tells two printings of an album apart. Rust computes them when it
-- writes a row and backfills the existing rows right after this script.
ALTER TABLE track_source_metadata ADD COLUMN title_sort TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN artist_sort TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN album_sort TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN album_artist_sort TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN search_key TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN album_dir TEXT NOT NULL DEFAULT '';

DROP INDEX track_metadata_album_identity_idx;
DROP INDEX track_metadata_albums_by_title_idx;
DROP INDEX track_metadata_albums_by_artist_idx;
DROP INDEX track_metadata_title_idx;
DROP INDEX track_metadata_artist_idx;
DROP INDEX track_metadata_album_idx;

-- One row per album and per Album Artist, kept up to date by the scan (library/summary.rs), so a
-- page of either reads its rows instead of aggregating every track.
CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  album_artist_key TEXT NOT NULL, album_key TEXT NOT NULL, album_dir TEXT NOT NULL,
  album_sort TEXT NOT NULL, artist_sort TEXT NOT NULL, search_key TEXT NOT NULL,
  year INTEGER, track_count INTEGER NOT NULL,
  cover_artwork_id INTEGER REFERENCES artwork_assets(id) ON DELETE SET NULL,
  UNIQUE(album_artist_key, album_key, album_dir)
);
CREATE TABLE album_artists (
  name TEXT PRIMARY KEY, sort_key TEXT NOT NULL, search_key TEXT NOT NULL,
  album_count INTEGER NOT NULL, track_count INTEGER NOT NULL,
  cover_artwork_id INTEGER REFERENCES artwork_assets(id) ON DELETE SET NULL
);
