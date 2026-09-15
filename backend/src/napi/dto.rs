use super::error::NativeErrorCode;
use crate::{
    activity::{ApplicationActivity, ApplicationActivityKind, ApplicationActivityState},
    audio::{
        devices::{AudioOutputDevice, AudioOutputDeviceIdentity, AudioOutputSelection},
        playback::{
            PlaybackChannelConversion, PlaybackFailureCode, PlaybackQueueItem,
            PlaybackQueueSnapshot, PlaybackRepeatMode, PlaybackSnapshot,
        },
    },
    library::models::{
        LibraryAlbumArtistKey, LibraryAlbumArtistPage, LibraryAlbumArtistSortKey,
        LibraryAlbumArtistSummary, LibraryAlbumDetails, LibraryAlbumKey, LibraryAlbumPage,
        LibraryAlbumSortKey, LibraryAlbumSummary, LibraryAlbumTrackPage, LibraryAlbumTrackSummary,
        LibraryArtistAlbumSortKey, LibraryFileAvailability, LibraryRoot, LibraryScanSnapshot,
        LibraryScanState, LibrarySortDirection, LibraryStatus, LibraryTrackPage,
        LibraryTrackSortKey, LibraryTrackSummary, LibraryUnavailableReason,
    },
    media::validation::ValidatedAudioFile,
};
use napi_derive::napi;

pub const JS_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub fn u64_to_js_number(value: u64) -> Result<f64, NativeErrorCode> {
    if value > JS_MAX_SAFE_INTEGER {
        return Err(NativeErrorCode::InvalidArgument);
    }
    Ok(value as f64)
}

pub fn optional_u64_to_js_number(value: Option<u64>) -> Result<Option<f64>, NativeErrorCode> {
    value.map(u64_to_js_number).transpose()
}

pub fn js_non_negative_integer(value: f64, name: &'static str) -> Result<u64, NativeErrorCode> {
    if !value.is_finite()
        || value < 0.0
        || value.fract() != 0.0
        || value > JS_MAX_SAFE_INTEGER as f64
    {
        let _ = name;
        return Err(NativeErrorCode::InvalidArgument);
    }
    Ok(value as u64)
}

#[napi(object, js_name = "ValidatedAudioFile")]
pub struct ValidatedAudioFileDto {
    pub path: String,
    pub file_name: String,
    pub extension: String,
}

impl From<ValidatedAudioFile> for ValidatedAudioFileDto {
    fn from(value: ValidatedAudioFile) -> Self {
        Self {
            path: value.path,
            file_name: value.file_name,
            extension: value.extension,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "ArtworkMimeType")]
pub enum ArtworkMimeTypeDto {
    Jpeg,
    Png,
}

#[napi(object, js_name = "ArtworkRef")]
pub struct ArtworkRefDto {
    pub content_hash: String,
    pub mime_type: ArtworkMimeTypeDto,
    pub relative_path: String,
}

impl From<crate::library::models::ArtworkMimeType> for ArtworkMimeTypeDto {
    fn from(value: crate::library::models::ArtworkMimeType) -> Self {
        match value {
            crate::library::models::ArtworkMimeType::Jpeg => Self::Jpeg,
            crate::library::models::ArtworkMimeType::Png => Self::Png,
        }
    }
}

impl From<crate::library::models::ArtworkRef> for ArtworkRefDto {
    fn from(value: crate::library::models::ArtworkRef) -> Self {
        Self {
            content_hash: value.content_hash,
            mime_type: value.mime_type.into(),
            relative_path: value.relative_path,
        }
    }
}

#[napi(object, js_name = "AudioOutputDevice")]
pub struct AudioOutputDeviceDto {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

impl From<AudioOutputDevice> for AudioOutputDeviceDto {
    fn from(value: AudioOutputDevice) -> Self {
        Self {
            id: value.id,
            name: value.name,
            is_default: value.is_default,
        }
    }
}

#[napi(object, js_name = "AudioOutputDeviceIdentity")]
pub struct AudioOutputDeviceIdentityDto {
    pub id: String,
    pub name: String,
}

impl From<AudioOutputDeviceIdentity> for AudioOutputDeviceIdentityDto {
    fn from(value: AudioOutputDeviceIdentity) -> Self {
        Self {
            id: value.id,
            name: value.name,
        }
    }
}

#[napi(
    discriminant = "kind",
    discriminant_case = "camelCase",
    js_name = "AudioOutputSelection"
)]
pub enum AudioOutputSelectionDto {
    SystemDefault,
    Device { device_id: String },
}

