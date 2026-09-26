use serde::Serialize;
use std::path::Path;

const SUPPORTED_EXTENSIONS: [&str; 5] = ["mp3", "flac", "wav", "aac", "m4a"];

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

#[cfg(test)]
mod tests {
    use super::{validate_audio_file, AudioFileValidationError};
    use std::fs::{create_dir_all, remove_dir_all, File};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

    struct TestDirectory {
        path: PathBuf,
    }

    impl TestDirectory {
        fn new() -> Self {
            let unique_id = NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time must be after the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "nice-audio-player-validation-{}-{timestamp}-{unique_id}",
                std::process::id()
            ));

            create_dir_all(&path).expect("test directory must be created");
            Self { path }
        }

        fn create_file(&self, name: &str) -> PathBuf {
            let path = self.path.join(name);
            File::create(&path).expect("test file must be created");
            path
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = remove_dir_all(&self.path);
        }
    }

    #[test]
    fn accepts_an_existing_supported_file() {
        let directory = TestDirectory::new();
        let path = directory.create_file("track.mp3");

        let result = validate_audio_file(path.to_str().expect("path must be valid UTF-8"));

        assert_eq!(
            result.expect("supported file must validate").file_name,
            "track.mp3"
        );
    }

    #[test]
    fn rejects_a_missing_path() {
        let directory = TestDirectory::new();
        let path = directory.path().join("missing.mp3");

        assert_eq!(
            validate_audio_file(path.to_str().expect("path must be valid UTF-8")),
            Err(AudioFileValidationError::NotFound)
        );
    }

    #[test]
    fn rejects_a_directory() {
        let directory = TestDirectory::new();

        assert_eq!(
            validate_audio_file(directory.path().to_str().expect("path must be valid UTF-8")),
            Err(AudioFileValidationError::NotAFile)
        );
    }

    #[test]
    fn rejects_an_unsupported_extension() {
        let directory = TestDirectory::new();
        let path = directory.create_file("track.ogg");

        assert_eq!(
            validate_audio_file(path.to_str().expect("path must be valid UTF-8")),
            Err(AudioFileValidationError::UnsupportedExtension {
                extension: Some("ogg".to_owned()),
            })
        );
    }

    #[test]
    fn accepts_an_uppercase_supported_extension() {
        let directory = TestDirectory::new();
        let path = directory.create_file("track.MP3");

        assert_eq!(
            validate_audio_file(path.to_str().expect("path must be valid UTF-8"))
                .expect("supported file must validate")
                .extension,
            "mp3"
        );
    }

    #[test]
    fn rejects_a_file_without_an_extension() {
        let directory = TestDirectory::new();
        let path = directory.create_file("track");

        assert_eq!(
            validate_audio_file(path.to_str().expect("path must be valid UTF-8")),
            Err(AudioFileValidationError::UnsupportedExtension { extension: None })
        );
    }

    #[test]
    fn rejects_an_empty_path() {
        assert_eq!(
            validate_audio_file(""),
            Err(AudioFileValidationError::EmptyPath)
        );
    }
}
