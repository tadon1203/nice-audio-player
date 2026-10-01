//! Where a track's file is: a root and a path below it. Every consumer (playback, properties,
//! Show in Explorer, lyrics) builds the file's path here, so none can skip the check that it stays
//! inside its root.

use super::error::{LibraryCommandError, StoreError};
use std::path::{Component, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Unavailable;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackLocation {
    root: PathBuf,
    relative: PathBuf,
    available: bool,
}

/// A track's file as it is on disk right now. Both paths are canonical.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingFile {
    pub root: PathBuf,
    pub path: PathBuf,
}

impl From<Unavailable> for StoreError {
    fn from(_: Unavailable) -> Self {
        Self::TrackUnavailable
    }
}

impl From<Unavailable> for LibraryCommandError {
    fn from(_: Unavailable) -> Self {
        Self::TrackUnavailable
    }
}

impl TrackLocation {
    pub(crate) fn new(root: &str, relative: &str, available: bool) -> Self {
        Self {
            root: PathBuf::from(root),
            relative: PathBuf::from(relative),
            available,
        }
    }

    pub fn available(&self) -> bool {
        self.available
    }

    /// The file's path, without touching the filesystem: the root joined with a relative path that
    /// only descends. Cheap enough to take for every track of a playback context.
    pub fn path(&self) -> Result<PathBuf, Unavailable> {
        let descends = self
            .relative
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
        if !descends || self.relative.as_os_str().is_empty() {
            return Err(Unavailable);
        }
        Ok(self.root.join(&self.relative))
    }

    /// The file itself: still marked available, still there, and (symbolic links resolved) still
    /// inside its root.
    pub fn existing(&self) -> Result<ExistingFile, Unavailable> {
        if !self.available {
            return Err(Unavailable);
        }
        let path = self.path()?;
        let root = dunce::canonicalize(&self.root).map_err(|_| Unavailable)?;
        let path = dunce::canonicalize(path).map_err(|_| Unavailable)?;
        if !path.starts_with(&root) || !path.is_file() {
            return Err(Unavailable);
        }
        Ok(ExistingFile { root, path })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestDirectory;

    fn location(directory: &TestDirectory, relative: &str) -> TrackLocation {
        TrackLocation::new(directory.file("music").to_str().unwrap(), relative, true)
    }

    #[test]
    fn a_file_inside_its_root_exists() {
        let directory = TestDirectory::new();
        std::fs::create_dir_all(directory.file("music/Artist")).unwrap();
        std::fs::write(directory.file("music/Artist/a.wav"), []).unwrap();

        let existing = location(&directory, "Artist/a.wav").existing().unwrap();

        assert!(existing.path.starts_with(&existing.root));
        assert!(existing.path.ends_with("a.wav"));
    }

    #[test]
    fn a_path_that_leaves_its_root_is_unavailable() {
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

        let location =
            TrackLocation::new(directory.file("music").to_str().unwrap(), "a.wav", false);

        assert_eq!(location.existing(), Err(Unavailable));
    }
}