impl From<AudioOutputSelection> for AudioOutputSelectionDto {
    fn from(value: AudioOutputSelection) -> Self {
        match value {
            AudioOutputSelection::SystemDefault => Self::SystemDefault,
            AudioOutputSelection::Device { device_id } => Self::Device { device_id },
        }
    }
}

impl From<AudioOutputSelectionDto> for AudioOutputSelection {
    fn from(value: AudioOutputSelectionDto) -> Self {
        match value {
            AudioOutputSelectionDto::SystemDefault => Self::SystemDefault,
            AudioOutputSelectionDto::Device { device_id } => Self::Device { device_id },
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "PlaybackChannelConversion")]
pub enum PlaybackChannelConversionDto {
    None,
    MonoToStereo,
    StereoToMono,
}

impl From<PlaybackChannelConversion> for PlaybackChannelConversionDto {
    fn from(value: PlaybackChannelConversion) -> Self {
        match value {
            PlaybackChannelConversion::None => Self::None,
            PlaybackChannelConversion::MonoToStereo => Self::MonoToStereo,
            PlaybackChannelConversion::StereoToMono => Self::StereoToMono,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "PlaybackFailureCode")]
pub enum PlaybackFailureCodeDto {
    NoOutputDevice,
    OutputDeviceUnavailable,
    UnsupportedOutputConfiguration,
    OutputStreamBuildFailed,
    OutputStreamStartFailed,
    OutputStreamPauseFailed,
    OutputStreamResumeFailed,
    OutputStreamRuntimeFailed,
    CompletionTimingFailed,
    DecodeFailed,
    SampleRateConversionFailed,
}

impl From<PlaybackFailureCode> for PlaybackFailureCodeDto {
    fn from(value: PlaybackFailureCode) -> Self {
        match value {
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
        }
    }
}

#[napi(
    discriminant = "status",
    discriminant_case = "camelCase",
    use_nullable = true,
    js_name = "PlaybackSnapshot"
)]
pub enum PlaybackSnapshotDto {
    Stopped {
        revision: f64,
        #[napi(use_nullable, ts_type = "ValidatedAudioFile | null")]
        file: Option<ValidatedAudioFileDto>,
        volume: f64,
        muted: bool,
        output_selection: AudioOutputSelectionDto,
        can_go_previous: bool,
        can_go_next: bool,
    },
    Playing {
        revision: f64,
        file: ValidatedAudioFileDto,
        playback_id: String,
        position_ms: f64,
        #[napi(use_nullable, ts_type = "number | null")]
        duration_ms: Option<f64>,
        volume: f64,
        muted: bool,
        output_selection: AudioOutputSelectionDto,
        output_device: AudioOutputDeviceIdentityDto,
        channel_conversion: PlaybackChannelConversionDto,
        source_sample_rate: f64,
        output_sample_rate: f64,
        resampling_active: bool,
        can_go_previous: bool,
        can_go_next: bool,
    },
    Paused {
        revision: f64,
        file: ValidatedAudioFileDto,
        playback_id: String,
        position_ms: f64,
        #[napi(use_nullable, ts_type = "number | null")]
        duration_ms: Option<f64>,
        volume: f64,
        muted: bool,
        output_selection: AudioOutputSelectionDto,
        output_device: AudioOutputDeviceIdentityDto,
        channel_conversion: PlaybackChannelConversionDto,
        source_sample_rate: f64,
        output_sample_rate: f64,
        resampling_active: bool,
        can_go_previous: bool,
        can_go_next: bool,
    },
    Failed {
        revision: f64,
        #[napi(use_nullable, ts_type = "ValidatedAudioFile | null")]
        file: Option<ValidatedAudioFileDto>,
        #[napi(use_nullable, ts_type = "string | null")]
        playback_id: Option<String>,
        error: PlaybackFailureCodeDto,
        volume: f64,
        muted: bool,
        output_selection: AudioOutputSelectionDto,
        can_go_previous: bool,
        can_go_next: bool,
    },
}

