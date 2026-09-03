CREATE TABLE library_roots (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  scan_generation INTEGER NOT NULL DEFAULT 0, last_scan_started_at_ms INTEGER,
  last_successful_scan_at_ms INTEGER, last_scan_error_code TEXT, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
);
CREATE TABLE library_files (
  id INTEGER PRIMARY KEY, root_id INTEGER NOT NULL REFERENCES library_roots(id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL, file_name TEXT NOT NULL, extension TEXT NOT NULL, byte_length INTEGER NOT NULL,
  modification_key TEXT NOT NULL, source_revision INTEGER NOT NULL, seen_generation INTEGER NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('available','missing')), inspection_status TEXT NOT NULL CHECK(inspection_status IN ('pending','indexed','unsupported','failed')),
  inspection_error_code TEXT, updated_at_ms INTEGER NOT NULL, UNIQUE(root_id, relative_path)
);
CREATE TABLE tracks (id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL UNIQUE REFERENCES library_files(id) ON DELETE RESTRICT, created_at_ms INTEGER NOT NULL);
CREATE TABLE artwork_assets (id INTEGER PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png')), relative_path TEXT NOT NULL UNIQUE, byte_length INTEGER NOT NULL, created_at_ms INTEGER NOT NULL);
CREATE TABLE track_source_metadata (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE RESTRICT, source_revision INTEGER NOT NULL,
  title TEXT, artist TEXT, album TEXT, album_artist TEXT, track_number INTEGER, track_total INTEGER, disc_number INTEGER, disc_total INTEGER, genre TEXT, date TEXT,
  duration_ms INTEGER, file_format TEXT, codec TEXT, sample_rate INTEGER, channel_count INTEGER, bit_depth INTEGER, bitrate_kbps INTEGER,
  tag_status TEXT NOT NULL, tag_error_code TEXT, artwork_status TEXT NOT NULL, artwork_id INTEGER REFERENCES artwork_assets(id) ON DELETE RESTRICT, updated_at_ms INTEGER NOT NULL
);
CREATE INDEX library_files_root_seen_idx ON library_files(root_id, seen_generation);
CREATE INDEX library_files_root_availability_idx ON library_files(root_id, availability);
CREATE INDEX track_source_metadata_artwork_idx ON track_source_metadata(artwork_id);
