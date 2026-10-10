use crate::events::null_event_sink;
use crate::library::database::Database;
use crate::library::models::LibraryUnavailableReason;
use crate::library::{migrations, Library};
use crate::test_support::TestDirectory;

#[test]
fn a_library_that_cannot_be_opened_says_why() {
    let corrupt = TestDirectory::new();
    std::fs::write(
        corrupt.file("library.sqlite3"),
        b"this is not a database at all, just text that is long enough to look like a file",
    )
    .unwrap();
    let too_new = TestDirectory::new();
    let database = Database::initialize(&too_new.file("")).expect("database");
    database
        .write()
        .unwrap()
        .pragma_update(None, "user_version", migrations::CURRENT_SCHEMA_VERSION + 1)
        .unwrap();

    let reason = |directory: &TestDirectory| {
        Library::open(directory.file(""), null_event_sink())
            .err()
            .expect("an unavailable Library")
    };

    assert!(matches!(
        reason(&corrupt),
        LibraryUnavailableReason::DatabaseCorrupt
    ));
    assert!(matches!(
        reason(&too_new),
        LibraryUnavailableReason::SchemaTooNew
    ));
}