impl TryFrom<PlaybackSnapshot> for PlaybackSnapshotDto {
    type Error = NativeErrorCode;

    fn try_from(value: PlaybackSnapshot) -> Result<Self, Self::Error> {
        Ok(match value {
            PlaybackSnapshot::Stopped {
                revision,
                file,
                volume,
                muted,
                output_selection,
                can_go_previous,
                can_go_next,
            } => Self::Stopped {
                revision: u64_to_js_number(revision)?,
                file: file.map(Into::into),
                volume: f64::from(volume),
                muted,
                output_selection: output_selection.into(),
                can_go_previous,
                can_go_next,
            },
            PlaybackSnapshot::Playing {
                revision,
                file,
                playback_id,
                position_ms,
                duration_ms,
                volume,
                muted,
                output_selection,
                output_device,
                channel_conversion,
                source_sample_rate,
                output_sample_rate,
                resampling_active,
                can_go_previous,
                can_go_next,
            } => Self::Playing {
                revision: u64_to_js_number(revision)?,
                file: file.into(),
                playback_id,
                position_ms: u64_to_js_number(position_ms)?,
                duration_ms: optional_u64_to_js_number(duration_ms)?,
                volume: f64::from(volume),
                muted,
                output_selection: output_selection.into(),
                output_device: output_device.into(),
                channel_conversion: channel_conversion.into(),
                source_sample_rate: f64::from(source_sample_rate),
                output_sample_rate: f64::from(output_sample_rate),
                resampling_active,
                can_go_previous,
                can_go_next,
            },
            PlaybackSnapshot::Paused {
                revision,
                file,
                playback_id,
                position_ms,
                duration_ms,
                volume,
                muted,
                output_selection,
                output_device,
                channel_conversion,
                source_sample_rate,
                output_sample_rate,
                resampling_active,
                can_go_previous,
                can_go_next,
            } => Self::Paused {
                revision: u64_to_js_number(revision)?,
                file: file.into(),
                playback_id,
                position_ms: u64_to_js_number(position_ms)?,
                duration_ms: optional_u64_to_js_number(duration_ms)?,
                volume: f64::from(volume),
                muted,
                output_selection: output_selection.into(),
                output_device: output_device.into(),
                channel_conversion: channel_conversion.into(),
                source_sample_rate: f64::from(source_sample_rate),
                output_sample_rate: f64::from(output_sample_rate),
                resampling_active,
                can_go_previous,
                can_go_next,
            },
            PlaybackSnapshot::Failed {
                revision,
                file,
                playback_id,
                error,
                volume,
                muted,
                output_selection,
                can_go_previous,
                can_go_next,
            } => Self::Failed {
                revision: u64_to_js_number(revision)?,
                file: file.map(Into::into),
                playback_id,
                error: error.into(),
                volume: f64::from(volume),
                muted,
                output_selection: output_selection.into(),
                can_go_previous,
                can_go_next,
            },
        })
    }
}

#[napi(object, use_nullable = true, js_name = "PlaybackQueueItem")]
pub struct PlaybackQueueItemDto {
    pub id: String,
    pub title: String,
    #[napi(use_nullable, ts_type = "string | null")]
    pub artist: Option<String>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub duration_ms: Option<f64>,
}

