//! What the worker publishes: the transport state, the queue state, and the rows that show a
//! queue entry.

use super::queue::{Queue, QueueEntry, RepeatMode};
use crate::ids::{PlaybackId, QueueItemId, TrackId};
use crate::library::Library;
use crate::library::models::TrackSummary;
use crate::player::output::AudioOutputSelection;
use crate::player::processing::{ChannelConversion, OutputProcessingPlan};
use crate::player::volume::VolumeState;

/// Fields every transport state carries.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerControls {
    pub volume: f32,
    pub muted: bool,
    pub output_selection: AudioOutputSelection,
    pub can_go_previous: bool,
    pub can_go_next: bool,
}

impl PlayerControls {
    pub(super) fn new(volume: VolumeState, output_selection: AudioOutputSelection) -> Self {
        Self {
            volume: volume.volume(),
            muted: volume.muted(),
            output_selection,
            can_go_previous: false,
            can_go_next: false,
        }
    }
}

/// Why the loaded session started.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StartedBy {
    Next,
    Previous,
    /// The player moved on by itself: the track ended, or it skipped a track.
    Auto,
    /// Any other start: play a context, play a queue item, restore the queue.
    Jump,
}

/// One queue entry as the renderer shows it: the queue's id for the entry and the track's
/// metadata. It carries no file path. The track's fields are flattened, so the renderer reads
/// `title` on a row.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    pub queue_item_id: QueueItemId,
    #[serde(flatten)]
    pub track: TrackSummary,
}

/// A loaded track: identity plus how it reaches the output device.
#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CurrentPlayback {
    pub item: QueueItem,
    /// What started this session. A seek or an output switch keeps it.
    pub started_by: StartedBy,
    pub playback_id: PlaybackId,
    pub position_ms: u64,
    /// Counts the seeks the player has completed. A change means the position jumped on
    /// purpose, so a display can react to the jump instead of guessing it from the numbers.
    pub seek_count: u64,
    pub duration_ms: Option<u64>,
    pub output_device_name: String,
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
    pub playback_id: PlaybackId,
    pub position_ms: u64,
    pub seek_count: u64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, specta::Type)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PlayerState {
    /// `item` is the last track that played, kept so the UI can still say what it was.
    Stopped {
        base: PlayerControls,
        item: Option<QueueItem>,
    },
    /// A start is reading its file or decoding its first samples. `item` is the track it starts,
    /// and there is no position yet.
    Loading {
        base: PlayerControls,
        item: QueueItem,
    },
    Playing {
        base: PlayerControls,
        session: CurrentPlayback,
    },
    Paused {
        base: PlayerControls,
        session: CurrentPlayback,
    },
    Failed {
        base: PlayerControls,
        item: Option<QueueItem>,
        error: PlaybackFailureCode,
        /// The player is moving on to the next item by itself: a skip the listener is told
        /// about, not a stop that waits for Retry.
        skipping: bool,
    },
}

impl PlayerState {
    pub fn base(&self) -> &PlayerControls {
        match self {
            Self::Stopped { base, .. }
            | Self::Loading { base, .. }
            | Self::Playing { base, .. }
            | Self::Paused { base, .. }
            | Self::Failed { base, .. } => base,
        }
    }

