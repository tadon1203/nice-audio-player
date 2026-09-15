use crate::{
    audio::{devices::AudioDeviceListError, playback::PlaybackServiceError},
    library::service::{LibraryCommandError, StartLibraryAlbumTrackError, StartLibraryTrackError},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeErrorCode {
    InvalidArgument,
    EnumerationFailed,
    InvalidRoot,
    RootNotFound,
    RootNotDirectory,
    CanonicalizationFailed,
    DuplicateRoot,
    OverlappingRoot,
    ScanInProgress,
    InvalidId,
    AlbumNotFound,
    InvalidCursor,
    InvalidAlbumKey,
    InvalidAlbumArtistKey,
    AlbumArtistNotFound,
    RootMissing,
    ScanAlreadyRunning,
    NoEnabledRoots,
    ScanNotRunning,
    LibraryUnavailable,
    PersistenceFailed,
    TaskFailed,
    TrackNotFound,
    TrackUnavailable,
    TrackNotPlayable,
    InvalidTrackId,
    TrackNotMember,
    NoPlayableTracks,
    SourceUnavailable,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    OutputFailed,
    PlaybackWorkerUnavailable,
    QueueItemNotFound,
    QueueBusy,
    InvalidVolume,
    InvalidDeviceId,
    InvalidPlaybackState,
    DurationUnavailable,
    SeekFailed,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamPauseFailed,
    OutputStreamResumeFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    SampleRateConversionFailed,
    BackendClosed,
}

pub fn to_napi_error(code: NativeErrorCode) -> napi::Error {
    napi::Error::new(
        napi::Status::GenericFailure,
        format!("nativeError:{}", code.as_ref()),
    )
}

impl AsRef<str> for NativeErrorCode {
    fn as_ref(&self) -> &str {
        match self {
            Self::InvalidArgument => "invalidArgument",
            Self::EnumerationFailed => "enumerationFailed",
            Self::InvalidRoot => "invalidRoot",
            Self::RootNotFound => "rootNotFound",
            Self::RootNotDirectory => "rootNotDirectory",
            Self::CanonicalizationFailed => "canonicalizationFailed",
            Self::DuplicateRoot => "duplicateRoot",
            Self::OverlappingRoot => "overlappingRoot",
            Self::ScanInProgress => "scanInProgress",
            Self::InvalidId => "invalidId",
            Self::AlbumNotFound => "albumNotFound",
            Self::InvalidCursor => "invalidCursor",
            Self::InvalidAlbumKey => "invalidAlbumKey",
            Self::InvalidAlbumArtistKey => "invalidAlbumArtistKey",
            Self::AlbumArtistNotFound => "albumArtistNotFound",
            Self::RootMissing => "rootMissing",
            Self::ScanAlreadyRunning => "scanAlreadyRunning",
            Self::NoEnabledRoots => "noEnabledRoots",
            Self::ScanNotRunning => "scanNotRunning",
            Self::LibraryUnavailable => "libraryUnavailable",
            Self::PersistenceFailed => "persistenceFailed",
            Self::TaskFailed => "taskFailed",
            Self::TrackNotFound => "trackNotFound",
            Self::TrackUnavailable => "trackUnavailable",
            Self::TrackNotPlayable => "trackNotPlayable",
            Self::InvalidTrackId => "invalidTrackId",
            Self::TrackNotMember => "trackNotMember",
            Self::NoPlayableTracks => "noPlayableTracks",
            Self::SourceUnavailable => "sourceUnavailable",
            Self::DecodeFailed => "decodeFailed",
            Self::NoOutputDevice => "noOutputDevice",
            Self::OutputDeviceUnavailable => "outputDeviceUnavailable",
            Self::OutputFailed => "outputFailed",
            Self::PlaybackWorkerUnavailable => "playbackWorkerUnavailable",
            Self::QueueItemNotFound => "queueItemNotFound",
            Self::QueueBusy => "queueBusy",
            Self::InvalidVolume => "invalidVolume",
            Self::InvalidDeviceId => "invalidDeviceId",
            Self::InvalidPlaybackState => "invalidPlaybackState",
            Self::DurationUnavailable => "durationUnavailable",
            Self::SeekFailed => "seekFailed",
            Self::UnsupportedOutputConfiguration => "unsupportedOutputConfiguration",
            Self::OutputStreamBuildFailed => "outputStreamBuildFailed",
            Self::OutputStreamStartFailed => "outputStreamStartFailed",
            Self::OutputStreamPauseFailed => "outputStreamPauseFailed",
            Self::OutputStreamResumeFailed => "outputStreamResumeFailed",
            Self::OutputStreamRuntimeFailed => "outputStreamRuntimeFailed",
            Self::CompletionTimingFailed => "completionTimingFailed",
            Self::SampleRateConversionFailed => "sampleRateConversionFailed",
            Self::BackendClosed => "backendClosed",
        }
    }
}

pub fn backend(error: crate::app::BackendError) -> NativeErrorCode {
    match error {
        crate::app::BackendError::PlaybackStartFailed => NativeErrorCode::TaskFailed,
    }
}

pub fn device(error: AudioDeviceListError) -> NativeErrorCode {
    match error {
        AudioDeviceListError::EnumerationFailed => NativeErrorCode::EnumerationFailed,
    }
}

pub fn library(error: LibraryCommandError) -> NativeErrorCode {
    match error {
        LibraryCommandError::InvalidRoot => NativeErrorCode::InvalidRoot,
        LibraryCommandError::RootNotFound => NativeErrorCode::RootNotFound,
        LibraryCommandError::RootNotDirectory => NativeErrorCode::RootNotDirectory,
        LibraryCommandError::CanonicalizationFailed => NativeErrorCode::CanonicalizationFailed,
        LibraryCommandError::DuplicateRoot => NativeErrorCode::DuplicateRoot,
        LibraryCommandError::OverlappingRoot => NativeErrorCode::OverlappingRoot,
        LibraryCommandError::ScanInProgress => NativeErrorCode::ScanInProgress,
        LibraryCommandError::InvalidId => NativeErrorCode::InvalidId,
        LibraryCommandError::AlbumNotFound => NativeErrorCode::AlbumNotFound,
        LibraryCommandError::InvalidCursor => NativeErrorCode::InvalidCursor,
        LibraryCommandError::InvalidAlbumKey => NativeErrorCode::InvalidAlbumKey,
        LibraryCommandError::InvalidAlbumArtistKey => NativeErrorCode::InvalidAlbumArtistKey,
        LibraryCommandError::AlbumArtistNotFound => NativeErrorCode::AlbumArtistNotFound,
        LibraryCommandError::RootMissing => NativeErrorCode::RootMissing,
        LibraryCommandError::ScanAlreadyRunning => NativeErrorCode::ScanAlreadyRunning,
        LibraryCommandError::NoEnabledRoots => NativeErrorCode::NoEnabledRoots,
        LibraryCommandError::ScanNotRunning => NativeErrorCode::ScanNotRunning,
        LibraryCommandError::LibraryUnavailable => NativeErrorCode::LibraryUnavailable,
        LibraryCommandError::PersistenceFailed => NativeErrorCode::PersistenceFailed,
        LibraryCommandError::TaskFailed => NativeErrorCode::TaskFailed,
    }
}

pub fn track(error: StartLibraryTrackError) -> NativeErrorCode {
    match error {
        StartLibraryTrackError::InvalidId => NativeErrorCode::InvalidId,
        StartLibraryTrackError::TrackNotFound => NativeErrorCode::TrackNotFound,
        StartLibraryTrackError::TrackUnavailable => NativeErrorCode::TrackUnavailable,
        StartLibraryTrackError::TrackNotPlayable => NativeErrorCode::TrackNotPlayable,
        StartLibraryTrackError::LibraryUnavailable => NativeErrorCode::LibraryUnavailable,
        StartLibraryTrackError::PersistenceFailed => NativeErrorCode::PersistenceFailed,
        StartLibraryTrackError::DecodeFailed => NativeErrorCode::DecodeFailed,
        StartLibraryTrackError::NoOutputDevice => NativeErrorCode::NoOutputDevice,
        StartLibraryTrackError::OutputDeviceUnavailable => NativeErrorCode::OutputDeviceUnavailable,
        StartLibraryTrackError::OutputFailed => NativeErrorCode::OutputFailed,
        StartLibraryTrackError::PlaybackWorkerUnavailable => {
            NativeErrorCode::PlaybackWorkerUnavailable
        }
        StartLibraryTrackError::TaskFailed => NativeErrorCode::TaskFailed,
    }
}

pub fn album(error: StartLibraryAlbumTrackError) -> NativeErrorCode {
    match error {
        StartLibraryAlbumTrackError::InvalidAlbumKey => NativeErrorCode::InvalidAlbumKey,
        StartLibraryAlbumTrackError::InvalidTrackId => NativeErrorCode::InvalidTrackId,
        StartLibraryAlbumTrackError::AlbumNotFound => NativeErrorCode::AlbumNotFound,
        StartLibraryAlbumTrackError::TrackNotMember => NativeErrorCode::TrackNotMember,
        StartLibraryAlbumTrackError::TrackUnavailable => NativeErrorCode::TrackUnavailable,
        StartLibraryAlbumTrackError::TrackNotPlayable => NativeErrorCode::TrackNotPlayable,
        StartLibraryAlbumTrackError::NoPlayableTracks => NativeErrorCode::NoPlayableTracks,
        StartLibraryAlbumTrackError::SourceUnavailable => NativeErrorCode::SourceUnavailable,
        StartLibraryAlbumTrackError::LibraryUnavailable => NativeErrorCode::LibraryUnavailable,
        StartLibraryAlbumTrackError::PersistenceFailed => NativeErrorCode::PersistenceFailed,
        StartLibraryAlbumTrackError::DecodeFailed => NativeErrorCode::DecodeFailed,
        StartLibraryAlbumTrackError::NoOutputDevice => NativeErrorCode::NoOutputDevice,
        StartLibraryAlbumTrackError::OutputDeviceUnavailable => {
            NativeErrorCode::OutputDeviceUnavailable
        }
        StartLibraryAlbumTrackError::OutputFailed => NativeErrorCode::OutputFailed,
        StartLibraryAlbumTrackError::PlaybackWorkerUnavailable => {
            NativeErrorCode::PlaybackWorkerUnavailable
        }
        StartLibraryAlbumTrackError::TaskFailed => NativeErrorCode::TaskFailed,
    }
}

pub fn playback(error: PlaybackServiceError) -> NativeErrorCode {
    use crate::audio::playback::PlaybackFailureCode;
    match error {
        PlaybackServiceError::WorkerUnavailable => NativeErrorCode::PlaybackWorkerUnavailable,
        PlaybackServiceError::QueueItemNotFound => NativeErrorCode::QueueItemNotFound,
        PlaybackServiceError::QueueBusy => NativeErrorCode::QueueBusy,
        PlaybackServiceError::InvalidVolume => NativeErrorCode::InvalidVolume,
        PlaybackServiceError::InvalidDeviceId => NativeErrorCode::InvalidDeviceId,
        PlaybackServiceError::OutputDeviceUnavailable => NativeErrorCode::OutputDeviceUnavailable,
        PlaybackServiceError::InvalidPlaybackState => NativeErrorCode::InvalidPlaybackState,
        PlaybackServiceError::DurationUnavailable => NativeErrorCode::DurationUnavailable,
        PlaybackServiceError::Seek => NativeErrorCode::SeekFailed,
        PlaybackServiceError::Decode => NativeErrorCode::DecodeFailed,
        PlaybackServiceError::Output(code) => match code {
            PlaybackFailureCode::NoOutputDevice => NativeErrorCode::NoOutputDevice,
            PlaybackFailureCode::OutputDeviceUnavailable => {
                NativeErrorCode::OutputDeviceUnavailable
            }
            PlaybackFailureCode::UnsupportedOutputConfiguration => {
                NativeErrorCode::UnsupportedOutputConfiguration
            }
            PlaybackFailureCode::OutputStreamBuildFailed => {
                NativeErrorCode::OutputStreamBuildFailed
            }
            PlaybackFailureCode::OutputStreamStartFailed => {
                NativeErrorCode::OutputStreamStartFailed
            }
            PlaybackFailureCode::OutputStreamPauseFailed => {
                NativeErrorCode::OutputStreamPauseFailed
            }
            PlaybackFailureCode::OutputStreamResumeFailed => {
                NativeErrorCode::OutputStreamResumeFailed
            }
            PlaybackFailureCode::OutputStreamRuntimeFailed => {
                NativeErrorCode::OutputStreamRuntimeFailed
            }
            PlaybackFailureCode::CompletionTimingFailed => NativeErrorCode::CompletionTimingFailed,
            PlaybackFailureCode::DecodeFailed => NativeErrorCode::DecodeFailed,
            PlaybackFailureCode::SampleRateConversionFailed => {
                NativeErrorCode::SampleRateConversionFailed
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_stable_error_code_strings() {
        assert_eq!(NativeErrorCode::InvalidArgument.as_ref(), "invalidArgument");
        assert_eq!(
            NativeErrorCode::OutputDeviceUnavailable.as_ref(),
            "outputDeviceUnavailable"
        );
        assert_eq!(NativeErrorCode::BackendClosed.as_ref(), "backendClosed");
    }

    #[test]
    fn converts_failures_to_generic_napi_errors_with_code_message() {
        let error = to_napi_error(NativeErrorCode::TrackNotFound);
        assert_eq!(error.status, napi::Status::GenericFailure);
        assert_eq!(error.reason, "nativeError:trackNotFound");
    }
}