impl TryFrom<PlaybackQueueItem> for PlaybackQueueItemDto {
    type Error = NativeErrorCode;
    fn try_from(value: PlaybackQueueItem) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            title: value.title,
            artist: value.artist,
            duration_ms: optional_u64_to_js_number(value.duration_ms)?,
        })
    }
}

#[napi(string_enum = "camelCase", js_name = "PlaybackRepeatMode")]
pub enum PlaybackRepeatModeDto {
    Off,
    All,
    One,
}

impl From<PlaybackRepeatMode> for PlaybackRepeatModeDto {
    fn from(value: PlaybackRepeatMode) -> Self {
        match value {
            PlaybackRepeatMode::Off => Self::Off,
            PlaybackRepeatMode::All => Self::All,
            PlaybackRepeatMode::One => Self::One,
        }
    }
}

#[napi(object, use_nullable = true, js_name = "PlaybackQueueSnapshot")]
pub struct PlaybackQueueSnapshotDto {
    #[napi(use_nullable, ts_type = "number | null")]
    pub revision: Option<f64>,
    #[napi(use_nullable, ts_type = "PlaybackQueueItem | null")]
    pub current: Option<PlaybackQueueItemDto>,
    pub upcoming: Vec<PlaybackQueueItemDto>,
    pub repeat_mode: PlaybackRepeatModeDto,
    pub shuffle_enabled: bool,
}

impl TryFrom<PlaybackQueueSnapshot> for PlaybackQueueSnapshotDto {
    type Error = NativeErrorCode;
    fn try_from(value: PlaybackQueueSnapshot) -> Result<Self, Self::Error> {
        Ok(Self {
            revision: Some(u64_to_js_number(value.revision)?),
            current: value.current.map(TryInto::try_into).transpose()?,
            upcoming: value
                .upcoming
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            repeat_mode: value.repeat_mode.into(),
            shuffle_enabled: value.shuffle_enabled,
        })
    }
}

