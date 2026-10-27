-- The Library schema, version 2. There are no migrations: a database with another version is
-- replaced (library/storage.rs).

CREATE TABLE directories (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  scan_generation INTEGER NOT NULL DEFAULT 0,
  last_successful_scan_at_ms INTEGER
);

CREATE TABLE library_files (
  id INTEGER PRIMARY KEY,
  directory_id INTEGER NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  modification_key TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  seen_generation INTEGER NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('available','missing')),
  inspection_status TEXT NOT NULL CHECK(inspection_status IN ('pending','indexed','unsupported','failed')),
  byte_length INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  relink_pending INTEGER NOT NULL DEFAULT 0,
  UNIQUE(directory_id, relative_path)
);

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL UNIQUE REFERENCES library_files(id) ON DELETE CASCADE
);

-- An image, stored once per content hash. Its files are `artwork/<shard>/<hash>.<ext>` and, when
-- `has_thumbnail` is 1, `artwork/<shard>/<hash>.thumb.jpg`; the paths follow from the hash and `mime`.
CREATE TABLE artwork (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
  has_thumbnail INTEGER NOT NULL CHECK(has_thumbnail IN (0,1)),
  byte_length INTEGER NOT NULL,
  accent TEXT
);

CREATE TABLE track_source_metadata (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL,
  tag_title TEXT,
  tag_artist TEXT,
  tag_album TEXT,
  tag_album_artist TEXT,
  track_number INTEGER,
  track_total INTEGER,
  disc_number INTEGER,
  disc_total INTEGER,
  genre TEXT,
  date TEXT,
  duration_ms INTEGER,
  file_format TEXT,
  codec TEXT,
  sample_rate INTEGER,
  channel_count INTEGER,
  bit_depth INTEGER,
  bitrate_kbps INTEGER,
  tag_status TEXT NOT NULL CHECK(tag_status IN ('loaded','absent','failed')),
  artwork_status TEXT NOT NULL CHECK(artwork_status IN ('notPresent','unavailable','invalid','stored','storeFailed')),
  artwork_hash TEXT REFERENCES artwork(hash) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  album_artist TEXT NOT NULL DEFAULT '',
  year INTEGER,
  title_sort TEXT NOT NULL DEFAULT '',
  artist_sort TEXT NOT NULL DEFAULT '',
  album_sort TEXT NOT NULL DEFAULT '',
  album_artist_sort TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  album_id TEXT NOT NULL DEFAULT '',
  album_directory_id INTEGER NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  album_relative_dir TEXT NOT NULL DEFAULT ''
);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  title TEXT NOT NULL,
  album_artist TEXT NOT NULL,
  directory_id INTEGER NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  relative_dir TEXT NOT NULL,
  title_sort TEXT NOT NULL,
  album_artist_sort TEXT NOT NULL,
  search_text TEXT NOT NULL,
  year INTEGER,
  track_count INTEGER NOT NULL,
  cover_artwork_hash TEXT REFERENCES artwork(hash) ON DELETE SET NULL
);

CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_sort TEXT NOT NULL,
  search_text TEXT NOT NULL,
  album_count INTEGER NOT NULL,
  track_count INTEGER NOT NULL,
  cover_artwork_hash TEXT REFERENCES artwork(hash) ON DELETE SET NULL
);

CREATE INDEX library_files_directory_seen_idx ON library_files(directory_id, seen_generation);
CREATE INDEX library_files_directory_availability_idx ON library_files(directory_id, availability);
CREATE INDEX library_files_identity_idx ON library_files(byte_length, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX track_source_metadata_artwork_idx ON track_source_metadata(artwork_hash);
CREATE INDEX track_metadata_duration_idx ON track_source_metadata(duration_ms, track_id);
CREATE INDEX track_source_metadata_album_idx ON track_source_metadata(album_id);
CREATE INDEX track_source_metadata_edition_idx ON track_source_metadata(album_directory_id, album_relative_dir, album);
CREATE INDEX track_source_metadata_title_idx ON track_source_metadata(title_sort, title, track_id);
CREATE INDEX track_source_metadata_artist_idx ON track_source_metadata(artist_sort, artist, track_id);
CREATE INDEX track_source_metadata_album_title_idx ON track_source_metadata(album_sort, album, track_id);
CREATE INDEX albums_by_title_idx ON albums(title_sort, title, album_artist_sort, album_artist, id);
CREATE INDEX albums_by_artist_idx ON albums(album_artist_sort, album_artist, title_sort, title, id);
CREATE INDEX albums_by_year_idx ON albums(year, title_sort, title, album_artist_sort, album_artist, id);
CREATE INDEX albums_of_artist_idx ON albums(artist_id, title_sort, title, id);
CREATE INDEX artists_by_name_idx ON artists(name_sort, name);
CREATE INDEX artists_by_albums_idx ON artists(album_count, name_sort, name);
CREATE INDEX artists_by_tracks_idx ON artists(track_count, name_sort, name);
