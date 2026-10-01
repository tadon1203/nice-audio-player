//! What the worker publishes: the transport snapshot and the queue snapshot.

use super::item::PlaybackItem;
use super::queue::{PlaybackQueue, PlaybackRepeatMode};
use crate::audio::devices::{AudioOutputDeviceIdentity, AudioOutputSelection};
use crate::audio::output_processing::{ChannelConversion, OutputProcessingPlan};
use crate::audio::volume::VolumeState;
use crate::library::artwork::ArtworkRef;
use std::sync::Arc;

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
    /// Counts the seeks the player has completed. A change means the position jumped on
    /// purpose, so a display can react to the jump instead of guessing it from the numbers.
    pub seek_revision: u64,
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
    Downmix,
}

impl From<ChannelConversion> for PlaybackChannelConversion {
    fn from(value: ChannelConversion) -> Self {
        match value {
            ChannelConversion::None => Self::None,
            ChannelConversion::MonoToStereo => Self::MonoToStereo,
            ChannelConversion::StereoToMono => Self::StereoToMono,
            ChannelConversion::Downmix => Self::Downmix,
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

/// How many upcoming items a snapshot carries; the rest are read a window at a time.
pub const UPCOMING_IN_SNAPSHOT: usize = 200;
/// How many already played items a snapshot carries (the most recent ones).
pub const HISTORY_IN_SNAPSHOT: usize = 50;
/// The most items one window read returns.
pub const MAX_QUEUE_WINDOW: usize = 200;

/// The whole queue in display form, kept on the backend so a snapshot can stay small.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct QueueLists {
    upcoming: Vec<PlaybackQueueItem>,
}

/// The queue as the renderer mirrors it: the current item, the last few played, the first
/// upcoming ones, and how many there are in all. Longer queues are read with `window`, so a
/// library-sized queue never crosses the IPC boundary in one piece.
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackQueueSnapshot {
    pub revision: u64,
    pub current: Option<PlaybackQueueItem>,
    /// The most recently played items, oldest first.
    pub history: Vec<PlaybackQueueItem>,
    pub history_count: u32,
    pub upcoming: Vec<PlaybackQueueItem>,
    pub upcoming_count: u32,
    pub repeat_mode: PlaybackRepeatMode,
    pub shuffle_enabled: bool,
    #[serde(skip)]
    #[specta(skip)]
    lists: Arc<QueueLists>,
}

/// A slice of the upcoming list, tagged with the queue revision it was cut from.
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackQueueWindow {
    pub revision: u64,
    pub offset: u32,
    pub items: Vec<PlaybackQueueItem>,
}

impl PlaybackQueueSnapshot {
    pub fn of(revision: u64, queue: &PlaybackQueue) -> Self {
        let upcoming: Vec<PlaybackQueueItem> = queue
            .upcoming()
            .iter()
            .map(PlaybackQueueItem::from)
            .collect();
        let history = queue.history();
        Self {
            revision,
            current: queue.current().map(PlaybackQueueItem::from),
            history: history[history.len().saturating_sub(HISTORY_IN_SNAPSHOT)..]
                .iter()
                .map(PlaybackQueueItem::from)
                .collect(),
            history_count: u32::try_from(history.len()).unwrap_or(u32::MAX),
            upcoming: upcoming
                .iter()
                .take(UPCOMING_IN_SNAPSHOT)
                .cloned()
                .collect(),
            upcoming_count: u32::try_from(upcoming.len()).unwrap_or(u32::MAX),
            repeat_mode: queue.repeat(),
            shuffle_enabled: queue.shuffle(),
            lists: Arc::new(QueueLists { upcoming }),
        }
    }

    /// Upcoming items from `offset`, at most `limit` (and never more than `MAX_QUEUE_WINDOW`).
    pub fn window(&self, offset: usize, limit: usize) -> PlaybackQueueWindow {
        let all = &self.lists.upcoming;
        let start = offset.min(all.len());
        let end = start
            .saturating_add(limit.min(MAX_QUEUE_WINDOW))
            .min(all.len());
        PlaybackQueueWindow {
            revision: self.revision,
            offset: u32::try_from(start).unwrap_or(u32::MAX),
            items: all[start..end].to_vec(),
        }
    }
}
