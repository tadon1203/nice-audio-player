use backend::audio::playback::{PlaybackFailureCode, PlaybackServiceError};
use serde::Serialize;

pub fn error_code<E: Serialize>(error: E, fallback: &'static str) -> String {
    let code = serde_json::to_value(error)
        .ok()
        .and_then(|value| {
            value
                .get("code")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| fallback.to_owned());
    format!("nativeError:{code}")
}

/// Maps any serializable backend command error to its IPC error string.
pub fn command_error<E: Serialize>(error: E) -> String {
    error_code(error, "taskFailed")
}

pub fn playback_error(error: PlaybackServiceError) -> String {
    let code = match error {
        PlaybackServiceError::WorkerUnavailable => "playbackWorkerUnavailable",
        PlaybackServiceError::QueueItemNotFound => "queueItemNotFound",
        PlaybackServiceError::QueueBusy => "queueBusy",
        PlaybackServiceError::InvalidVolume => "invalidVolume",
        PlaybackServiceError::InvalidDeviceId => "invalidDeviceId",
        PlaybackServiceError::OutputDeviceUnavailable => "outputDeviceUnavailable",
        PlaybackServiceError::InvalidPlaybackState => "invalidPlaybackState",
        PlaybackServiceError::DurationUnavailable => "durationUnavailable",
        PlaybackServiceError::Seek => "seekFailed",
        PlaybackServiceError::Decode => "decodeFailed",
        PlaybackServiceError::Output(error) => match error {
            PlaybackFailureCode::NoOutputDevice => "noOutputDevice",
            PlaybackFailureCode::OutputDeviceUnavailable => "outputDeviceUnavailable",
            PlaybackFailureCode::UnsupportedOutputConfiguration => "unsupportedOutputConfiguration",
            PlaybackFailureCode::OutputStreamBuildFailed => "outputStreamBuildFailed",
            PlaybackFailureCode::OutputStreamStartFailed => "outputStreamStartFailed",
            PlaybackFailureCode::OutputStreamPauseFailed => "outputStreamPauseFailed",
            PlaybackFailureCode::OutputStreamResumeFailed => "outputStreamResumeFailed",
            PlaybackFailureCode::OutputStreamRuntimeFailed => "outputStreamRuntimeFailed",
            PlaybackFailureCode::CompletionTimingFailed => "completionTimingFailed",
            PlaybackFailureCode::DecodeFailed => "decodeFailed",
            PlaybackFailureCode::SampleRateConversionFailed => "sampleRateConversionFailed",
        },
    };
    format!("nativeError:{code}")
}

pub fn task_error() -> String {
    "nativeError:taskFailed".to_owned()
}
