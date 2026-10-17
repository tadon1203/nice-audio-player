-- Domain names. The raw tags keep the tag names; the normalized keys take the domain names.
ALTER TABLE track_source_metadata RENAME COLUMN title TO tag_title;
ALTER TABLE track_source_metadata RENAME COLUMN artist TO tag_artist;
ALTER TABLE track_source_metadata RENAME COLUMN album TO tag_album;
ALTER TABLE track_source_metadata RENAME COLUMN album_artist TO tag_album_artist;
ALTER TABLE track_source_metadata RENAME COLUMN title_key TO title;
ALTER TABLE track_source_metadata RENAME COLUMN artist_key TO artist;
ALTER TABLE track_source_metadata RENAME COLUMN album_key TO album;
ALTER TABLE track_source_metadata RENAME COLUMN album_artist_key TO album_artist;
ALTER TABLE track_source_metadata RENAME COLUMN search_key TO search_text;
-- The album directory stays: compilations find their tracks by it (CONTEXT.md, "Compilation").
ALTER TABLE track_source_metadata RENAME COLUMN album_dir TO album_directory;

-- The album ID (ids.rs): the album's Album Artist, title and absolute album directory. The root
-- path and the album directory are joined with "/", as keys::absolute_directory does.
ALTER TABLE track_source_metadata ADD COLUMN album_id TEXT NOT NULL DEFAULT '';
UPDATE track_source_metadata
SET album_id = album_id(album_artist, album,
      CASE WHEN album = '' THEN ''
           ELSE r.path || '/' || substr(album_directory, instr(album_directory, '/') + 1) END)
FROM tracks t
JOIN library_files f ON f.id = t.file_id
JOIN library_roots r ON r.id = f.root_id
WHERE t.id = track_source_metadata.track_id;

-- One row per album and per Album Artist, filled by the summary rebuild that follows this script.
DROP TABLE albums;
DROP TABLE album_artists;
CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  title TEXT NOT NULL, album_artist TEXT NOT NULL, album_directory TEXT NOT NULL,
  title_sort TEXT NOT NULL, album_artist_sort TEXT NOT NULL, search_text TEXT NOT NULL,
  year INTEGER, track_count INTEGER NOT NULL,
  cover_artwork_id INTEGER REFERENCES artwork_assets(id) ON DELETE SET NULL
);
CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, name_sort TEXT NOT NULL, search_text TEXT NOT NULL,
  album_count INTEGER NOT NULL, track_count INTEGER NOT NULL,
  cover_artwork_id INTEGER REFERENCES artwork_assets(id) ON DELETE SET NULL
);
