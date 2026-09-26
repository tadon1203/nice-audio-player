use std::{
    sync::{mpsc::Receiver, Arc},
    thread,
};

use backend::{
    activity::ApplicationActivity,
    app::BackendApp,
    audio::playback::{PlaybackQueueSnapshot, PlaybackSnapshot},
};
use serde::Serialize;
use tauri::Emitter;

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "payload", rename_all = "camelCase")]
pub enum AppEvent {
    #[serde(rename = "playbackStateChanged")]
    Playback(PlaybackSnapshot),
    #[serde(rename = "playbackQueueStateChanged")]
    PlaybackQueue(PlaybackQueueSnapshot),
    #[serde(rename = "applicationActivitiesChanged")]
    ApplicationActivities(Vec<ApplicationActivity>),
    #[serde(rename = "libraryScanStateChanged")]
    LibraryScan(backend::library::models::LibraryScanSnapshot),
}

impl AppEvent {
    fn name(&self) -> &'static str {
        match self {
            Self::Playback(_) => "playbackStateChanged",
            Self::PlaybackQueue(_) => "playbackQueueStateChanged",
            Self::ApplicationActivities(_) => "applicationActivitiesChanged",
            Self::LibraryScan(_) => "libraryScanStateChanged",
        }
    }
}

/// Emits `build()` on the `app:event` channel every time `receiver` signals a change.
fn forward<F>(app: &tauri::AppHandle, receiver: Option<Receiver<()>>, build: F)
where
    F: Fn() -> AppEvent + Send + 'static,
{
    let Some(receiver) = receiver else { return };
    let app = app.clone();
    thread::spawn(move || {
        while receiver.recv().is_ok() {
            let event = build();
            let name = event.name();
            if app.emit("app:event", event).is_err() {
                log::error!("ipc.event_emit_failed event_name={name}");
            }
        }
    });
}

pub fn forward_events(app: &tauri::AppHandle, backend: &Arc<BackendApp>) {
    let b = Arc::clone(backend);
    forward(
        app,
        backend.playback.take_state_changed_receiver(),
        move || AppEvent::Playback(b.playback.snapshot()),
    );
    let b = Arc::clone(backend);
    forward(
        app,
        backend.playback.take_queue_state_changed_receiver(),
        move || AppEvent::PlaybackQueue(b.playback.queue_snapshot()),
    );
    let b = Arc::clone(backend);
    forward(
        app,
        backend.library.take_scan_state_changed_receiver(),
        move || AppEvent::LibraryScan(b.library.handle().scan_state()),
    );
    let b = Arc::clone(backend);
    forward(app, backend.activities.take_changed_receiver(), move || {
        AppEvent::ApplicationActivities(b.activities.handle().snapshot())
    });
}
