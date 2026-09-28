//! Phase one: walk a root and describe the supported audio files in it.

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use crate::media::validation::is_supported_extension;

/// A supported audio file as the filesystem shows it right now.
#[derive(Debug, Clone)]
pub(super) struct DiscoveredFile {
    pub path: PathBuf,
    /// Path below the root, always with `/` separators.
    pub relative: String,
    pub file_name: String,
    /// Lowercase, without the dot.
    pub extension: String,
    pub byte_length: u64,
    /// Changes whenever the file is rewritten; equal keys mean "unchanged".
    pub modification_key: String,
}

pub(super) enum Discovery {
    Found(DiscoveredFile),
    /// A supported file that could not be described. Counts as failed, and as discovered when
    /// `counted` (it got as far as being recognized).
    Unusable {
        counted: bool,
    },
    /// The walk itself broke, so the set of files seen is incomplete.
    WalkFailed,
}

pub(super) fn discover(root: &str) -> impl Iterator<Item = Discovery> + '_ {
    walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(move |entry| {
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => return Some(Discovery::WalkFailed),
            };
            if !entry.file_type().is_file() {
                return None;
            }
            let path = entry.path();
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if !is_supported_extension(extension) {
                return None;
            }
            let Some(relative) = path
                .strip_prefix(root)
                .ok()
                .and_then(|relative| relative.to_str())
                .map(|relative| relative.replace('\\', "/"))
            else {
                return Some(Discovery::Unusable { counted: false });
            };
            let Ok(metadata) = std::fs::metadata(path) else {
                return Some(Discovery::Unusable { counted: true });
            };
            let modification_key = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos().to_string())
                .unwrap_or_default();
            Some(Discovery::Found(DiscoveredFile {
                path: path.to_path_buf(),
                relative,
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_owned(),
                extension: extension.to_ascii_lowercase(),
                byte_length: metadata.len(),
                modification_key,
            }))
        })
}
