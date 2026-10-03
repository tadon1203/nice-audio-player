//! The Windows system media controls: the media keys, the media overlay and the lock screen show
//! and drive the app's Playback. Controls go through the same service handle as the UI, so they
//! follow the same rules; nothing here keeps playback state of its own.

use backend::audio::playback::PlaybackSnapshot;

/// What the overlay shows about the loaded track.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Track {
    /// The playback it belongs to; the overlay's text and cover change only when this does.
    key: String,
    title: String,
    artist: String,
    album: String,
    /// The thumbnail's path below the data directory, or the original's before one exists.
    cover: Option<Cover>,
    duration_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Cover {
    thumbnail: String,
    original: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    /// Nothing plays: idle, or failed. The overlay must not keep saying "playing".
    Stopped,
    Paused {
        position_ms: u64,
    },
    Playing {
        position_ms: u64,
    },
}

/// What the overlay should show for `snapshot`. A track is named only while one is loaded.
fn overlay_of(snapshot: &PlaybackSnapshot) -> (Option<Track>, Status) {
    let Some(session) = snapshot.session() else {
        return (None, Status::Stopped);
    };
    let item = &session.item;
    let track = Track {
        key: session.playback_id.clone(),
        title: item.title.clone(),
        artist: item.artist.clone().unwrap_or_default(),
        album: item.album.clone().unwrap_or_default(),
        cover: item.artwork.as_ref().and_then(|artwork| {
            let path = backend::library::artwork::ArtworkPath::parse(&artwork.relative_path)?;
            Some(Cover {
                thumbnail: path.thumbnail(),
                original: artwork.relative_path.clone(),
            })
        }),
        duration_ms: session.duration_ms,
    };
    let position_ms = session.position_ms;
    let status = if matches!(snapshot, PlaybackSnapshot::Playing { .. }) {
        Status::Playing { position_ms }
    } else {
        Status::Paused { position_ms }
    };
    (Some(track), status)
}

#[cfg(windows)]
pub use windows_impl::{start, MediaControlsLink};

#[cfg(not(windows))]
pub use other_impl::{start, MediaControlsLink};

#[cfg(windows)]
mod windows_impl {
    use std::{
        ffi::c_void,
        path::{Path, PathBuf},
        sync::{mpsc, Arc},
        thread,
        time::Duration,
    };

    use backend::{app::BackendApp, audio::playback::PlaybackSnapshot};
    use souvlaki::{
        MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
        PlatformConfig,
    };

    use super::{overlay_of, Status, Track};

    /// A transparent pixel, shown for a track without artwork so the previous cover does not
    /// stay up.
    const NO_COVER: &[u8] = include_bytes!("../media-no-cover.png");

    /// The way the playback side tells the overlay what changed.
    pub struct MediaControlsLink(mpsc::Sender<PlaybackSnapshot>);

    impl MediaControlsLink {
        pub fn playback_changed(&self, snapshot: &PlaybackSnapshot) {
            let _ = self.0.send(snapshot.clone());
        }
    }

    /// Registers the controls for the window `hwnd` names. They live on a thread of their own,
    /// because showing a cover reads a file. Without controls the app plays as before.
    pub fn start(
        hwnd: *mut c_void,
        backend: Arc<BackendApp>,
        data_dir: PathBuf,
    ) -> Option<MediaControlsLink> {
        let (sender, receiver) = mpsc::channel();
        let hwnd = hwnd as usize;
        thread::Builder::new()
            .name("media-controls".into())
            .spawn(move || run(hwnd as *mut c_void, &backend, &data_dir, &receiver))
            .ok()?;
        Some(MediaControlsLink(sender))
    }

