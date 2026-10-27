//! The Library's tests at its seams: opening and resetting the database file, the directory commands,
//! and where a track's file is. The scan, sync, and ID tests are in their own files.

use crate::errors::CommandError;
use crate::library::Library;
use crate::library::read::tracks::TrackLocation;
use crate::library::storage::{self, Database};
use crate::library::sync::directories;
use crate::test_support::CommandCode;
use crate::test_support::{TestDirectory, null_messages};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

mod database;
mod directory_commands;
mod ids;
mod location;
mod scan;
mod sync;

fn open(directory: &Path) -> crate::library::errors::Result<Library> {
    Library::open(directory, null_messages())
}

fn subdirectory(directory: &TestDirectory, name: &str) -> PathBuf {
    let path = directory.file(name);
    std::fs::create_dir_all(&path).unwrap();
    path
}
