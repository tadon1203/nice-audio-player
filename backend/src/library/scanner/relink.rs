//! Finding moved and renamed files again. After a complete scan, a file that arrived (first
//! indexed since the last complete scan) is matched with a Missing track: by size and the hash of
//! its head and tail, else by the tags that make it the same recording. The match keeps the
//! Missing track's id, so queues and links to it still resolve.

use rusqlite::{params, Connection, TransactionBehavior};

/// What identifies a file's track beyond where the file is.
#[derive(Debug, Clone)]
pub(super) struct Identity {
    pub file_id: i64,
    pub track_id: i64,
    pub byte_length: i64,
    pub content_hash: Option<String>,
    pub fingerprint: Option<Fingerprint>,
}

/// Title, artist, album, track number and duration: what a retagged or re-encoded copy of the
/// same recording still has in common. Only a track whose tags name it fully has one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Fingerprint {
    title: String,
    artist: String,
    album: String,
    track_number: Option<i64>,
    duration_ms: i64,
}

const IDENTITIES: &str = "
    SELECT f.id, t.id, f.byte_length, f.content_hash, m.title, m.artist, m.album, m.track_number,
           m.duration_ms
    FROM library_files f
    JOIN tracks t ON t.file_id = f.id
    JOIN track_source_metadata m ON m.track_id = t.id
    WHERE";

fn identities(connection: &Connection, condition: &str) -> rusqlite::Result<Vec<Identity>> {
    let tag = |value: Option<String>| {
        value
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    };
    connection
        .prepare(&format!("{IDENTITIES} {condition} ORDER BY f.id"))?
        .query_map([], |row| {
            let fingerprint = match (
                tag(row.get(4)?),
                tag(row.get(5)?),
                tag(row.get(6)?),
                row.get::<_, Option<i64>>(8)?,
            ) {
                (Some(title), Some(artist), Some(album), Some(duration_ms)) => Some(Fingerprint {
                    title,
                    artist,
                    album,
                    track_number: row.get(7)?,
                    duration_ms,
                }),
                _ => None,
            };
            Ok(Identity {
                file_id: row.get(0)?,
                track_id: row.get(1)?,
                byte_length: row.get(2)?,
                content_hash: row.get(3)?,
                fingerprint,
            })
        })?
        .collect()
}

/// Pairs each arrived file (index) with the Missing track (index) it is: first by size and head
/// and tail hash, preferring the one with the same tags when several copies match; then, for what
/// is left, by tags alone when exactly one Missing track carries them.
pub(super) fn pair_moves(arrived: &[Identity], missing: &[Identity]) -> Vec<(usize, usize)> {
    let mut claimed = vec![false; missing.len()];
    let mut pairs = Vec::new();
    let mut unmatched = Vec::new();
    for (index, file) in arrived.iter().enumerate() {
        let by_content = |candidate: &Identity| {
            file.content_hash.is_some()
                && candidate.byte_length == file.byte_length
                && candidate.content_hash == file.content_hash
        };
        let candidates: Vec<usize> = (0..missing.len())
            .filter(|&at| !claimed[at] && by_content(&missing[at]))
            .collect();
        let chosen = candidates
            .iter()
            .copied()
            .find(|&at| file.fingerprint.is_some() && missing[at].fingerprint == file.fingerprint)
            .or_else(|| candidates.first().copied());
        match chosen {
            Some(at) => {
                claimed[at] = true;
                pairs.push((index, at));
            }
            None => unmatched.push(index),
        }
    }
    for index in unmatched {
        let Some(fingerprint) = &arrived[index].fingerprint else {
            continue;
        };
        let mut same = (0..missing.len())
            .filter(|&at| !claimed[at] && missing[at].fingerprint.as_ref() == Some(fingerprint));
        if let (Some(only), None) = (same.next(), same.next()) {
            claimed[only] = true;
            pairs.push((index, only));
        }
    }
    pairs
}