    fn run(
        hwnd: *mut c_void,
        backend: &Arc<BackendApp>,
        data_dir: &Path,
        snapshots: &mpsc::Receiver<PlaybackSnapshot>,
    ) {
        let mut controls = match MediaControls::new(PlatformConfig {
            dbus_name: "nice_audio_player",
            display_name: "Nice Audio Player",
            hwnd: Some(hwnd),
        }) {
            Ok(controls) => controls,
            Err(error) => {
                log::warn!("media_controls.unavailable cause={error}");
                return;
            }
        };
        let commands = Arc::clone(backend);
        if let Err(error) = controls.attach(move |event| command(&commands, event)) {
            log::warn!("media_controls.attach_failed cause={error}");
            return;
        }
        let no_cover = data_dir.join("media-controls-no-cover.png");
        if std::fs::write(&no_cover, NO_COVER).is_err() {
            log::warn!("media_controls.no_cover_unwritable");
        }
        let mut shown: Option<String> = None;
        while let Ok(mut snapshot) = snapshots.recv() {
            // Only the newest state is worth showing.
            while let Ok(newer) = snapshots.try_recv() {
                snapshot = newer;
            }
            let (track, status) = overlay_of(&snapshot);
            if let Some(track) = track {
                if shown.as_ref() != Some(&track.key) {
                    show_track(&mut controls, &track, data_dir, &no_cover);
                    shown = Some(track.key);
                }
            }
            let playback = match status {
                Status::Stopped => MediaPlayback::Stopped,
                Status::Paused { position_ms } => MediaPlayback::Paused {
                    progress: Some(MediaPosition(Duration::from_millis(position_ms))),
                },
                Status::Playing { position_ms } => MediaPlayback::Playing {
                    progress: Some(MediaPosition(Duration::from_millis(position_ms))),
                },
            };
            if let Err(error) = controls.set_playback(playback) {
                log::warn!("media_controls.playback_failed cause={error}");
            }
        }
    }

    fn show_track(controls: &mut MediaControls, track: &Track, data_dir: &Path, no_cover: &Path) {
        let existing = |relative: &str| {
            let path = data_dir.join(relative);
            path.is_file().then_some(path)
        };
        let cover = track
            .cover
            .as_ref()
            .and_then(|cover| existing(&cover.thumbnail).or_else(|| existing(&cover.original)))
            .or_else(|| no_cover.is_file().then(|| no_cover.to_path_buf()))
            .map(|path| format!("file://{}", path.display()));
        let metadata = MediaMetadata {
            title: Some(&track.title),
            artist: Some(&track.artist),
            album: Some(&track.album),
            cover_url: cover.as_deref(),
            duration: track.duration_ms.map(Duration::from_millis),
        };
        if let Err(error) = controls.set_metadata(metadata) {
            log::warn!("media_controls.metadata_failed cause={error}");
        }
    }

    /// A media key or an overlay button, run as the same command the UI sends.
    fn command(backend: &BackendApp, event: MediaControlEvent) {
        let playback = backend.playback.handle();
        let result = match event {
            MediaControlEvent::Play => playback.resume(),
            // There is no stop: the overlay's stop leaves the track paused.
            MediaControlEvent::Pause | MediaControlEvent::Stop => playback.pause(),
            MediaControlEvent::Toggle => {
                if matches!(playback.snapshot(), PlaybackSnapshot::Playing { .. }) {
                    playback.pause()
                } else {
                    playback.resume()
                }
            }
            MediaControlEvent::Next => playback.next(),
            MediaControlEvent::Previous => playback.previous(),
            MediaControlEvent::SetPosition(MediaPosition(position)) => {
                playback.seek(u64::try_from(position.as_millis()).unwrap_or(u64::MAX))
            }
            _ => return,
        };
        if let Err(error) = result {
            log::debug!("media_controls.command_refused event={event:?} cause={error:?}");
        }
    }
}

#[cfg(not(windows))]
mod other_impl {
    use std::{ffi::c_void, path::PathBuf, sync::Arc};

    use backend::{app::BackendApp, audio::playback::PlaybackSnapshot};

    pub struct MediaControlsLink;

    impl MediaControlsLink {
        pub fn playback_changed(&self, _snapshot: &PlaybackSnapshot) {}
    }

    pub fn start(
        _hwnd: *mut c_void,
        _backend: Arc<BackendApp>,
        _data_dir: PathBuf,
    ) -> Option<MediaControlsLink> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use backend::audio::playback::{PlaybackFailureCode, SnapshotBase};

    fn base() -> SnapshotBase {
        SnapshotBase {
            revision: 0,
            volume: 1.0,
            muted: false,
            output_selection: backend::audio::devices::AudioOutputSelection::SystemDefault,
            can_go_previous: false,
            can_go_next: false,
        }
    }

    #[test]
    fn nothing_loaded_is_stopped() {
        let stopped = PlaybackSnapshot::Stopped {
            base: base(),
            item: None,
        };

        assert_eq!(overlay_of(&stopped), (None, Status::Stopped));
    }

    #[test]
    fn a_failed_playback_is_stopped_so_no_stale_playing_state_stays() {
        let failed = PlaybackSnapshot::Failed {
            base: base(),
            item: None,
            playback_id: Some("7".into()),
            error: PlaybackFailureCode::DecodeFailed,
            skipping: false,
        };

        assert_eq!(overlay_of(&failed), (None, Status::Stopped));
    }
}
