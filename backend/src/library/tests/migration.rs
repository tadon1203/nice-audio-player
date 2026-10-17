//! A version 4 database migrated to version 5 (see `migrations.rs`): no rescan, the track IDs it
//! had, and the album and Album Artist IDs that Rust computes for the same albums.

use crate::ids::{AlbumId, ArtistId};
use crate::library::database::Database;
use crate::test_support::TestDirectory;
use std::ffi::OsStr;
use std::path::Path;

/// The version 4 fixture, opened as the library: it holds the tracks 1, 2, 4 and 6 (3 and 5 were
/// deleted before), an album of two tracks, a track with no album, and a missing file.
fn migrated() -> (TestDirectory, Database) {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src/library/tests/fixtures/library-v4.sqlite3"),
        data.join("library.sqlite3"),
    )
    .unwrap();
    let database = Database::initialize(&data).expect("the fixture migrates");
    (directory, database)
}

#[test]
fn track_ids_are_kept_and_no_rescan_is_asked_for() {
    let (_directory, database) = migrated();
    let connection = database.read().unwrap();

    let tracks: Vec<i64> = connection
        .prepare("SELECT id FROM tracks ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(tracks, [1, 2, 4, 6]);

    let modification: String = connection
        .query_row(
            "SELECT modification_key FROM library_files WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(modification, "1", "the migration does not ask for a rescan");
}

#[test]
fn a_deleted_track_id_is_never_used_again_after_the_migration() {
    let (_directory, database) = migrated();
    let connection = database.read().unwrap();

    let sequence: i64 = connection
        .query_row(
            "SELECT seq FROM sqlite_sequence WHERE name = 'tracks'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(sequence, 6, "the largest ID the table held");
}

#[test]
fn album_and_artist_ids_are_the_ones_rust_computes() {
    let (_directory, database) = migrated();
    let connection = database.read().unwrap();

    let albums: Vec<String> = connection
        .prepare("SELECT id FROM albums ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut expected = [
        AlbumId::of(
            "Singer",
            "Record",
            OsStr::new("C:/Fixture/Music/Artist/Album"),
        )
        .to_hex(),
        AlbumId::of("Other", "", OsStr::new("")).to_hex(),
    ];
    expected.sort();
    assert_eq!(albums, expected);

    let artists: Vec<String> = connection
        .prepare("SELECT id FROM artists ORDER BY id")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut expected = [
        ArtistId::of("Singer").to_hex(),
        ArtistId::of("Other").to_hex(),
    ];
    expected.sort();
    assert_eq!(artists, expected);
}

#[test]
fn the_migrated_database_has_no_foreign_key_violations() {
    let (_directory, database) = migrated();
    let connection = database.read().unwrap();

    let violations: i64 = connection
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(violations, 0);
}
