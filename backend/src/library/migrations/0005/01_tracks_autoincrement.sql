-- The official table rebuild (https://www.sqlite.org/lang_altertable.html). `tracks` becomes
-- AUTOINCREMENT, so a deleted track ID is never used again. The IDs are copied unchanged, and
-- sqlite_sequence starts at the largest of them.
CREATE TABLE tracks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL UNIQUE REFERENCES library_files(id) ON DELETE CASCADE
);
INSERT INTO tracks_new (id, file_id) SELECT id, file_id FROM tracks;
DROP TABLE tracks;
ALTER TABLE tracks_new RENAME TO tracks;
