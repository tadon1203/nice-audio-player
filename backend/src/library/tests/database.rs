use super::*;

const DATABASE_FILE: &str = "library.sqlite3";

fn user_version(path: &Path) -> i32 {
    Connection::open(path)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap()
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

    storage::reset_database_files(&data).expect("reset");

    assert!(!data.join("artwork").exists());
    let library = open(&data).expect("opens after the reset");
    assert_eq!(library.directories().unwrap(), []);
}

#[test]
fn a_data_directory_that_cannot_be_created_makes_the_library_unavailable() {
    let directory = TestDirectory::new();
    let blocker = directory.file("blocker");
    std::fs::write(&blocker, b"a file, not a directory").unwrap();

    assert!(open(&blocker.join("data")).is_err());
}
