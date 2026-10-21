//! Best-effort file removal. A file that cannot be removed leaves a stale file behind, which the
//! next run tolerates, so the error is logged here and not returned to the caller.

use std::io::ErrorKind;
use std::path::Path;

/// Removes `path`. A file that is already gone is the goal, not a failure; any other error is
/// logged at `debug`.
pub fn remove_file_best_effort(path: &Path) {
    if let Err(cause) = std::fs::remove_file(path)
        && cause.kind() != ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
}

#[cfg(test)]
mod tests {
    use super::remove_file_best_effort;
    use crate::test_support::TestDirectory;

    #[test]
    fn a_missing_file_is_not_an_error() {
        let directory = TestDirectory::new();
        let missing = directory.file("gone.bin");

        remove_file_best_effort(&missing);

        assert!(!missing.exists());
    }

    #[test]
    fn an_existing_file_is_removed() {
        let directory = TestDirectory::new();
        let file = directory.file("stale.bin");
        std::fs::write(&file, b"stale").unwrap();

        remove_file_best_effort(&file);

        assert!(!file.exists());
    }
}
