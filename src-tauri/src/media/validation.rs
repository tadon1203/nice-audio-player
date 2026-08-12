use serde::Serialize;
use std::path::Path;

pub const SUPPORTED_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "aac", "m4a"];

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedAudioFile {
    pub path: String,
    pub file_name: String,
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(tag = "code", content = "details", rename_all = "camelCase")]
pub enum AudioFileValidationError {
    EmptyPath,
    NotFound,
    NotAFile,
    UnsupportedExtension { extension: Option<String> },
    InvalidFileName,
}

pub fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn validate_audio_file(path: &str) -> Result<ValidatedAudioFile, AudioFileValidationError> {
    if path.trim().is_empty() {
        return Err(AudioFileValidationError::EmptyPath);
    }
    let file_path = Path::new(path);
    let metadata = std::fs::metadata(file_path).map_err(|_| AudioFileValidationError::NotFound)?;
    if !metadata.is_file() {
        return Err(AudioFileValidationError::NotAFile);
    }
    let file_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or(AudioFileValidationError::InvalidFileName)?;
    let extension = file_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    let extension = match extension {
        Some(extension) if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) => extension,
        extension => return Err(AudioFileValidationError::UnsupportedExtension { extension }),
    };
    Ok(ValidatedAudioFile {
        path: path.to_owned(),
        file_name: file_name.to_owned(),
        extension,
    })
}
