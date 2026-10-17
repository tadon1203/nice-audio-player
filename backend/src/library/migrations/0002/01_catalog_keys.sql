-- Columns nobody reads.
ALTER TABLE library_roots DROP COLUMN last_scan_started_at_ms;
ALTER TABLE library_roots DROP COLUMN last_scan_error_code;
ALTER TABLE library_roots DROP COLUMN created_at_ms;
ALTER TABLE library_roots DROP COLUMN updated_at_ms;
ALTER TABLE library_files DROP COLUMN byte_length;
ALTER TABLE library_files DROP COLUMN inspection_error_code;
ALTER TABLE library_files DROP COLUMN updated_at_ms;
ALTER TABLE tracks DROP COLUMN created_at_ms;
ALTER TABLE artwork_assets DROP COLUMN created_at_ms;
ALTER TABLE track_source_metadata DROP COLUMN tag_error_code;
ALTER TABLE track_source_metadata DROP COLUMN updated_at_ms;

-- What the catalog files a track under. Rust computes them (library/keys.rs) when it writes a
-- row and backfills the existing rows right after this script, so no rescan is needed.
ALTER TABLE track_source_metadata ADD COLUMN title_key TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN artist_key TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN album_key TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN album_artist_key TEXT NOT NULL DEFAULT '';
ALTER TABLE track_source_metadata ADD COLUMN year INTEGER;
