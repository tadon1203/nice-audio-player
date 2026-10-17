-- The indexes of the renamed columns: the album a track is on, its directory and title for a
-- compilation, and the Tracks sort orders. The id keeps each order total.
DROP INDEX track_metadata_album_identity_idx;
DROP INDEX track_metadata_title_idx;
DROP INDEX track_metadata_artist_idx;
DROP INDEX track_metadata_album_idx;
CREATE INDEX track_source_metadata_album_idx ON track_source_metadata(album_id);
CREATE INDEX track_source_metadata_directory_idx ON track_source_metadata(album_directory, album);
CREATE INDEX track_source_metadata_title_idx ON track_source_metadata(title_sort, title, track_id);
CREATE INDEX track_source_metadata_artist_idx ON track_source_metadata(artist_sort, artist, track_id);
CREATE INDEX track_source_metadata_album_title_idx ON track_source_metadata(album_sort, album, track_id);
-- Albums and Album Artists in order, so a page reads only its own entries.
CREATE INDEX albums_by_title_idx ON albums(title_sort, title, album_artist_sort, album_artist, id);
CREATE INDEX albums_by_artist_idx ON albums(album_artist_sort, album_artist, title_sort, title, id);
CREATE INDEX albums_by_year_idx ON albums(year, title_sort, title, album_artist_sort, album_artist, id);
CREATE INDEX albums_of_artist_idx ON albums(artist_id, title_sort, title, id);
CREATE INDEX artists_by_name_idx ON artists(name_sort, name);
CREATE INDEX artists_by_albums_idx ON artists(album_count, name_sort, name);
CREATE INDEX artists_by_tracks_idx ON artists(track_count, name_sort, name);
