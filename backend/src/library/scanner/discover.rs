//! Phase one: walk a directory and describe the supported audio files in it.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::media::validation::is_supported_extension;

/// A supported audio file as the filesystem shows it right now.
#[derive(Debug, Clone)]
pub(super) struct DiscoveredFile {
    pub path: PathBuf,
    /// Path below the directory, always with `/` separators.
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

/// The directories a scan of `directory` walks: the directory itself, or, for a scan that follows changes,
/// each changed path's directory (the nearest one that still exists), with directories inside
/// another one left out since walking that covers them.
pub(super) fn scope(directory: &Path, changed: Option<&[PathBuf]>) -> Vec<PathBuf> {
    let Some(changed) = changed else {
        return vec![directory.to_path_buf()];
    };
    let mut dirs: Vec<PathBuf> = Vec::new();
    for path in changed {
        let mut dir = path.as_path();
        while !(dir.is_dir() && dir.starts_with(directory)) {
            match dir.parent() {
                Some(parent) if dir != directory => dir = parent,
                _ => {
                    dir = directory;
                    break;
                }
            }
        }
        if !dirs.iter().any(|known| dir.starts_with(known)) {
            dirs.retain(|known| !known.starts_with(dir));
            dirs.push(dir.to_path_buf());
        }
    }
    if dirs.is_empty() {
        dirs.push(directory.to_path_buf());
    }
    dirs
}

/// A directory below `directory` as `/`-separated relative text, `""` for the directory itself.
pub(super) fn relative_dir(directory: &str, dir: &Path) -> String {
    dir.strip_prefix(directory)
        .ok()
        .and_then(|relative| relative.to_str())
        .map(|relative| relative.replace('\\', "/"))
        .unwrap_or_default()
}

/// Walks `dirs` (see [`scope`]) and describes the supported audio files in them.
pub(super) fn discover<'a>(
    directory: &'a str,
    dirs: &[PathBuf],
) -> impl Iterator<Item = Discovery> + 'a {
    let starts = dirs.to_vec();
    starts
        .into_iter()
        .flat_map(|start| walkdir::WalkDir::new(start).follow_links(false).into_iter())
        .filter_map(move |entry| {
            let Ok(entry) = entry else {
                return Some(Discovery::WalkFailed);
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
                .strip_prefix(directory)
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
