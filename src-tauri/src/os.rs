//! Operating-system calls that open the file manager.

use std::{ffi::OsString, path::Path};

use backend::errors::CommandError;

/// Opens the directory at `path` in the file manager.
#[cfg(windows)]
pub(crate) fn open_in_file_manager(path: &Path) -> Result<(), CommandError> {
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .inspect_err(|cause| log::warn!("host.os.explorer_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)
}

#[cfg(not(windows))]
pub fn open_in_file_manager(_path: &Path) -> Result<(), CommandError> {
    Err(CommandError::TaskFailed)
}

/// Shows the file at `path` in the file manager, selected.
#[cfg(windows)]
pub(crate) fn reveal_in_file_manager(path: &Path) -> Result<(), CommandError> {
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
        .inspect_err(|cause| log::warn!("host.os.reveal_failed cause={cause}"))
        .map_err(|_| CommandError::TaskFailed)
}

#[cfg(not(windows))]
pub fn reveal_in_file_manager(_path: &Path) -> Result<(), CommandError> {
    Err(CommandError::TaskFailed)
}
