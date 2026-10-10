# 0005: Surrogate IDs for entities, natural-key IDs for derived groups

A track is an entity. Its tags and its file can change, so its identity cannot come from its content. Each track gets a surrogate ID. An album and an artist are groups that the tags define. Their IDs are derived from their names and their location.

- `TrackId` is the SQLite rowid, with `AUTOINCREMENT`. A deleted ID is never reused. A track keeps its ID when its file moves.
- `AlbumId` is the 128-bit hex of a blake3 hash over the normalized Album Artist name, the normalized title, and the absolute folder path.
- `ArtistId` is the 128-bit hex of a blake3 hash over the normalized name.

The folder is an absolute path. Adding a root again gives the same IDs. Changing the tags makes a different album.

Constraint: Album IDs depend on the location. A changed drive letter changes all Album IDs. Persistent references hold only `track_id`. Hash collisions are not handled.
