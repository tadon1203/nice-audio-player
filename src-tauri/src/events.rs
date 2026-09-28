use std::{
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread,
};

use backend::{
    activity::ApplicationActivity,
    app::BackendApp,
    audio::playback::{PlaybackQueueSnapshot, PlaybackSnapshot},
    events::{BackendEvent, EventSink},
    settings::Settings,
};
use serde::Serialize;
use tauri::Emitter;

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    #[serde(rename = "playbackStateChanged")]
    Playback(Box<PlaybackSnapshot>),
    #[serde(rename = "playbackQueueStateChanged")]
    PlaybackQueue(PlaybackQueueSnapshot),
    #[serde(rename = "applicationActivitiesChanged")]
    ApplicationActivities(Vec<ApplicationActivity>),
    #[serde(rename = "libraryScanStateChanged")]
    LibraryScan(backend::library::models::LibraryScanSnapshot),
    #[serde(rename = "waveformReady")]
    WaveformReady { path: String },
    #[serde(rename = "settingsChanged")]
    Settings(Settings),
}

impl AppEvent {
    fn name(&self) -> &'static str {
        match self {
            Self::Playback(_) => "playbackStateChanged",
            Self::PlaybackQueue(_) => "playbackQueueStateChanged",
            Self::ApplicationActivities(_) => "applicationActivitiesChanged",
            Self::LibraryScan(_) => "libraryScanStateChanged",
            Self::WaveformReady { .. } => "waveformReady",
            Self::Settings(_) => "settingsChanged",
        }
    }
}

/// The backend's event sink. It only queues; `start_dispatcher` delivers, so a service never
/// waits on the webview.
pub struct TauriEventSink {
    sender: Sender<BackendEvent>,
}

impl EventSink for TauriEventSink {
    fn emit(&self, event: BackendEvent) {
        let _ = self.sender.send(event);
    }
}

pub fn event_channel() -> (Arc<TauriEventSink>, Receiver<BackendEvent>) {
    let (sender, receiver) = mpsc::channel();
    (Arc::new(TauriEventSink { sender }), receiver)
}

/// Which state changed since the last delivery. Events carry no state, so any number of
/// changes to one thing become a single event with its latest value.
#[derive(Default)]
struct PendingEvents {
    playback: bool,
    queue: bool,
    activities: bool,
    library_scan: bool,
    settings: bool,
    waveforms: Vec<String>,
}

impl PendingEvents {
    fn add(&mut self, event: BackendEvent) {
        match event {
            BackendEvent::PlaybackChanged => self.playback = true,
            BackendEvent::PlaybackQueueChanged => self.queue = true,
            BackendEvent::ActivitiesChanged => self.activities = true,
            BackendEvent::LibraryScanChanged => self.library_scan = true,
            BackendEvent::SettingsChanged => self.settings = true,
            BackendEvent::WaveformReady { path } => {
                if !self.waveforms.contains(&path) {
                    self.waveforms.push(path);
                }
            }
        }
    }

    fn into_app_events(self, backend: &BackendApp) -> Vec<AppEvent> {
        let mut events = Vec::new();
        if self.playback {
            events.push(AppEvent::Playback(Box::new(backend.playback.snapshot())));
        }
        if self.queue {
            events.push(AppEvent::PlaybackQueue(backend.playback.queue_snapshot()));
        }
        if self.library_scan {
            events.push(AppEvent::LibraryScan(backend.library.handle().scan_state()));
        }
        if self.activities {
            events.push(AppEvent::ApplicationActivities(
                backend.activities.handle().snapshot(),
            ));
        }
        if self.settings {
            events.push(AppEvent::Settings(backend.settings.get()));
        }
        events.extend(
            self.waveforms
                .into_iter()
                .map(|path| AppEvent::WaveformReady { path }),
        );
        events
    }
}

/// Delivers queued backend events to the webview on the `app:event` channel.
pub fn start_dispatcher(
    app: &tauri::AppHandle,
    backend: &Arc<BackendApp>,
    receiver: Receiver<BackendEvent>,
) {
    let app = app.clone();
    let backend = Arc::clone(backend);
    thread::spawn(move || {
        while let Ok(first) = receiver.recv() {
            let mut pending = PendingEvents::default();
            pending.add(first);
            while let Ok(event) = receiver.try_recv() {
                pending.add(event);
            }
            for event in pending.into_app_events(&backend) {
                let name = event.name();
                if app.emit("app:event", event).is_err() {
                    log::error!("ipc.event_emit_failed event_name={name}");
                }
            }
        }
    });
}
