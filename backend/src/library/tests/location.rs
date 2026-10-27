use super::*;

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
        assert_eq!(
            location.path().code_of(),
            Some(CommandError::TrackUnavailable),
            "{relative:?}"
        );
        assert_eq!(
            location.existing().code_of(),
            Some(CommandError::TrackUnavailable),
            "{relative:?}"
        );
    }
}

#[test]
fn a_missing_file_is_unavailable_but_has_a_path_to_show() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music")).unwrap();

    let gone = location(&directory, "gone.wav");

    assert!(gone.path().is_ok());
    assert_eq!(
        gone.existing().code_of(),
        Some(CommandError::TrackUnavailable)
    );
}

#[test]
fn a_file_marked_missing_is_unavailable_even_when_it_is_there() {
    let directory = TestDirectory::new();
    std::fs::create_dir_all(directory.file("music")).unwrap();
    std::fs::write(directory.file("music/a.wav"), []).unwrap();

    let location = TrackLocation::new(directory.file("music").to_str().unwrap(), "a.wav", false);

    assert_eq!(
        location.existing().code_of(),
        Some(CommandError::TrackUnavailable)
    );
}
