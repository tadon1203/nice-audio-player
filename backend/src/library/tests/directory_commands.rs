use super::*;

fn open_database(directory: &TestDirectory) -> Database {
    Database::open(&directory.file("data")).expect("database")
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

#[test]
fn a_path_that_is_not_unicode_is_refused_not_changed() {
    use std::os::windows::ffi::OsStringExt;
    let directory = TestDirectory::new();
    let library = open(&directory.file("data")).unwrap();
    // An unpaired surrogate: a valid Windows path that cannot be stored as UTF-8.
    let path = PathBuf::from(std::ffi::OsString::from_wide(&[0xD800]));

    assert_eq!(
        library.add_directory(path).code_of(),
        Some(CommandError::InvalidDirectory)
    );
    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_directory_already_registered_is_a_duplicate() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let music = subdirectory(&directory, "music");
    directories::add_directory(&database, &music.to_string_lossy()).unwrap();

    assert_eq!(
        directories::add_directory(&database, &music.to_string_lossy()).code_of(),
        Some(CommandError::DuplicateDirectory)
    );
}

#[test]
fn a_directory_inside_or_around_a_registered_directory_overlaps_it() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let music = subdirectory(&directory, "music");
    let album = subdirectory(&directory, "music/album");
    directories::add_directory(&database, &album.to_string_lossy()).unwrap();

    assert_eq!(
        directories::add_directory(&database, &music.to_string_lossy()).code_of(),
        Some(CommandError::OverlappingDirectory)
    );
}

#[test]
fn a_directory_holding_the_data_directory_is_refused() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);

    assert_eq!(
        directories::add_directory(&database, &directory.file("").to_string_lossy()).code_of(),
        Some(CommandError::DirectoryContainsDataDirectory)
    );
}

#[test]
fn a_path_that_is_not_a_directory_is_refused() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let file = directory.file("notes.txt");
    std::fs::write(&file, b"notes").unwrap();

    assert_eq!(
        directories::add_directory(&database, &file.to_string_lossy()).code_of(),
        Some(CommandError::InvalidDirectory)
    );
    assert_eq!(
        directories::add_directory(&database, &directory.file("gone").to_string_lossy()).code_of(),
        Some(CommandError::InvalidDirectory)
    );
}

#[test]
fn a_directory_can_be_disabled_and_removed_and_a_missing_one_is_reported() {
    let directory = TestDirectory::new();
    let database = open_database(&directory);
    let id = directories::add_directory(
        &database,
        &subdirectory(&directory, "music").to_string_lossy(),
    )
    .unwrap()
    .id;

    directories::set_directory_enabled(&database, id, false).unwrap();
    assert!(!directories::list_directories(&database.read().unwrap()).unwrap()[0].enabled);

    directories::remove_directory(&database, id).unwrap();
    assert_eq!(
        directories::list_directories(&database.read().unwrap()).unwrap(),
        []
    );
    assert_eq!(directories::remove_directory(&database, id).code_of(), None);
}
