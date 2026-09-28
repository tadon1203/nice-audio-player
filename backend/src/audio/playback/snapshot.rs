//! What the worker publishes: the transport snapshot and the queue snapshot.

use super::item::PlaybackItem;
use super::queue::{PlaybackQueue, PlaybackRepeatMode};
use crate::audio::devices::{AudioOutputDeviceIdentity, AudioOutputSelection};
use crate::audio::output_processing::{ChannelConversion, OutputProcessingPlan};
use crate::audio::volume::VolumeState;
use crate::media::artwork::ArtworkRef;

/// Fields every transport state carries.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotBase {
    pub revision: u64,
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub can_go_previous: bool,
    pub can_go_next: bool,
}

impl SnapshotBase {
    pub(super) fn new(volume: VolumeState, output_selection: AudioOutputSelection) -> Self {
        Self {
            revision: 0,
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
            can_go_previous: false,
            can_go_next: false,
        }
    }
}

/// A loaded track: identity plus how it reaches the output device.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub item: PlaybackItem,
    pub playback_id: String,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub output_device: AudioOutputDeviceIdentity,
    pub channel_conversion: PlaybackChannelConversion,
    pub source_sample_rate: u32,
    pub output_sample_rate: u32,
    pub resampling_active: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackSnapshot {
    /// `item` is the last track that played, kept so the UI can still say what it was.
    Stopped {
        base: SnapshotBase,
        item: Option<PlaybackItem>,
    },
    Playing {
        base: SnapshotBase,
        session: ActiveSession,
    },
    Paused {
        base: SnapshotBase,
        session: ActiveSession,
    },
    Failed {
        base: SnapshotBase,
        item: Option<PlaybackItem>,
        playback_id: Option<String>,
        error: PlaybackFailureCode,
    },
}

impl PlaybackSnapshot {
    pub fn base(&self) -> &SnapshotBase {
        match self {
            Self::Stopped { base, .. }
            | Self::Playing { base, .. }
            | Self::Paused { base, .. }
            | Self::Failed { base, .. } => base,
        }
    }

    pub(super) fn base_mut(&mut self) -> &mut SnapshotBase {
        match self {
            Self::Stopped { base, .. }
            | Self::Playing { base, .. }
            | Self::Paused { base, .. }
            | Self::Failed { base, .. } => base,
        }
    }

    pub fn revision(&self) -> u64 {
        self.base().revision
    }

    /// The loaded session, whether playing or paused.
    pub fn session(&self) -> Option<&ActiveSession> {
        match self {
            Self::Playing { session, .. } | Self::Paused { session, .. } => Some(session),
            Self::Stopped { .. } | Self::Failed { .. } => None,
        }
    }

    /// The item loaded for playback, whether playing or paused.
    pub fn active_item(&self) -> Option<&PlaybackItem> {
        self.session().map(|session| &session.item)
    }

    pub(super) fn with_volume(mut self, volume: VolumeState) -> Self {
        let base = self.base_mut();
        base.volume = volume.volume();
        base.muted = volume.muted();
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackFailureCode {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackChannelConversion {
    None,
    MonoToStereo,
    StereoToMono,
}

impl From<ChannelConversion> for PlaybackChannelConversion {
    fn from(value: ChannelConversion) -> Self {
        match value {
            ChannelConversion::None => Self::None,
            ChannelConversion::MonoToStereo => Self::MonoToStereo,
            ChannelConversion::StereoToMono => Self::StereoToMono,
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub(super) struct PlaybackProcessingInfo {
    pub channel_conversion: PlaybackChannelConversion,
    pub source_sample_rate: u32,
    pub output_sample_rate: u32,
}

impl PlaybackProcessingInfo {
    pub fn from_plan(plan: OutputProcessingPlan) -> Self {
        Self {
            channel_conversion: plan.channel_conversion().into(),
            source_sample_rate: plan.source().sample_rate().get(),
            output_sample_rate: plan.output().sample_rate().get(),
        }
    }

    pub fn resampling_active(self) -> bool {
        self.source_sample_rate != self.output_sample_rate
    }
}

/// A queue entry as the queue panel shows it; the file path stays in the backend.
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackQueueItem {
    pub id: String,
    pub track_id: Option<String>,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
}

impl From<&PlaybackItem> for PlaybackQueueItem {
    fn from(item: &PlaybackItem) -> Self {
        Self {
            id: item.queue_item_id.clone(),
            track_id: item.track_id.clone(),
            title: item.title.clone(),
            artist: item.artist.clone(),
            album: item.album.clone(),
            artwork: item.artwork.clone(),
            duration_ms: item.duration_ms,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackQueueSnapshot {
    pub revision: u64,
    pub current: Option<PlaybackQueueItem>,
    pub upcoming: Vec<PlaybackQueueItem>,
    pub repeat_mode: PlaybackRepeatMode,
    pub shuffle_enabled: bool,
}

impl PlaybackQueueSnapshot {
    pub fn of(revision: u64, queue: &PlaybackQueue) -> Self {
        Self {
            revision,
            current: queue.current().map(PlaybackQueueItem::from),
            upcoming: queue
                .upcoming()
                .iter()
                .map(PlaybackQueueItem::from)
                .collect(),
            repeat_mode: queue.repeat(),
            shuffle_enabled: queue.shuffle(),
        }
    }
}
