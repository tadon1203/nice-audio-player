-- An album is its (Album Artist, album) pair: details, covers and counts look it up by equality.
CREATE INDEX track_metadata_album_identity_idx ON track_source_metadata(album_artist_key, album_key);
-- Albums and Album Artists in key order, so a page reads only its own entries.
CREATE INDEX track_metadata_albums_by_title_idx ON track_source_metadata(album_key COLLATE NOCASE, album_key, album_artist_key COLLATE NOCASE, album_artist_key);
CREATE INDEX track_metadata_albums_by_artist_idx ON track_source_metadata(album_artist_key COLLATE NOCASE, album_artist_key, album_key COLLATE NOCASE, album_key);
-- The Tracks sort orders; the id keeps each one total.
CREATE INDEX track_metadata_title_idx ON track_source_metadata(title_key COLLATE NOCASE, title_key, track_id);
CREATE INDEX track_metadata_artist_idx ON track_source_metadata(artist_key COLLATE NOCASE, artist_key, track_id);
CREATE INDEX track_metadata_album_idx ON track_source_metadata(album_key COLLATE NOCASE, album_key, track_id);
CREATE INDEX track_metadata_duration_idx ON track_source_metadata(duration_ms, track_id);
