//! Identifiers that are validated where they enter the Backend, so no later code checks them again.

use crate::library::text;
use rusqlite::Row;
use rusqlite::functions::{Context, FunctionFlags};
use rusqlite::types::{Type, ValueRef};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;

/// An ID that is a rowid: above zero. On the IPC a number, which serde rejects below one.
macro_rules! rowid_id {
    ($(#[$meta:meta])* $name:ident, $error:literal) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
        )]
        #[serde(try_from = "i64", into = "i64")]
        pub struct $name(i64);

        impl $name {
            /// The ID of a rowid, or `None` for a rowid that is not above zero.
            pub fn try_from_rowid(rowid: i64) -> Option<Self> {
                (rowid > 0).then_some(Self(rowid))
            }

            pub fn rowid(self) -> i64 {
                self.0
            }
        }

        impl TryFrom<i64> for $name {
            type Error = &'static str;

            fn try_from(rowid: i64) -> Result<Self, Self::Error> {
                Self::try_from_rowid(rowid).ok_or($error)
            }
        }

        impl From<$name> for i64 {
            fn from(id: $name) -> Self {
                id.0
            }
        }
    };
}

/// An ID that is a 16-byte hash: on the IPC 32 lowercase hex characters.
macro_rules! hex_id {
    ($(#[$meta:meta])* $name:ident, $error:literal) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
        )]
        #[serde(try_from = "String", into = "String")]
        #[specta(type = String)]
        pub struct $name([u8; 16]);

        impl $name {
            /// 32 lowercase hex characters.
            pub fn to_hex(self) -> String {
                hex_of(&self.0)
            }

            /// The ID of its 32 lowercase hex characters, or `None` for any other text.
            pub fn from_hex(value: &str) -> Option<Self> {
                parse_hex(value).map(Self)
            }
        }

        impl TryFrom<String> for $name {
            type Error = &'static str;

            fn try_from(value: String) -> Result<Self, Self::Error> {
                Self::from_hex(&value).ok_or($error)
            }
        }

        impl From<$name> for String {
            fn from(id: $name) -> Self {
                id.to_hex()
            }
        }
    };
}

