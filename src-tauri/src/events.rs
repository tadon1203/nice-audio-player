use std::{
    collections::BTreeSet,
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread,
};

use backend::{
    activity::ApplicationActivity,
    app::BackendApp,
    audio::{
        playback::{PlaybackPosition, PlaybackQueueSnapshot, PlaybackSnapshot},
        waveform::PlaybackWaveform,
    },
    events::{BackendEvent, EventSink},
    settings::AppearanceSettings,
};
use serde::Serialize;
use tauri::Emitter;

use crate::media_controls::MediaControlsLink;

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    #[serde(rename = "playbackStateChanged")]
    Playback(Box<PlaybackSnapshot>),
    #[serde(rename = "playbackPositionChanged")]
    PlaybackPosition(PlaybackPosition),
    #[serde(rename = "playbackQueueStateChanged")]
    PlaybackQueue(PlaybackQueueSnapshot),
    #[serde(rename = "applicationActivitiesChanged")]
    ApplicationActivities(Vec<ApplicationActivity>),
    #[serde(rename = "libraryScanStateChanged")]
    LibraryScan(backend::library::models::LibraryScanSnapshot),
    /// The loaded track's waveform, whenever a better one is ready.
    #[serde(rename = "waveformChanged")]
    Waveform(PlaybackWaveform),
    #[serde(rename = "settingsChanged")]
    Settings(AppearanceSettings),
}

/// Reads the state a backend event announces, or `None` when there is nothing to tell. Events
/// carry no state, so this is the one place each event meets its payload.
fn read(event: BackendEvent, backend: &BackendApp) -> Option<AppEvent> {
    Some(match event {
        BackendEvent::PlaybackChanged => AppEvent::Playback(Box::new(backend.playback.snapshot())),
        BackendEvent::PlaybackPositionChanged => {
            AppEvent::PlaybackPosition(backend.playback.position()?)
        }
        BackendEvent::PlaybackQueueChanged => {
            AppEvent::PlaybackQueue(backend.playback.queue_snapshot())
        }
        BackendEvent::ActivitiesChanged => {
            AppEvent::ApplicationActivities(backend.activities.handle().snapshot())
        }
        BackendEvent::LibraryScanChanged => AppEvent::LibraryScan(backend.library_scan_state()),
        BackendEvent::WaveformChanged => AppEvent::Waveform(backend.ready_playback_waveform()?),
        BackendEvent::SettingsChanged => AppEvent::Settings(backend.settings.appearance()),
    })
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

/// Delivers queued backend events to the webview on the `app:event` channel.
pub fn start_dispatcher(
    app: &tauri::AppHandle,
    backend: &Arc<BackendApp>,
    receiver: Receiver<BackendEvent>,
    media_controls: Option<MediaControlsLink>,
) {
    let app = app.clone();
    let backend = Arc::clone(backend);
    thread::spawn(move || {
        while let Ok(first) = receiver.recv() {
            // Which events happened since the last delivery: any number of one kind become a
            // single event with its latest value, in the order the variants are declared.
            let mut pending = BTreeSet::from([first]);
            pending.extend(receiver.try_iter());
            for event in pending {
                let Some(payload) = read(event, &backend) else {
                    continue;
                };
                if let (AppEvent::Playback(snapshot), Some(controls)) = (&payload, &media_controls)
                {
                    controls.playback_changed(snapshot);
                }
                if app.emit("app:event", payload).is_err() {
                    log::error!("ipc.event_emit_failed event_name={}", event.name());
                }
            }
        }
    });
}