#[napi(string_enum = "camelCase", js_name = "LibrarySortDirection")]
pub enum LibrarySortDirectionDto {
    Ascending,
    Descending,
}
impl From<LibrarySortDirectionDto> for LibrarySortDirection {
    fn from(value: LibrarySortDirectionDto) -> Self {
        match value {
            LibrarySortDirectionDto::Ascending => Self::Ascending,
            LibrarySortDirectionDto::Descending => Self::Descending,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryTrackSortKey")]
pub enum LibraryTrackSortKeyDto {
    Title,
    Artist,
    Album,
    Duration,
}
impl From<LibraryTrackSortKeyDto> for LibraryTrackSortKey {
    fn from(value: LibraryTrackSortKeyDto) -> Self {
        match value {
            LibraryTrackSortKeyDto::Title => Self::Title,
            LibraryTrackSortKeyDto::Artist => Self::Artist,
            LibraryTrackSortKeyDto::Album => Self::Album,
            LibraryTrackSortKeyDto::Duration => Self::Duration,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryAlbumSortKey")]
pub enum LibraryAlbumSortKeyDto {
    Title,
    Artist,
    Year,
}
impl From<LibraryAlbumSortKeyDto> for LibraryAlbumSortKey {
    fn from(value: LibraryAlbumSortKeyDto) -> Self {
        match value {
            LibraryAlbumSortKeyDto::Title => Self::Title,
            LibraryAlbumSortKeyDto::Artist => Self::Artist,
            LibraryAlbumSortKeyDto::Year => Self::Year,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryAlbumArtistSortKey")]
pub enum LibraryAlbumArtistSortKeyDto {
    Artist,
    AlbumCount,
    TrackCount,
}
impl From<LibraryAlbumArtistSortKeyDto> for LibraryAlbumArtistSortKey {
    fn from(value: LibraryAlbumArtistSortKeyDto) -> Self {
        match value {
            LibraryAlbumArtistSortKeyDto::Artist => Self::Artist,
            LibraryAlbumArtistSortKeyDto::AlbumCount => Self::AlbumCount,
            LibraryAlbumArtistSortKeyDto::TrackCount => Self::TrackCount,
        }
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryArtistAlbumSortKey")]
pub enum LibraryArtistAlbumSortKeyDto {
    Year,
    Title,
}
impl From<LibraryArtistAlbumSortKeyDto> for LibraryArtistAlbumSortKey {
    fn from(value: LibraryArtistAlbumSortKeyDto) -> Self {
        match value {
            LibraryArtistAlbumSortKeyDto::Year => Self::Year,
            LibraryArtistAlbumSortKeyDto::Title => Self::Title,
        }
    }
}

#[napi(object, js_name = "LibraryAlbumKey")]
pub struct LibraryAlbumKeyDto {
    pub title: String,
    pub album_artist: String,
}
impl From<LibraryAlbumKeyDto> for LibraryAlbumKey {
    fn from(value: LibraryAlbumKeyDto) -> Self {
        Self {
            title: value.title,
            album_artist: value.album_artist,
        }
    }
}

#[napi(object, js_name = "LibraryAlbumArtistKey")]
pub struct LibraryAlbumArtistKeyDto {
    pub name: String,
}
impl From<LibraryAlbumArtistKeyDto> for LibraryAlbumArtistKey {
    fn from(value: LibraryAlbumArtistKeyDto) -> Self {
        Self { name: value.name }
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryFileAvailability")]
pub enum LibraryFileAvailabilityDto {
    Available,
    Missing,
}
impl From<LibraryFileAvailability> for LibraryFileAvailabilityDto {
    fn from(value: LibraryFileAvailability) -> Self {
        match value {
            LibraryFileAvailability::Available => Self::Available,
            LibraryFileAvailability::Missing => Self::Missing,
        }
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryTrackSummary")]
pub struct LibraryTrackSummaryDto {
    pub id: String,
    pub title: String,
    #[napi(use_nullable, ts_type = "string | null")]
    pub artist: Option<String>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub album: Option<String>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub album_artist: Option<String>,
    #[napi(use_nullable, ts_type = "ArtworkRef | null")]
    pub artwork: Option<ArtworkRefDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub duration_ms: Option<f64>,
    pub availability: LibraryFileAvailabilityDto,
    pub playable: bool,
}
impl TryFrom<LibraryTrackSummary> for LibraryTrackSummaryDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryTrackSummary) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            title: value.title,
            artist: value.artist,
            album: value.album,
            album_artist: value.album_artist,
            artwork: value.artwork.map(Into::into),
            duration_ms: optional_u64_to_js_number(value.duration_ms)?,
            availability: value.availability.into(),
            playable: value.playable,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumSummary")]
pub struct LibraryAlbumSummaryDto {
    pub key: LibraryAlbumKeyDto,
    #[napi(use_nullable, ts_type = "ArtworkRef | null")]
    pub artwork: Option<ArtworkRefDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub year: Option<f64>,
}
impl TryFrom<LibraryAlbumSummary> for LibraryAlbumSummaryDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumSummary) -> Result<Self, Self::Error> {
        Ok(Self {
            key: LibraryAlbumKeyDto {
                title: value.key.title,
                album_artist: value.key.album_artist,
            },
            artwork: value.artwork.map(Into::into),
            year: value.year.map(f64::from),
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumArtistSummary")]
pub struct LibraryAlbumArtistSummaryDto {
    pub key: LibraryAlbumArtistKeyDto,
    #[napi(use_nullable, ts_type = "ArtworkRef | null")]
    pub artwork: Option<ArtworkRefDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub album_count: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub track_count: Option<f64>,
}
impl TryFrom<LibraryAlbumArtistSummary> for LibraryAlbumArtistSummaryDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumArtistSummary) -> Result<Self, Self::Error> {
        Ok(Self {
            key: LibraryAlbumArtistKeyDto {
                name: value.key.name,
            },
            artwork: value.artwork.map(Into::into),
            album_count: Some(u64_to_js_number(value.album_count)?),
            track_count: Some(u64_to_js_number(value.track_count)?),
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumDetails")]
pub struct LibraryAlbumDetailsDto {
    pub summary: LibraryAlbumSummaryDto,
    #[napi(use_nullable, ts_type = "string | null")]
    pub date: Option<String>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub track_count: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub duration_ms: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub first_playable_track_id: Option<String>,
}
impl TryFrom<LibraryAlbumDetails> for LibraryAlbumDetailsDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumDetails) -> Result<Self, Self::Error> {
        Ok(Self {
            summary: value.summary.try_into()?,
            date: value.date,
            track_count: Some(u64_to_js_number(value.track_count)?),
            duration_ms: optional_u64_to_js_number(value.duration_ms)?,
            first_playable_track_id: value.first_playable_track_id,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumTrackSummary")]
pub struct LibraryAlbumTrackSummaryDto {
    pub id: String,
    pub title: String,
    #[napi(use_nullable, ts_type = "string | null")]
    pub artist: Option<String>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub track_number: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub disc_number: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub file_format: Option<String>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub bit_depth: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub sample_rate: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub duration_ms: Option<f64>,
    pub availability: LibraryFileAvailabilityDto,
    pub playable: bool,
}
impl TryFrom<LibraryAlbumTrackSummary> for LibraryAlbumTrackSummaryDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumTrackSummary) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            title: value.title,
            artist: value.artist,
            track_number: value.track_number.map(f64::from),
            disc_number: value.disc_number.map(f64::from),
            file_format: value.file_format,
            bit_depth: value.bit_depth.map(f64::from),
            sample_rate: value.sample_rate.map(f64::from),
            duration_ms: optional_u64_to_js_number(value.duration_ms)?,
            availability: value.availability.into(),
            playable: value.playable,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryRoot")]
pub struct LibraryRootDto {
    pub id: String,
    pub path: String,
    pub enabled: bool,
    #[napi(use_nullable, ts_type = "number | null")]
    pub scan_generation: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub last_successful_scan_at_ms: Option<f64>,
}
impl TryFrom<LibraryRoot> for LibraryRootDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryRoot) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            path: value.path,
            enabled: value.enabled,
            scan_generation: Some(u64_to_js_number(value.scan_generation)?),
            last_successful_scan_at_ms: optional_u64_to_js_number(
                value.last_successful_scan_at_ms,
            )?,
        })
    }
}

#[napi(string_enum = "camelCase", js_name = "LibraryScanState")]
pub enum LibraryScanStateDto {
    Idle,
    Running,
    Completed,
    Cancelled,
    Failed,
}
impl From<LibraryScanState> for LibraryScanStateDto {
    fn from(value: LibraryScanState) -> Self {
        match value {
            LibraryScanState::Idle => Self::Idle,
            LibraryScanState::Running => Self::Running,
            LibraryScanState::Completed => Self::Completed,
            LibraryScanState::Cancelled => Self::Cancelled,
            LibraryScanState::Failed => Self::Failed,
        }
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryScanSnapshot")]
pub struct LibraryScanSnapshotDto {
    pub state: LibraryScanStateDto,
    #[napi(use_nullable, ts_type = "LibraryRoot | null")]
    pub current_root: Option<LibraryRootDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub discovered_count: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub inspected_count: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub indexed_count: Option<f64>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub failed_count: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub failure_code: Option<String>,
}
impl TryFrom<LibraryScanSnapshot> for LibraryScanSnapshotDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryScanSnapshot) -> Result<Self, Self::Error> {
        Ok(Self {
            state: value.state.into(),
            current_root: value.current_root.map(TryInto::try_into).transpose()?,
            discovered_count: Some(u64_to_js_number(value.discovered_count)?),
            inspected_count: Some(u64_to_js_number(value.inspected_count)?),
            indexed_count: Some(u64_to_js_number(value.indexed_count)?),
            failed_count: Some(u64_to_js_number(value.failed_count)?),
            failure_code: value.failure_code,
        })
    }
}

#[napi(
    discriminant = "status",
    discriminant_case = "camelCase",
    js_name = "LibraryStatus"
)]
pub enum LibraryStatusDto {
    Ready,
    Unavailable {
        #[napi(ts_type = "LibraryUnavailableReason")]
        reason: LibraryUnavailableReasonDto,
    },
}
#[napi(string_enum = "camelCase", js_name = "LibraryUnavailableReason")]
pub enum LibraryUnavailableReasonDto {
    StorageUnavailable,
    DatabaseOpenFailed,
    MigrationFailed,
    SchemaTooNew,
    DatabaseCorrupt,
}
impl From<LibraryUnavailableReason> for LibraryUnavailableReasonDto {
    fn from(value: LibraryUnavailableReason) -> Self {
        match value {
            LibraryUnavailableReason::StorageUnavailable => Self::StorageUnavailable,
            LibraryUnavailableReason::DatabaseOpenFailed => Self::DatabaseOpenFailed,
            LibraryUnavailableReason::MigrationFailed => Self::MigrationFailed,
            LibraryUnavailableReason::SchemaTooNew => Self::SchemaTooNew,
            LibraryUnavailableReason::DatabaseCorrupt => Self::DatabaseCorrupt,
        }
    }
}
impl From<LibraryStatus> for LibraryStatusDto {
    fn from(value: LibraryStatus) -> Self {
        match value {
            LibraryStatus::Ready => Self::Ready,
            LibraryStatus::Unavailable { reason } => Self::Unavailable {
                reason: reason.into(),
            },
        }
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryTrackPage")]
pub struct LibraryTrackPageDto {
    pub items: Vec<LibraryTrackSummaryDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub total_count: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub next_cursor: Option<String>,
}
impl TryFrom<LibraryTrackPage> for LibraryTrackPageDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryTrackPage) -> Result<Self, Self::Error> {
        Ok(Self {
            items: value
                .items
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            total_count: Some(u64_to_js_number(value.total_count)?),
            next_cursor: value.next_cursor,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumPage")]
pub struct LibraryAlbumPageDto {
    pub items: Vec<LibraryAlbumSummaryDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub total_count: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub next_cursor: Option<String>,
}
impl TryFrom<LibraryAlbumPage> for LibraryAlbumPageDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumPage) -> Result<Self, Self::Error> {
        Ok(Self {
            items: value
                .items
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            total_count: Some(u64_to_js_number(value.total_count)?),
            next_cursor: value.next_cursor,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumArtistPage")]
pub struct LibraryAlbumArtistPageDto {
    pub items: Vec<LibraryAlbumArtistSummaryDto>,
    #[napi(use_nullable, ts_type = "number | null")]
    pub total_count: Option<f64>,
    #[napi(use_nullable, ts_type = "string | null")]
    pub next_cursor: Option<String>,
}
impl TryFrom<LibraryAlbumArtistPage> for LibraryAlbumArtistPageDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumArtistPage) -> Result<Self, Self::Error> {
        Ok(Self {
            items: value
                .items
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            total_count: Some(u64_to_js_number(value.total_count)?),
            next_cursor: value.next_cursor,
        })
    }
}

#[napi(object, use_nullable = true, js_name = "LibraryAlbumTrackPage")]
pub struct LibraryAlbumTrackPageDto {
    pub items: Vec<LibraryAlbumTrackSummaryDto>,
    pub total_count: f64,
    #[napi(use_nullable, ts_type = "string | null")]
    pub next_cursor: Option<String>,
}
impl TryFrom<LibraryAlbumTrackPage> for LibraryAlbumTrackPageDto {
    type Error = NativeErrorCode;
    fn try_from(value: LibraryAlbumTrackPage) -> Result<Self, Self::Error> {
        Ok(Self {
            items: value
                .items
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            total_count: u64_to_js_number(value.total_count)?,
            next_cursor: value.next_cursor,
        })
    }
}

#[napi(string_enum = "camelCase", js_name = "ApplicationActivityKind")]
pub enum ApplicationActivityKindDto {
    LibrarySync,
}
#[napi(string_enum = "camelCase", js_name = "ApplicationActivityState")]
pub enum ApplicationActivityStateDto {
    Running,
    AttentionRequired,
}
#[napi(object, js_name = "ApplicationActivity")]
pub struct ApplicationActivityDto {
    pub id: String,
    pub kind: ApplicationActivityKindDto,
    pub state: ApplicationActivityStateDto,
}
impl From<ApplicationActivity> for ApplicationActivityDto {
    fn from(value: ApplicationActivity) -> Self {
        Self {
            id: value.id,
            kind: match value.kind {
                ApplicationActivityKind::LibrarySync => ApplicationActivityKindDto::LibrarySync,
            },
            state: match value.state {
                ApplicationActivityState::Running => ApplicationActivityStateDto::Running,
                ApplicationActivityState::AttentionRequired => {
                    ApplicationActivityStateDto::AttentionRequired
                }
            },
        }
    }
}

#[napi(
    discriminant = "event",
    discriminant_case = "camelCase",
    js_name = "BackendEvent"
)]
#[allow(clippy::enum_variant_names)]
pub enum BackendEventDto {
    PlaybackStateChanged {
        payload: PlaybackSnapshotDto,
    },
    PlaybackQueueStateChanged {
        payload: PlaybackQueueSnapshotDto,
    },
    ApplicationActivitiesChanged {
        payload: Vec<ApplicationActivityDto>,
    },
    LibraryScanStateChanged {
        payload: LibraryScanSnapshotDto,
    },
}

impl TryFrom<PlaybackSnapshot> for BackendEventDto {
    type Error = NativeErrorCode;
    fn try_from(value: PlaybackSnapshot) -> Result<Self, Self::Error> {
        Ok(Self::PlaybackStateChanged {
            payload: value.try_into()?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::{
        devices::AudioOutputSelection,
        playback::{PlaybackQueueItem, PlaybackQueueSnapshot, PlaybackRepeatMode},
    };

    #[test]
    fn rejects_integers_above_javascript_safe_boundary() {
        assert_eq!(
            u64_to_js_number(JS_MAX_SAFE_INTEGER).unwrap(),
            9_007_199_254_740_991.0
        );
        assert!(u64_to_js_number(JS_MAX_SAFE_INTEGER + 1).is_err());
        assert!(js_non_negative_integer(-1.0, "positionMs").is_err());
        assert!(js_non_negative_integer(1.5, "positionMs").is_err());
    }

    #[test]
    fn preserves_nullable_values_and_structured_event_shape() {
        let queue = PlaybackQueueSnapshot {
            revision: 2,
            current: Some(PlaybackQueueItem {
                id: "track-1".into(),
                title: "Track".into(),
                artist: None,
                duration_ms: None,
            }),
            upcoming: vec![],
            repeat_mode: PlaybackRepeatMode::Off,
            shuffle_enabled: false,
        };
        let queue_dto: PlaybackQueueSnapshotDto = queue.try_into().unwrap();
        assert_eq!(queue_dto.revision, Some(2.0));
        assert!(queue_dto.current.unwrap().artist.is_none());

        let stopped = PlaybackSnapshot::Stopped {
            revision: 3,
            file: None,
            volume: 1.0,
            muted: false,
            output_selection: AudioOutputSelection::SystemDefault,
            can_go_previous: false,
            can_go_next: false,
        };
        let event: BackendEventDto = stopped.try_into().unwrap();
        assert!(matches!(
            event,
            BackendEventDto::PlaybackStateChanged { .. }
        ));
    }
}
