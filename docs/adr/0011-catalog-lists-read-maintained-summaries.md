# 0011: Albums and Album Artists are listed from summary tables; names sort and search by stored folded keys

Albums and Album Artists have tables of their own (`albums`, `album_artists`). The scan transaction that changes their tracks also writes them (`library/summary.rs`). Before, every page aggregated `track_source_metadata`. Bulk changes (folder removed, Missing tracks deleted, relink, migration) rebuild the tables in one pass.

- A page of either list is an index range plus one join for the cover. Year and count sorts use plain indexed columns. Only the first page of a list counts it.
- Every sortable name has a stored sort key. Every track has a stored search key. Both are folded (`library/text.rs`): NFKC, katakana to hiragana, lowercase, Latin accents dropped. A SortOrder tag replaces the name as the sort source.
- Sort, filter and the scroll index are all functions of these keys, so they cannot disagree. A change to the folding needs a migration that recomputes the keys.
- An album is (Album Artist, title, Edition). See [CONTEXT.md](../../CONTEXT.md). The same transaction settles Compilations. It moves the untagged tracks of a folder between their own artist and "Various Artists" as tracks arrive or leave.
- The scroll index is a `GROUP BY` on the first character of the sort key column. It runs when the list's filter or sort changes, not for each page. A jump skips rows by `OFFSET` over the same index to find the keyset cursor, so it reads only the target region.
- Rejected: aggregating (`GROUP BY`) for each page. It is simple, but the cost for a year or count sort grows with the whole Library on every page. It also needs the per-row cover lookups that this design removes.
