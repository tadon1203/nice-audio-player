//! The Library's tests at its seams: opening and resetting the database file, the directory commands,
//! and where a track's file is. The scan, sync, and ID tests are in their own files.

mod ids;
mod scan;
mod sync;

use crate::errors::CommandError;
use crate::library::database::{self, Database};
use crate::library::directories;
use crate::library::{Library, LibraryUnavailableReason, TrackLocation, Unavailable};
use crate::test_support::{TestDirectory, null_messages};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const DATABASE_FILE: &str = "library.sqlite3";

fn open(directory: &Path) -> Result<Library, LibraryUnavailableReason> {
    Library::open(directory, null_messages())
}

fn user_version(path: &Path) -> i32 {
    Connection::open(path)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
}

/// A directory that exists below `directory`.
fn subdirectory(directory: &TestDirectory, name: &str) -> PathBuf {
    let path = directory.file(name);
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[test]
fn an_empty_file_is_given_the_schema() {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(data.join(DATABASE_FILE), []).unwrap();

    let library = open(&data).expect("an empty file opens");

    assert_eq!(library.directories().unwrap(), []);
    assert_eq!(user_version(&data.join(DATABASE_FILE)), 2);
}

#[test]
fn a_database_of_another_version_is_replaced_by_an_empty_one() {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    let library = open(&data).unwrap();
    library
        .add_directory(subdirectory(&directory, "music"))
        .unwrap();
    library.shutdown();
    Connection::open(data.join(DATABASE_FILE))
        .unwrap()
        .pragma_update(None, "user_version", 0)
        .unwrap();

    let library = open(&data).expect("reopens");

    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_database_missing_a_table_is_replaced_by_an_empty_one() {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    let library = open(&data).unwrap();
    library
        .add_directory(subdirectory(&directory, "music"))
        .unwrap();
    library.shutdown();
    Connection::open(data.join(DATABASE_FILE))
        .unwrap()
        .execute_batch("DROP TABLE artists")
        .unwrap();

    let library = open(&data).expect("reopens");

    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_file_that_is_not_a_database_is_replaced_by_an_empty_one() {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(
        data.join(DATABASE_FILE),
        b"this is not a database at all, just text that is long enough to look like a file",
    )
    .unwrap();

    let library = open(&data).expect("opens");

    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_reset_deletes_the_database_and_the_artwork_and_leaves_an_empty_database() {
    let directory = TestDirectory::new();
    let data = directory.file("data");
    let library = open(&data).unwrap();
    library
        .add_directory(subdirectory(&directory, "music"))
        .unwrap();
    library.shutdown();
    std::fs::create_dir_all(data.join("artwork")).unwrap();
    std::fs::write(data.join("artwork").join("cover.jpg"), b"cover").unwrap();

    database::reset(&data).expect("reset");

    assert!(!data.join("artwork").exists());
    let library = open(&data).expect("opens after the reset");
    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_data_directory_that_cannot_be_created_makes_the_library_unavailable() {
    let directory = TestDirectory::new();
    let blocker = directory.file("blocker");
    std::fs::write(&blocker, b"a file, not a directory").unwrap();

    assert!(matches!(
        open(&blocker.join("data")),
        Err(LibraryUnavailableReason::DatabaseOpenFailed)
    ));
}

#[test]
fn an_added_directory_is_listed_and_enabled() {
    let directory = TestDirectory::new();
    let library = open(&directory.file("data")).unwrap();

    library
        .add_directory(subdirectory(&directory, "music"))
        .expect("added");

    let listed = library.directories().unwrap();
    assert_eq!(listed.len(), 1);
    assert!(listed[0].path.ends_with("music"));
    assert!(listed[0].enabled);
}

#[cfg(windows)]
#[test]
fn a_path_that_is_not_unicode_is_refused_not_changed() {
    use std::os::windows::ffi::OsStringExt;
    let directory = TestDirectory::new();
    let library = open(&directory.file("data")).unwrap();
    // An unpaired surrogate: a valid Windows path that cannot be stored as UTF-8.
    let path = PathBuf::from(std::ffi::OsString::from_wide(&[0xD800]));

    assert!(matches!(
        library.add_directory(path),
        Err(CommandError::InvalidDirectory)
    ));
    assert_eq!(library.directories().unwrap(), []);
}

/// The database the directory commands write to, opened without the sync worker: the worker refuses
/// directory changes while a scan runs.
fn open_database(directory: &TestDirectory) -> Database {
    Database::initialize(&directory.file("data")).expect("database")
}

#[test]
fn a_directory_already_registered_is_a_duplicate() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let music = subdirectory(&directory, "music");
    directories::add(&database, &music.to_string_lossy()).unwrap();

    assert!(matches!(
        directories::add(&database, &music.to_string_lossy()),
        Err(CommandError::DuplicateDirectory)
    ));
}

#[test]
fn a_directory_inside_or_around_a_registered_directory_overlaps_it() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let music = subdirectory(&directory, "music");
    let album = subdirectory(&directory, "music/album");
    directories::add(&database, &album.to_string_lossy()).unwrap();

    assert!(matches!(
        directories::add(&database, &music.to_string_lossy()),
        Err(CommandError::OverlappingDirectory)
    ));
}

#[test]
fn a_directory_holding_the_data_directory_is_refused() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);

    assert!(matches!(
        directories::add(&database, &directory.file("").to_string_lossy()),
        Err(CommandError::DirectoryContainsDataDirectory)
    ));
}

#[test]
fn a_path_that_is_not_a_directory_is_refused() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let file = directory.file("notes.txt");
    std::fs::write(&file, b"notes").unwrap();

    assert!(matches!(
        directories::add(&database, &file.to_string_lossy()),
        Err(CommandError::DirectoryNotDirectory)
    ));
    assert!(matches!(
        directories::add(&database, &directory.file("gone").to_string_lossy()),
        Err(CommandError::InvalidDirectory)
    ));
}

