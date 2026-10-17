-- An album is its (Album Artist, album, folder) triple: details, covers and counts look it up by equality.
CREATE INDEX track_metadata_album_identity_idx ON track_source_metadata(album_artist_key, album_key, album_dir);
-- The Tracks sort orders; the id keeps each one total.
CREATE INDEX track_metadata_title_idx ON track_source_metadata(title_sort, title_key, track_id);
CREATE INDEX track_metadata_artist_idx ON track_source_metadata(artist_sort, artist_key, track_id);
CREATE INDEX track_metadata_album_idx ON track_source_metadata(album_sort, album_key, track_id);
-- Albums and Album Artists in order, so a page reads only its own entries.
CREATE INDEX albums_by_title_idx ON albums(album_sort, album_key, artist_sort, album_artist_key, album_dir);
CREATE INDEX albums_by_artist_idx ON albums(artist_sort, album_artist_key, album_sort, album_key, album_dir);
CREATE INDEX albums_by_year_idx ON albums(year, album_sort, album_key, artist_sort, album_artist_key, album_dir);
CREATE INDEX albums_of_artist_idx ON albums(album_artist_key, album_sort, album_key, album_dir);
CREATE INDEX album_artists_by_name_idx ON album_artists(sort_key, name);
CREATE INDEX album_artists_by_albums_idx ON album_artists(album_count, sort_key, name);
CREATE INDEX album_artists_by_tracks_idx ON album_artists(track_count, sort_key, name);
-- The next scan reads every file once more, for the SortOrder tags only it can see.
UPDATE library_files SET modification_key = 'rescan' WHERE availability = 'available';
