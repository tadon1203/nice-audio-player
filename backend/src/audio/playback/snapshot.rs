//! What the worker publishes: the transport snapshot and the queue snapshot.

use super::item::PlaybackItem;
use super::queue::{PlaybackQueue, PlaybackRepeatMode, QueueEntry};
use super::resolver::TrackResolver;
use crate::audio::devices::{AudioOutputDeviceIdentity, AudioOutputSelection};
use crate::audio::output_processing::{ChannelConversion, OutputProcessingPlan};
use crate::audio::volume::VolumeState;
use crate::library::artwork::ArtworkRef;
use crate::library::store::PlayableTrack;
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
    /// The loaded file's format (its extension when the library has none), bit depth and
    /// average bitrate: the start of the signal path.
    pub source_format: String,
    pub source_bit_depth: Option<u32>,
    pub source_bitrate_kbps: Option<u32>,
    pub source_sample_rate: u32,
    pub output_sample_rate: u32,
    pub resampling_active: bool,
}

/// Where the loaded track is. Sent on its own, far more often than the snapshot, so a tick
/// never carries (or re-renders) the rest of the playback state.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackPosition {
    pub playback_id: String,
    pub position_ms: u64,
    pub seek_revision: u64,
}

impl ActiveSession {
    pub fn position(&self) -> PlaybackPosition {
        PlaybackPosition {
            playback_id: self.playback_id.clone(),
            position_ms: self.position_ms,
            seek_revision: self.seek_revision,
        }
    }
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
        /// The player is moving on to the next item by itself: a skip the listener is told
        /// about, not a stop that waits for Retry.
        skipping: bool,
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
    pub track_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub artwork: Option<ArtworkRef>,
    pub duration_ms: Option<u64>,
}

impl PlaybackQueueItem {
    fn of(entry: &QueueEntry, track: &PlayableTrack) -> Self {
        Self {
            id: entry.queue_item_id(),
            track_id: track.track_id.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            album: track.album.clone(),
            artwork: track.artwork.clone(),
            duration_ms: track.duration_ms,
        }
    }
}

/// How many upcoming items a snapshot carries; the rest are read a window at a time.
pub const UPCOMING_IN_SNAPSHOT: usize = 200;
/// How many already played items a snapshot carries (the most recent ones).
pub const HISTORY_IN_SNAPSHOT: usize = 50;
/// The most items one window read returns.
pub const MAX_QUEUE_WINDOW: usize = 200;

/// The queue's play order as ids, shared with the queue itself, and the means to read the
/// tracks of any part of it: a snapshot copies no item, whatever the queue's length.
#[derive(Clone)]
struct QueueList {
    entries: Arc<Vec<QueueEntry>>,
    /// Where the upcoming items start.
    upcoming_from: usize,
    tracks: Arc<TrackResolver>,
}

impl QueueList {
    /// The rows for `entries`, read in one go: `None` where the library no longer has the track.
    fn rows(&self, entries: &[QueueEntry]) -> Vec<Option<PlaybackQueueItem>> {
        let ids: Vec<&str> = entries.iter().map(|entry| &*entry.track_id).collect();
        entries
            .iter()
            .zip(self.tracks.resolve(&ids))
            .map(|(entry, track)| Some(PlaybackQueueItem::of(entry, &track?)))
            .collect()
    }

    fn upcoming(&self) -> &[QueueEntry] {
        self.entries.get(self.upcoming_from..).unwrap_or_default()
    }
}

impl std::fmt::Debug for QueueList {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("QueueList")
            .field("len", &self.entries.len())
            .finish()
    }
}

impl PartialEq for QueueList {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.entries, &other.entries) && self.upcoming_from == other.upcoming_from
    }
}

impl Eq for QueueList {}

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
    /// The queue before the last replacement can be put back.
    pub can_restore_previous: bool,
    #[serde(skip)]
    #[specta(skip)]
    list: Option<QueueList>,
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
    /// Nothing queued.
    pub fn empty(revision: u64, repeat_mode: PlaybackRepeatMode, shuffle_enabled: bool) -> Self {
        Self {
            revision,
            current: None,
            history: Vec::new(),
            history_count: 0,
            upcoming: Vec::new(),
            upcoming_count: 0,
            repeat_mode,
            shuffle_enabled,
            can_restore_previous: false,
            list: None,
        }
    }

    /// Reads the tracks of the current item, the last few played and the first upcoming ones;
    /// everything else stays ids until a window asks for it.
    pub fn of(
        revision: u64,
        queue: &PlaybackQueue,
        tracks: &Arc<TrackResolver>,
        can_restore_previous: bool,
    ) -> Self {
        let list = QueueList {
            entries: Arc::clone(queue.play_order()),
            upcoming_from: queue.position().saturating_add(1),
            tracks: Arc::clone(tracks),
        };
        let history = queue.history();
        let shown_history = &history[history.len().saturating_sub(HISTORY_IN_SNAPSHOT)..];
        let upcoming = queue.upcoming();
        let shown_upcoming = &upcoming[..upcoming.len().min(UPCOMING_IN_SNAPSHOT)];
        let mut shown: Vec<QueueEntry> = shown_history.to_vec();
        shown.extend(queue.current().cloned());
        shown.extend_from_slice(shown_upcoming);
        let rows = list.rows(&shown);
        let (history_rows, rest) = rows.split_at(shown_history.len());
        let (current_row, upcoming_rows) = rest.split_at(usize::from(queue.current().is_some()));
        Self {
            revision,
            current: current_row.first().cloned().flatten(),
            history: history_rows.iter().flatten().cloned().collect(),
            history_count: u32::try_from(history.len()).unwrap_or(u32::MAX),
            upcoming: upcoming_rows.iter().flatten().cloned().collect(),
            upcoming_count: u32::try_from(upcoming.len()).unwrap_or(u32::MAX),
            repeat_mode: queue.repeat(),
            shuffle_enabled: queue.shuffle(),
            can_restore_previous,
            list: Some(list),
        }
    }

    /// Upcoming items from `offset`, at most `limit` (and never more than `MAX_QUEUE_WINDOW`),
    /// read from the library now. Tracks the library no longer has are left out.
    pub fn window(&self, offset: usize, limit: usize) -> PlaybackQueueWindow {
        let Some(list) = &self.list else {
            return PlaybackQueueWindow {
                revision: self.revision,
                offset: 0,
                items: Vec::new(),
            };
        };
        let upcoming = list.upcoming();
        let start = offset.min(upcoming.len());
        let end = start
            .saturating_add(limit.min(MAX_QUEUE_WINDOW))
            .min(upcoming.len());
        PlaybackQueueWindow {
            revision: self.revision,
            offset: u32::try_from(start).unwrap_or(u32::MAX),
            items: list
                .rows(&upcoming[start..end])
                .into_iter()
                .flatten()
                .collect(),
        }
    }
}