#[test]
fn a_directory_can_be_disabled_and_removed_and_a_missing_one_is_reported() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let id = directories::add(
        &database,
        &subdirectory(&directory, "music").to_string_lossy(),
    )
    .unwrap()
    .id;

    directories::set_enabled(&database, id, false).unwrap();
    assert!(!directories::list(&database.read().unwrap()).unwrap()[0].enabled);

    directories::remove(&database, id).unwrap();
    assert_eq!(directories::list(&database.read().unwrap()).unwrap(), []);
    assert!(matches!(
        directories::remove(&database, id),
        Err(CommandError::DirectoryMissing)
    ));
}

fn location(directory: &TestDirectory, relative: &str) -> TrackLocation {
    TrackLocation::new(directory.file("music").to_str().unwrap(), relative, true)
}

#[test]
fn a_file_inside_its_directory_exists() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music/Artist")).unwrap();
    std::fs::write(directory.file("music/Artist/a.wav"), []).unwrap();

    let existing = location(&directory, "Artist/a.wav").existing().unwrap();

    assert!(existing.path.starts_with(&existing.directory));
    assert!(existing.path.ends_with("a.wav"));
}

#[test]
fn a_path_that_leaves_its_directory_is_unavailable() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music")).unwrap();
    std::fs::write(directory.file("outside.wav"), []).unwrap();

    for relative in ["../outside.wav", "/outside.wav", "", "."] {
        let location = location(&directory, relative);
        assert_eq!(location.path(), Err(Unavailable), "{relative:?}");
        assert_eq!(location.existing(), Err(Unavailable), "{relative:?}");
    }
}

#[test]
fn a_missing_file_is_unavailable_but_has_a_path_to_show() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music")).unwrap();

    let gone = location(&directory, "gone.wav");

    assert!(gone.path().is_ok());
    assert_eq!(gone.existing(), Err(Unavailable));
}

#[test]
fn a_file_marked_missing_is_unavailable_even_when_it_is_there() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music")).unwrap();
    std::fs::write(directory.file("music/a.wav"), []).unwrap();

    let location = TrackLocation::new(directory.file("music").to_str().unwrap(), "a.wav", false);

    assert_eq!(location.existing(), Err(Unavailable));
}
