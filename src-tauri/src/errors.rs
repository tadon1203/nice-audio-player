use backend::audio::playback::{PlaybackFailureCode, PlaybackServiceError};
use serde::Serialize;
use specta::Type;

/// Structured playback command failure serialized as `{ "code": "<camelCase>" }`.
#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum PlaybackCommandError {
    InvalidArgument,
    PlaybackWorkerUnavailable,
    QueueItemNotFound,
    QueueBusy,
    InvalidVolume,
    InvalidDeviceId,
    InvalidPlaybackState,
    DurationUnavailable,
    SeekFailed,
    DecodeFailed,
    NoOutputDevice,
    OutputDeviceUnavailable,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamPauseFailed,
    OutputStreamResumeFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    SampleRateConversionFailed,
}

impl From<PlaybackServiceError> for PlaybackCommandError {
    fn from(error: PlaybackServiceError) -> Self {
        match error {
            PlaybackServiceError::WorkerUnavailable => Self::PlaybackWorkerUnavailable,
            PlaybackServiceError::QueueItemNotFound => Self::QueueItemNotFound,
            PlaybackServiceError::QueueBusy => Self::QueueBusy,
            PlaybackServiceError::InvalidVolume => Self::InvalidVolume,
            PlaybackServiceError::InvalidDeviceId => Self::InvalidDeviceId,
            PlaybackServiceError::OutputDeviceUnavailable => Self::OutputDeviceUnavailable,
            PlaybackServiceError::InvalidPlaybackState => Self::InvalidPlaybackState,
            PlaybackServiceError::DurationUnavailable => Self::DurationUnavailable,
            PlaybackServiceError::Seek => Self::SeekFailed,
            PlaybackServiceError::Decode => Self::DecodeFailed,
            PlaybackServiceError::Output(error) => match error {
                PlaybackFailureCode::NoOutputDevice => Self::NoOutputDevice,
                PlaybackFailureCode::OutputDeviceUnavailable => Self::OutputDeviceUnavailable,
                PlaybackFailureCode::UnsupportedOutputConfiguration => {
                    Self::UnsupportedOutputConfiguration
                }
                PlaybackFailureCode::OutputStreamBuildFailed => Self::OutputStreamBuildFailed,
                PlaybackFailureCode::OutputStreamStartFailed => Self::OutputStreamStartFailed,
                PlaybackFailureCode::OutputStreamPauseFailed => Self::OutputStreamPauseFailed,
                PlaybackFailureCode::OutputStreamResumeFailed => Self::OutputStreamResumeFailed,
                PlaybackFailureCode::OutputStreamRuntimeFailed => Self::OutputStreamRuntimeFailed,
                PlaybackFailureCode::CompletionTimingFailed => Self::CompletionTimingFailed,
                PlaybackFailureCode::DecodeFailed => Self::DecodeFailed,
                PlaybackFailureCode::SampleRateConversionFailed => Self::SampleRateConversionFailed,
            },
        }
    }
}
