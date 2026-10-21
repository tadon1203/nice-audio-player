//! Operating-system calls that open the file manager.

use std::{ffi::OsString, path::Path};

use backend::diagnostics::logged;
use backend::errors::{CommonError, LibraryCommandError};

/// Opens the folder at `path` in the file manager.
#[cfg(windows)]
pub fn open_in_file_manager(path: &Path) -> Result<(), LibraryCommandError> {
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(logged(
            LibraryCommandError::Common {
                error: CommonError::TaskFailed,
            },
            "host.os.explorer_failed",
        ))
}

#[cfg(not(windows))]
pub fn open_in_file_manager(_path: &Path) -> Result<(), LibraryCommandError> {
    Err(LibraryCommandError::Common {
        error: CommonError::TaskFailed,
    })
}

/// Shows the file at `path` in the file manager, selected.
#[cfg(windows)]
pub fn reveal_in_file_manager(path: &Path) -> Result<(), LibraryCommandError> {
    use std::os::windows::process::CommandExt;
    // Explorer parses its own command line: `/select,` and the quoted path go through verbatim.
    // The path is joined as an OS string, so a name Unicode cannot hold reaches Explorer whole.
    let mut argument = OsString::from("/select,\"");
    argument.push(path.as_os_str());
    argument.push("\"");
    std::process::Command::new("explorer.exe")
        .raw_arg(argument)
        .spawn()
        .map(|_| ())
        .map_err(logged(
            LibraryCommandError::Common {
                error: CommonError::TaskFailed,
            },
            "host.os.reveal_failed",
        ))
}

#[cfg(not(windows))]
pub fn reveal_in_file_manager(_path: &Path) -> Result<(), LibraryCommandError> {
    Err(LibraryCommandError::Common {
        error: CommonError::TaskFailed,
    })
}
