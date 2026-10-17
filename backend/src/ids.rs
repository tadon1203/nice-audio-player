//! Identifiers that are validated where they enter the Backend, so no later code checks them again.

use crate::library::text;
use rusqlite::Row;
use rusqlite::functions::{Context, FunctionFlags};
use rusqlite::types::{Type, ValueRef};
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fmt;
use std::str::FromStr;

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

/// A track: the `tracks` rowid. Above zero. On the IPC a decimal string.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
)]
#[serde(try_from = "String", into = "String")]
#[specta(type = String)]
pub struct TrackId(i64);

impl TrackId {
    /// The ID of a rowid, or `None` for a rowid that is not above zero.
    pub fn try_from_rowid(rowid: i64) -> Option<Self> {
        (rowid > 0).then_some(Self(rowid))
    }

    pub fn rowid(self) -> i64 {
        self.0
    }
}

/// One entry of the playback queue: the queue's counter, above zero. On the IPC `queue-item-{n}`.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
)]
#[serde(try_from = "String", into = "String")]
#[specta(type = String)]
pub struct QueueItemId(u64);

impl QueueItemId {
    /// The first ID of a queue's counter.
    pub(crate) fn first() -> Self {
        Self(1)
    }

    /// The ID after this one.
    pub(crate) fn next(self) -> Self {
        Self(self.0.saturating_add(1))
    }
}

impl FromStr for QueueItemId {
    type Err = &'static str;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value
            .strip_prefix("queue-item-")
            .and_then(parse_positive_decimal)
            .map(Self)
            .ok_or("a queue item ID is `queue-item-` and a positive decimal integer")
    }
}

impl fmt::Display for QueueItemId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "queue-item-{}", self.0)
    }
}

impl TryFrom<String> for QueueItemId {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<QueueItemId> for String {
    fn from(id: QueueItemId) -> Self {
        id.to_string()
    }
}

/// One playback session: a queue item being played, from the playback worker's counter, above
/// zero. On the IPC a decimal string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(try_from = "String", into = "String")]
#[specta(type = String)]
pub struct PlaybackId(u64);

impl PlaybackId {
    /// The first ID of the worker's counter.
    pub(crate) fn first() -> Self {
        Self(1)
    }

    /// The ID after this one.
    pub(crate) fn next(self) -> Self {
        Self(self.0.saturating_add(1))
    }
}

impl FromStr for PlaybackId {
    type Err = &'static str;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_positive_decimal(value)
            .map(Self)
            .ok_or("a playback ID is a positive decimal integer")
    }
}

impl fmt::Display for PlaybackId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl TryFrom<String> for PlaybackId {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<PlaybackId> for String {
    fn from(id: PlaybackId) -> Self {
        id.to_string()
    }
}

/// A library root: the `library_roots` rowid. Above zero. On the IPC a decimal string.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, specta::Type,
)]
#[serde(try_from = "String", into = "String")]
#[specta(type = String)]
pub struct RootId(i64);

impl RootId {
    /// The ID of a rowid, or `None` for a rowid that is not above zero.
    pub fn try_from_rowid(rowid: i64) -> Option<Self> {
        (rowid > 0).then_some(Self(rowid))
    }

    pub fn rowid(self) -> i64 {
        self.0
    }
}

impl FromStr for RootId {
    type Err = &'static str;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_positive_decimal(value)
            .and_then(Self::try_from_rowid)
            .ok_or("a root ID is a positive decimal integer")
    }
}

impl fmt::Display for RootId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl TryFrom<String> for RootId {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<RootId> for String {
    fn from(id: RootId) -> Self {
        id.to_string()
    }
}

/// Decimal digits with no leading zero, above zero, as the renderer writes an ID.
fn parse_positive_decimal<T: FromStr + Default + PartialOrd>(value: &str) -> Option<T> {
    if value.is_empty() || value.starts_with('0') || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    value.parse().ok().filter(|number| *number > T::default())
}

impl FromStr for TrackId {
    type Err = &'static str;

    /// Positive decimal digits with no leading zero, as the renderer writes them.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_positive_decimal(value)
            .and_then(Self::try_from_rowid)
            .ok_or("a track ID is a positive decimal integer")
    }
}

impl fmt::Display for TrackId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

impl TryFrom<String> for TrackId {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<TrackId> for String {
    fn from(id: TrackId) -> Self {
        id.to_string()
    }
}

/// An album: blake3 of its normalized Album Artist, normalized title, and absolute album
/// directory. A track with no album hashes an empty directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct AlbumId([u8; 16]);

/// An Album Artist: blake3 of the normalized name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ArtistId([u8; 16]);

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

    /// 32 lowercase hex characters.
    pub fn to_hex(self) -> String {
        hex_of(&self.0)
    }
}

impl ArtistId {
    pub fn of(name: &str) -> Self {
        Self(digest(&[name.as_bytes()]))
    }

    /// 32 lowercase hex characters.
    pub fn to_hex(self) -> String {
        hex_of(&self.0)
    }
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
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Registers the functions that compute IDs and search text in SQL, on a connection, so a
/// migration and a query give the same values as Rust: `album_id(album_artist, title, directory)`,
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

/// A `library_roots` rowid read from a column. See [`track_id_column`].
pub(crate) fn root_id_column(row: &Row<'_>, index: usize) -> rusqlite::Result<RootId> {
    let rowid: i64 = row.get(index)?;
    RootId::try_from_rowid(rowid).ok_or(rusqlite::Error::IntegralValueOutOfRange(index, rowid))
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
    fn a_queue_item_id_and_a_playback_id_round_trip_through_their_string_form() {
        let item = QueueItemId::first().next();
        assert_eq!(item.to_string(), "queue-item-2");
        assert_eq!("queue-item-2".parse::<QueueItemId>(), Ok(item));
        assert_eq!(
            serde_json::to_value(item).unwrap(),
            serde_json::json!("queue-item-2")
        );

        let playback = PlaybackId::first().next();
        assert_eq!(playback.to_string(), "2");
        assert_eq!("2".parse::<PlaybackId>(), Ok(playback));
        assert_eq!(
            serde_json::from_value::<PlaybackId>(serde_json::json!("2")).unwrap(),
            playback
        );
    }

    #[test]
    fn a_malformed_queue_item_id_or_playback_id_is_rejected() {
        for bad in [
            "queue-item-",
            "queue-item-0",
            "queue-item-01",
            "queue-item--1",
            "12",
            "queue-item-x",
        ] {
            assert!(bad.parse::<QueueItemId>().is_err(), "{bad}");
        }
        for bad in ["", "0", "-1", "07", "1a", "queue-item-1"] {
            assert!(bad.parse::<PlaybackId>().is_err(), "{bad}");
        }
    }

    #[test]
    fn a_command_argument_with_a_bad_track_id_is_rejected_at_deserialization() {
        for bad in ["0", "-3", "abc", ""] {
            let value = serde_json::json!(bad);
            assert!(serde_json::from_value::<TrackId>(value).is_err(), "{bad}");
        }

        let parsed: TrackId = serde_json::from_value(serde_json::json!("7")).unwrap();
        assert_eq!(parsed.rowid(), 7);
        assert_eq!(
            serde_json::to_value(parsed).unwrap(),
            serde_json::json!("7")
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
