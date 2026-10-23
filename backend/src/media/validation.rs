use serde::Serialize;
use std::path::{Path, PathBuf};

pub(crate) const SUPPORTED_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "aac", "m4a"];

/// An audio file the Backend can play. The path stays a `PathBuf` all the way to the file system,
/// so a name the platform allows but Unicode cannot hold still opens.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedAudioFile {
    pub path: PathBuf,
    pub file_name: String,
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", content = "details", rename_all = "camelCase")]
pub(crate) enum AudioFileValidationError {
    EmptyPath,
    NotFound,
    NotAFile,
    UnsupportedExtension { extension: Option<String> },
    InvalidFileName,
}

pub(crate) fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
}

/// Checks that `path` names an existing supported audio file.
pub(crate) fn validate_audio_file(
    path: &Path,
) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    if is_blank(path) {
        return Err(AudioFileValidationError::EmptyPath);
    }
    let metadata = std::fs::metadata(path)
        .inspect_err(|cause| log::warn!("media.validation.metadata_failed cause={cause}"))
        .map_err(|_| AudioFileValidationError::NotFound)?;
    if !metadata.is_file() {
        return Err(AudioFileValidationError::NotAFile);
    }
    describe_audio_file(path)
}

/// Names a supported audio file without touching the filesystem. Playback contexts describe
/// thousands of library files at once; a file that vanished fails when it is loaded instead.
pub(crate) fn describe_audio_file(
    path: &Path,
) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    if is_blank(path) {
        return Err(AudioFileValidationError::EmptyPath);
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or(AudioFileValidationError::InvalidFileName)?;
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    let extension = match extension {
        Some(extension) if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) => extension,
        extension => return Err(AudioFileValidationError::UnsupportedExtension { extension }),
    };
    Ok(ValidatedAudioFile {
        path: path.to_path_buf(),
        file_name: file_name.to_owned(),
        extension,
    })
}

/// Nothing to name: an empty path, or one that is only whitespace.
fn is_blank(path: &Path) -> bool {
    path.to_str().is_some_and(|text| text.trim().is_empty()) || path.as_os_str().is_empty()
}
