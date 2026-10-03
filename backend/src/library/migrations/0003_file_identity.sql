-- What a file is, apart from where it is: its size (also the cheap half of change detection) and
-- a hash of its head and tail (library/scanner/identity.rs). A moved or renamed file is found
-- again by them. `relink_pending` marks files first indexed since the last completed scan, the
-- only ones a Missing track may be relinked to.
ALTER TABLE library_files ADD COLUMN byte_length INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library_files ADD COLUMN content_hash TEXT;
ALTER TABLE library_files ADD COLUMN relink_pending INTEGER NOT NULL DEFAULT 0;
CREATE INDEX library_files_identity_idx ON library_files(byte_length, content_hash) WHERE content_hash IS NOT NULL;
-- The next scan reads every file once more to fill in the above.
UPDATE library_files SET modification_key = 'rescan' WHERE availability = 'available';
