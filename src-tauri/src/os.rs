//! Operating-system calls that open the file manager.

use backend::library::error::LibraryCommandError;

/// Opens the folder at `path` in the file manager.
#[cfg(windows)]
pub fn open_in_file_manager(path: &str) -> Result<(), LibraryCommandError> {
    std::process::Command::new("explorer.exe")
        .arg(path.replace('/', "\\"))
        .spawn()
        .map(|_| ())
        .map_err(|_| LibraryCommandError::TaskFailed)
}

#[cfg(not(windows))]
pub fn open_in_file_manager(_path: &str) -> Result<(), LibraryCommandError> {
    Err(LibraryCommandError::TaskFailed)
}

/// Shows the file at `path` in the file manager, selected.
#[cfg(windows)]
pub fn reveal_in_file_manager(path: &str) -> Result<(), LibraryCommandError> {
    use std::os::windows::process::CommandExt;
    // Explorer parses its own command line: `/select,` and the quoted path go through verbatim.
    std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path.replace('/', "\\")))
        .spawn()
        .map(|_| ())
        .map_err(|_| LibraryCommandError::TaskFailed)
}

#[cfg(not(windows))]
pub fn reveal_in_file_manager(_path: &str) -> Result<(), LibraryCommandError> {
    Err(LibraryCommandError::TaskFailed)
}