/// An ID that a counter hands out: the counter's `u64`, from one. The caller adds serde derives
/// when the ID crosses the IPC.
macro_rules! counter_id {
    ($(#[$meta:meta])* $vis:vis $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        $vis struct $name(u64);

        impl $name {
            /// The first ID of a counter.
            pub(crate) fn first() -> Self {
                Self(1)
            }

            /// The ID after this one.
            pub(crate) fn next(self) -> Self {
                Self(self.0 + 1)
            }
        }
    };
}

/// Stored artwork: the 64-character blake3 hex of the image file.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(try_from = "String", into = "String")]
#[specta(transparent)]
pub struct ArtworkHash(String);

impl ArtworkHash {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for ArtworkHash {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        if is_artwork_hash(&value) {
            Ok(Self(value))
        } else {
            Err("an artwork hash is 64 lowercase hex digits")
        }
    }
}

impl From<ArtworkHash> for String {
    fn from(hash: ArtworkHash) -> Self {
        hash.0
    }
}

/// A content hash is 64 lowercase hex digits. One spelling per file, so one cache entry per file.
pub fn is_artwork_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

rowid_id! {
    /// A track: the `tracks` rowid. Above zero. On the IPC a number.
    TrackId, "a track ID is a positive integer"
}

rowid_id! {
    /// A library directory: the `directories` rowid. Above zero. On the IPC a number.
    DirectoryId, "a directory ID is a positive integer"
}

counter_id! {
    /// One entry of the playback queue: the queue's counter. On the IPC a number.
    #[derive(Serialize, Deserialize, specta::Type)]
    #[serde(transparent)]
    pub QueueItemId
}

counter_id! {
    /// One playback session: a queue item being played, from the playback worker's counter. On
    /// the IPC a number.
    #[derive(Serialize, Deserialize, specta::Type)]
    #[serde(transparent)]
    pub PlaybackId
}

hex_id! {
    /// An album: blake3 of its normalized Album Artist, normalized title, and absolute album
    /// directory. A track with no album hashes an empty directory.
    AlbumId, "an album ID is 32 lowercase hex digits"
}

hex_id! {
    /// An Album Artist: blake3 of the normalized name.
    ArtistId, "an artist ID is 32 lowercase hex digits"
}

impl AlbumId {
    pub fn of(album_artist: &str, title: &str, directory: &OsStr) -> Self {
        Self::of_bytes(album_artist, title, directory.as_encoded_bytes())
    }

    /// The SQL function `album_id` takes the directory as the bytes SQLite holds, so it comes in
    /// here as bytes. The same bytes give the same ID as [`AlbumId::of`].
    fn of_bytes(album_artist: &str, title: &str, directory: &[u8]) -> Self {
        Self(digest(&[
            album_artist.as_bytes(),
            title.as_bytes(),
            directory,
        ]))
    }
}

impl ArtistId {
    pub fn of(name: &str) -> Self {
        Self(digest(&[name.as_bytes()]))
    }
}

/// The 16 bytes of 32 lowercase hex characters, or `None` for any other text.
fn parse_hex(value: &str) -> Option<[u8; 16]> {
    let bytes = value.as_bytes();
    if bytes.len() != 32 {
        return None;
    }
    let mut id = [0; 16];
    let (pairs, _) = bytes.as_chunks::<2>();
    for (byte, &[high, low]) in id.iter_mut().zip(pairs) {
        *byte = (hex_digit(high)? << 4) | hex_digit(low)?;
    }
    Some(id)
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

/// An `albums.id` read from a column. See [`track_id_column`].
pub(crate) fn album_id_column(row: &Row<'_>, index: usize) -> rusqlite::Result<AlbumId> {
    let hex: String = row.get(index)?;
    AlbumId::from_hex(&hex).ok_or(rusqlite::Error::InvalidColumnType(index, hex, Type::Text))
}

/// An `albums.artist_id` read from a column. See [`track_id_column`].
pub(crate) fn artist_id_column(row: &Row<'_>, index: usize) -> rusqlite::Result<ArtistId> {
    let hex: String = row.get(index)?;
    ArtistId::from_hex(&hex).ok_or(rusqlite::Error::InvalidColumnType(index, hex, Type::Text))
}

/// blake3 of the parts, each prefixed by its byte length, so no two different lists of parts
/// hash the same input. The first 16 bytes are the ID.
fn digest(parts: &[&[u8]]) -> [u8; 16] {
    let mut hasher = blake3::Hasher::new();
    for part in parts {
        hasher.update(&(part.len() as u64).to_le_bytes());
        hasher.update(part);
    }
    let mut id = [0; 16];
    id.copy_from_slice(&hasher.finalize().as_bytes()[..16]);
    id
}

fn hex_of(bytes: &[u8; 16]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .concat()
}

/// Registers the functions that compute IDs and search text in SQL, on a connection, so a query
/// gives the same values as Rust: `album_id(album_artist, title, directory)`,
/// `artist_id(name)`, and `search_key(name, ...)` (the folded search text of the names).
pub(crate) fn register_sql_functions(connection: &rusqlite::Connection) -> rusqlite::Result<()> {
    let flags = FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC;
    connection.create_scalar_function("album_id", 3, flags, |context| {
        let album_artist: String = context.get(0)?;
        let title: String = context.get(1)?;
        let directory = bytes_argument(context, 2)?;
        Ok(AlbumId::of_bytes(&album_artist, &title, &directory).to_hex())
    })?;
    connection.create_scalar_function("artist_id", 1, flags, |context| {
        let name: String = context.get(0)?;
        Ok(ArtistId::of(&name).to_hex())
    })?;
    connection.create_scalar_function("search_key", -1, flags, |context| {
        let names = (0..context.len())
            .map(|index| context.get::<String>(index))
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let names: Vec<&str> = names.iter().map(String::as_str).collect();
        Ok(text::search_key(&names))
    })
}

/// A `tracks` rowid read from a column. SQLite gives every rowid above zero, so a value that is
/// not is a corrupt database.
pub(crate) fn track_id_column(row: &Row<'_>, index: usize) -> rusqlite::Result<TrackId> {
    let rowid: i64 = row.get(index)?;
    TrackId::try_from_rowid(rowid).ok_or(rusqlite::Error::IntegralValueOutOfRange(index, rowid))
}

/// A `directories` rowid read from a column. See [`track_id_column`].
pub(crate) fn directory_id_column(row: &Row<'_>, index: usize) -> rusqlite::Result<DirectoryId> {
    let rowid: i64 = row.get(index)?;
    DirectoryId::try_from_rowid(rowid).ok_or(rusqlite::Error::IntegralValueOutOfRange(index, rowid))
}

/// A text or blob argument as its bytes.
fn bytes_argument(context: &Context<'_>, index: usize) -> rusqlite::Result<Vec<u8>> {
    match context.get_raw(index) {
        ValueRef::Text(bytes) | ValueRef::Blob(bytes) => Ok(bytes.to_vec()),
        _ => Err(rusqlite::Error::InvalidFunctionParameterType(
            index,
            Type::Null,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_artwork_hash_is_accepted_only_as_64_lowercase_hex_digits() {
        let hash = "ab".repeat(32);
        assert_eq!(ArtworkHash::try_from(hash.clone()).unwrap().as_str(), hash);

        for bad in [
            "ab".repeat(31),
            "ab".repeat(33),
            "AB".repeat(32),
            format!("{}g", "a".repeat(63)),
            String::new(),
        ] {
            assert!(ArtworkHash::try_from(bad.clone()).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_command_argument_with_a_bad_hash_is_rejected_at_deserialization() {
        let bad = serde_json::json!("not-a-hash");
        assert!(serde_json::from_value::<ArtworkHash>(bad).is_err());

        let good = "cd".repeat(32);
        let parsed: ArtworkHash = serde_json::from_value(serde_json::json!(good)).unwrap();
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            serde_json::json!(good)
        );
    }

    #[test]
    fn a_queue_item_id_and_a_playback_id_are_numbers_on_the_ipc() {
        let item = QueueItemId::first().next();
        assert_eq!(serde_json::to_value(item).unwrap(), serde_json::json!(2));
        assert_eq!(
            serde_json::from_value::<QueueItemId>(serde_json::json!(2)).unwrap(),
            item
        );

        let playback = PlaybackId::first().next();
        assert_eq!(
            serde_json::to_value(playback).unwrap(),
            serde_json::json!(2)
        );
        assert_eq!(
            serde_json::from_value::<PlaybackId>(serde_json::json!(2)).unwrap(),
            playback
        );
    }

    #[test]
    fn a_hex_id_round_trips_through_its_32_hex_digits() {
        let album = AlbumId::of("Band", "Album", OsStr::new("dir"));
        assert_eq!(AlbumId::from_hex(&album.to_hex()), Some(album));

        let artist = ArtistId::of("Band");
        assert_eq!(ArtistId::from_hex(&artist.to_hex()), Some(artist));
    }

    #[test]
    fn a_short_hex_id_is_rejected_without_panic() {
        assert_eq!(AlbumId::from_hex(&"ab".repeat(15)), None);
        assert_eq!(ArtistId::from_hex(&"ab".repeat(15)), None);
    }

    #[test]
    fn a_string_queue_item_id_or_playback_id_is_rejected_at_deserialization() {
        for bad in ["queue-item-2", "2", ""] {
            let value = serde_json::json!(bad);
            assert!(
                serde_json::from_value::<QueueItemId>(value.clone()).is_err(),
                "{bad}"
            );
            assert!(
                serde_json::from_value::<PlaybackId>(value).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_command_argument_with_a_bad_track_id_is_rejected_at_deserialization() {
        for bad in [
            serde_json::json!(0),
            serde_json::json!(-3),
            serde_json::json!("7"),
        ] {
            assert!(
                serde_json::from_value::<TrackId>(bad.clone()).is_err(),
                "{bad}"
            );
        }

        let parsed: TrackId = serde_json::from_value(serde_json::json!(7)).unwrap();
        assert_eq!(parsed.rowid(), 7);
        assert_eq!(serde_json::to_value(parsed).unwrap(), serde_json::json!(7));
    }

    #[test]
    fn a_directory_id_is_a_number_on_the_ipc_and_zero_or_negative_is_rejected() {
        for bad in [serde_json::json!(0), serde_json::json!(-3)] {
            assert!(serde_json::from_value::<DirectoryId>(bad).is_err());
        }

        let parsed: DirectoryId = serde_json::from_value(serde_json::json!(7)).unwrap();
        assert_eq!(parsed.rowid(), 7);
        assert_eq!(serde_json::to_value(parsed).unwrap(), serde_json::json!(7));
    }

    #[test]
    fn a_command_argument_with_a_bad_artist_id_is_rejected_at_deserialization() {
        for bad in [
            "ab".repeat(15),
            "ab".repeat(17),
            "AB".repeat(16),
            format!("{}g", "a".repeat(31)),
            String::new(),
        ] {
            assert!(
                serde_json::from_value::<ArtistId>(serde_json::json!(bad)).is_err(),
                "{bad}"
            );
        }

        let good = ArtistId::of("Band");
        let parsed: ArtistId = serde_json::from_value(serde_json::json!(good.to_hex())).unwrap();
        assert_eq!(parsed, good);
        assert_eq!(
            serde_json::to_value(parsed).unwrap(),
            serde_json::json!(good.to_hex())
        );
    }

    #[test]
    fn a_command_argument_with_a_bad_album_id_is_rejected_at_deserialization() {
        for bad in [
            "ab".repeat(15),
            "ab".repeat(17),
            "AB".repeat(16),
            format!("{}g", "a".repeat(31)),
            String::new(),
        ] {
            assert!(
                serde_json::from_value::<AlbumId>(serde_json::json!(bad)).is_err(),
                "{bad}"
            );
        }

        let good = AlbumId::of("Band", "Album", OsStr::new("dir"));
        let parsed: AlbumId = serde_json::from_value(serde_json::json!(good.to_hex())).unwrap();
        assert_eq!(parsed, good);
        assert_eq!(
            serde_json::to_value(parsed).unwrap(),
            serde_json::json!(good.to_hex())
        );
    }

    fn connection() -> rusqlite::Connection {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        register_sql_functions(&connection).unwrap();
        connection
    }

    fn sql_album_id(connection: &rusqlite::Connection, directory: &[u8]) -> String {
        connection
            .query_row(
                "SELECT album_id(?1, ?2, ?3)",
                rusqlite::params!["Band", "Album", directory],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn sql_ids_are_the_rust_ids() {
        let connection = connection();
        let directory = r"C:\Music\Band\Album";

        assert_eq!(
            sql_album_id(&connection, directory.as_bytes()),
            AlbumId::of("Band", "Album", OsStr::new(directory)).to_hex()
        );
        let artist: String = connection
            .query_row("SELECT artist_id('Band')", [], |row| row.get(0))
            .unwrap();
        assert_eq!(artist, ArtistId::of("Band").to_hex());
        let search: String = connection
            .query_row("SELECT search_key('ユズ', 'Band')", [], |row| row.get(0))
            .unwrap();
        assert_eq!(search, text::search_key(&["ユズ", "Band"]));
    }

    #[test]
    fn an_id_is_32_lowercase_hex_digits() {
        let hex = AlbumId::of("a", "b", OsStr::new("c")).to_hex();
        assert_eq!(hex.len(), 32);
        assert!(
            hex.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        );
    }

    #[test]
    fn the_length_prefix_keeps_different_parts_apart() {
        let connection = connection();
        let directory: &[u8] = b"dir";
        let joined = connection
            .query_row(
                "SELECT album_id('ab', 'c', ?1) = album_id('a', 'bc', ?1)",
                [directory],
                |row| row.get::<_, bool>(0),
            )
            .unwrap();
        assert!(!joined);
        assert_ne!(
            AlbumId::of("ab", "c", OsStr::new("dir")),
            AlbumId::of("a", "bc", OsStr::new("dir"))
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_path_that_is_not_valid_utf_16_hashes_the_same_in_sql_and_rust() {
        use std::os::windows::ffi::OsStringExt;
        let connection = connection();
        // An unpaired surrogate is no text, but its encoded bytes are stored and hashed as they are.
        let path = std::ffi::OsString::from_wide(&[0xD800, b'x' as u16]);
        assert_eq!(
            sql_album_id(&connection, path.as_encoded_bytes()),
            AlbumId::of("Band", "Album", &path).to_hex()
        );
    }
}