    /// The loaded session, whether playing or paused.
    pub fn session(&self) -> Option<&CurrentPlayback> {
        match self {
            Self::Playing { session, .. } | Self::Paused { session, .. } => Some(session),
            Self::Stopped { .. } | Self::Loading { .. } | Self::Failed { .. } => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackFailureCode {
    NoOutputDevice,
    OutputDeviceUnavailable,
    UnsupportedOutput,
    OutputFailed,
    DecodeFailed,
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
            ChannelConversion::Downmix { .. } => Self::Downmix,
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
    pub(super) fn from_plan(plan: OutputProcessingPlan) -> Self {
        Self {
            channel_conversion: plan.channel_conversion().into(),
            source_sample_rate: plan.source().sample_rate().get(),
            output_sample_rate: plan.output().sample_rate().get(),
        }
    }

    pub(super) fn resampling_active(self) -> bool {
        self.source_sample_rate != self.output_sample_rate
    }
}

/// The most upcoming items a window returns, and how many the queue state carries.
pub const UPCOMING_WINDOW: u32 = 100;
/// How many already played items the queue state carries (the most recent ones).
pub(super) const HISTORY_IN_STATE: usize = 50;

/// The rows for `entries`, read from the library in one query: `None` where the library no longer
/// has the track, or where there is no library or it cannot be read (the rows are left out of the
/// state only).
fn rows(entries: &[QueueEntry], library: Option<&Library>) -> Vec<Option<QueueItem>> {
    let ids: Vec<TrackId> = entries.iter().map(|entry| entry.track_id).collect();
    let resolved = library
        .map(|library| library.playable_tracks(&ids))
        .and_then(Result::ok)
        .unwrap_or_else(|| vec![None; ids.len()]);
    entries
        .iter()
        .zip(resolved)
        .map(|(entry, track)| {
            track.map(|track| QueueItem {
                queue_item_id: entry.id,
                track: track.track,
            })
        })
        .collect()
}

/// The queue as the renderer mirrors it: the current item, the last few played, the first
/// upcoming ones, and how many there are in all. The upcoming entries stay on the backend and
/// are read a window at a time, so a library-sized queue never crosses the IPC boundary in one
/// piece. `version` counts the queue's changes; a window carries the version it was cut from.
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueState {
    pub version: u64,
    pub current: Option<QueueItem>,
    /// The most recently played items, oldest first.
    pub history: Vec<QueueItem>,
    pub upcoming: Vec<QueueItem>,
    pub upcoming_count: u32,
    pub repeat_mode: RepeatMode,
    pub shuffle_enabled: bool,
}

/// A slice of the upcoming list, tagged with the queue version it was cut from.
#[derive(Debug, Clone, serde::Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueueWindow {
    pub version: u64,
    pub offset: u32,
    pub items: Vec<QueueItem>,
}

impl QueueState {
    /// Nothing queued. The version is the one the worker publishes with.
    pub fn empty(repeat_mode: RepeatMode, shuffle_enabled: bool) -> Self {
        Self {
            version: 0,
            current: None,
            history: Vec::new(),
            upcoming: Vec::new(),
            upcoming_count: 0,
            repeat_mode,
            shuffle_enabled,
        }
    }

    /// Reads the rows of the current item, the last few played and the first upcoming ones. The
    /// version is left at 0 for the worker to set.
    pub(super) fn of(queue: &Queue, library: Option<&Library>) -> Self {
        let history = queue.history();
        let shown_history = &history[history.len().saturating_sub(HISTORY_IN_STATE)..];
        let upcoming = queue.upcoming();
        let shown_upcoming = &upcoming[..(UPCOMING_WINDOW as usize).min(upcoming.len())];
        let mut shown: Vec<QueueEntry> = shown_history.to_vec();
        shown.extend(queue.current().cloned());
        shown.extend_from_slice(shown_upcoming);
        let shown_rows = rows(&shown, library);
        let (history_rows, rest) = shown_rows.split_at(shown_history.len());
        let (current_row, upcoming_rows) = rest.split_at(usize::from(queue.current().is_some()));
        Self {
            version: 0,
            current: current_row.first().cloned().flatten(),
            history: history_rows.iter().flatten().cloned().collect(),
            upcoming: upcoming_rows.iter().flatten().cloned().collect(),
            upcoming_count: u32::try_from(upcoming.len()).unwrap_or(u32::MAX),
            repeat_mode: queue.repeat(),
            shuffle_enabled: queue.shuffle(),
        }
    }
}

impl QueueWindow {
    /// Upcoming rows from `offset`, at most `limit` (and never more than `UPCOMING_WINDOW`), read
    /// from the library now. Tracks the library no longer has are left out. `version` is the queue
    /// version the queue is at.
    pub(super) fn of(
        queue: &Queue,
        version: u64,
        offset: usize,
        limit: usize,
        library: Option<&Library>,
    ) -> Self {
        let upcoming = queue.upcoming();
        let start = offset.min(upcoming.len());
        let end = start
            .saturating_add(limit.min(UPCOMING_WINDOW as usize))
            .min(upcoming.len());
        Self {
            version,
            offset: u32::try_from(start).unwrap_or(u32::MAX),
            items: rows(&upcoming[start..end], library)
                .into_iter()
                .flatten()
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn processing_info_derives_resampling_from_rates() {
        let equal = PlaybackProcessingInfo {
            channel_conversion: PlaybackChannelConversion::None,
            source_sample_rate: 44_100,
            output_sample_rate: 44_100,
        };
        let different = PlaybackProcessingInfo {
            source_sample_rate: 44_100,
            output_sample_rate: 48_000,
            ..equal
        };
        assert!(!equal.resampling_active());
        assert!(different.resampling_active());
    }
}