/// Relinks what arrived since the last complete scan, then forgets that it arrived. Returns how
/// many Missing tracks were found again. One transaction: a failure relinks nothing.
pub(super) fn relink_moved(connection: &mut Connection) -> rusqlite::Result<usize> {
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let arrived = identities(
        &transaction,
        "f.relink_pending = 1 AND f.availability = 'available'",
    )?;
    let missing = if arrived.is_empty() {
        Vec::new()
    } else {
        identities(&transaction, "f.availability = 'missing'")?
    };
    let pairs = pair_moves(&arrived, &missing);
    for &(new, old) in &pairs {
        let (new, old) = (&arrived[new], &missing[old]);
        // The old track takes over the new file and its freshly read tags; the new track, which
        // nothing refers to yet, and the old file row go.
        transaction.execute(
            "DELETE FROM track_source_metadata WHERE track_id = ?1",
            params![old.track_id],
        )?;
        transaction.execute(
            "UPDATE track_source_metadata SET track_id = ?1 WHERE track_id = ?2",
            params![old.track_id, new.track_id],
        )?;
        transaction.execute("DELETE FROM tracks WHERE id = ?1", params![new.track_id])?;
        transaction.execute(
            "UPDATE tracks SET file_id = ?1 WHERE id = ?2",
            params![new.file_id, old.track_id],
        )?;
        transaction.execute(
            "DELETE FROM library_files WHERE id = ?1",
            params![old.file_id],
        )?;
    }
    transaction.execute(
        "UPDATE library_files SET relink_pending = 0 WHERE relink_pending = 1",
        [],
    )?;
    if !pairs.is_empty() {
        crate::library::summary::rebuild(&transaction)?;
    }
    transaction.commit()?;
    Ok(pairs.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(
        file_id: i64,
        length: i64,
        hash: Option<&str>,
        tags: Option<(&str, i64)>,
    ) -> Identity {
        Identity {
            file_id,
            track_id: file_id,
            byte_length: length,
            content_hash: hash.map(str::to_owned),
            fingerprint: tags.map(|(title, duration_ms)| Fingerprint {
                title: title.into(),
                artist: "A".into(),
                album: "B".into(),
                track_number: Some(1),
                duration_ms,
            }),
        }
    }

    #[test]
    fn size_and_hash_pair_a_move_and_copies_prefer_the_same_tags() {
        let missing = [
            identity(1, 10, Some("h"), Some(("one", 1))),
            identity(2, 10, Some("h"), Some(("two", 1))),
            identity(3, 10, Some("other"), None),
        ];
        let arrived = [identity(9, 10, Some("h"), Some(("two", 1)))];
        assert_eq!(pair_moves(&arrived, &missing), vec![(0, 1)]);

        let resized = [identity(9, 11, Some("h"), None)];
        assert!(pair_moves(&resized, &missing).is_empty(), "size differs");
    }

    #[test]
    fn a_retagged_copy_is_found_by_its_tags_only_when_they_are_unambiguous() {
        let one = [identity(1, 10, Some("old"), Some(("song", 5)))];
        let arrived = [identity(9, 12, Some("new"), Some(("song", 5)))];
        assert_eq!(pair_moves(&arrived, &one), vec![(0, 0)]);

        let two = [
            identity(1, 10, Some("old"), Some(("song", 5))),
            identity(2, 10, Some("old2"), Some(("song", 5))),
        ];
        assert!(pair_moves(&arrived, &two).is_empty());
        let different = [identity(9, 12, Some("new"), Some(("song", 6)))];
        assert!(pair_moves(&different, &one).is_empty());
    }

    #[test]
    fn a_missing_track_is_claimed_once() {
        let missing = [identity(1, 10, Some("h"), None)];
        let arrived = [
            identity(8, 10, Some("h"), None),
            identity(9, 10, Some("h"), None),
        ];
        assert_eq!(pair_moves(&arrived, &missing), vec![(0, 0)]);
    }
}
