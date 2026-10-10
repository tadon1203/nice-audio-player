//! How backend services tell the host that something changed.
//!
//! Services hold a `SharedEventSink` and emit a `BackendEvent`; they never know about Tauri or
//! about each other. Events carry no state: the host reads the current snapshot when it
//! delivers one, so a burst of changes can collapse into a single delivery.

use std::sync::Arc;

/// Declaration order is delivery order: a state change reaches the host before the position
/// that belongs to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum BackendEvent {
    PlaybackChanged,
    /// The playing position moved; the snapshot did not.
    PlaybackPositionChanged,
    PlaybackQueueChanged,
    LibraryScanChanged,
    /// A waveform became available or was refined for the loaded track.
    WaveformChanged,
    SettingsChanged,
}

impl BackendEvent {
    /// The name logs use for this event.
    pub fn name(self) -> &'static str {
        match self {
            Self::PlaybackChanged => "playback_changed",
            Self::PlaybackPositionChanged => "playback_position_changed",
            Self::PlaybackQueueChanged => "playback_queue_changed",
            Self::LibraryScanChanged => "library_scan_changed",
            Self::WaveformChanged => "waveform_changed",
            Self::SettingsChanged => "settings_changed",
        }
    }
}

/// Receives events on whichever thread produced them, so it must return quickly.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: BackendEvent);
}

pub type SharedEventSink = Arc<dyn EventSink>;

/// Drops every event, for tests and headless use.
pub struct NullEventSink;

impl EventSink for NullEventSink {
    fn emit(&self, _event: BackendEvent) {}
}

pub fn null_event_sink() -> SharedEventSink {
    Arc::new(NullEventSink)
}

/// A sink bound to one event, for code that only ever announces "it changed".
#[derive(Clone)]
pub struct Notifier {
    sink: SharedEventSink,
    event: BackendEvent,
}

impl Notifier {
    pub fn new(sink: SharedEventSink, event: BackendEvent) -> Self {
        Self { sink, event }
    }

    pub fn notify(&self) {
        self.sink.emit(self.event);
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use std::sync::Mutex;

    /// Remembers what was emitted.
    #[derive(Default)]
    pub(crate) struct RecordingEventSink {
        events: Mutex<Vec<BackendEvent>>,
    }

    impl RecordingEventSink {
        pub(crate) fn shared() -> (Arc<Self>, SharedEventSink) {
            let sink = Arc::new(Self::default());
            (Arc::clone(&sink), sink)
        }

        pub(crate) fn events(&self) -> Vec<BackendEvent> {
            self.events.lock().expect("recorded events").clone()
        }
    }

    impl EventSink for RecordingEventSink {
        fn emit(&self, event: BackendEvent) {
            self.events.lock().expect("recorded events").push(event);
        }
    }
}
