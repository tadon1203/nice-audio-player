use crate::{
    activity::ApplicationActivityService,
    audio::{devices::list_output_devices, playback::PlaybackService},
    library::service::{
        LibraryCommandError, LibraryService, StartLibraryAlbumTrackError, StartLibraryTrackError,
    },
    lyrics::LyricsService,
    protocol::{
        event::BackendEvent, output::ProtocolOutput, read_requests, request::BackendRequest,
        Message, ProtocolError, Response,
    },
};
use serde_json::Value;
use std::path::PathBuf;
use std::{
    io::{self, BufReader},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

struct BackendApp {
    playback: PlaybackService,
    activities: ApplicationActivityService,
    library: LibraryService,
    _lyrics: LyricsService,
}

impl BackendApp {
    fn initialize() -> io::Result<Self> {
        let activities = ApplicationActivityService::new();
        let data_dir = std::env::var_os("NICE_AUDIO_PLAYER_DATA_DIR")
            .map(PathBuf::from)
            .ok_or_else(|| io::Error::other("backend data directory is not configured"))?;
        let activity = activities.handle();
        let library = LibraryService::initialize_with_activity(data_dir, Some(activity));
        let playback = PlaybackService::start()
            .map_err(|error| io::Error::other(format!("playback start failed: {error:?}")))?;
        Ok(Self {
            playback,
            activities,
            library,
            _lyrics: LyricsService,
        })
    }
    fn request(&self, id: u64, request: BackendRequest) -> Response {
        let result = match request {
            BackendRequest::Ping => Ok(Value::String("pong".into())),
            BackendRequest::GetApplicationActivities => {
                serialize(self.activities.handle().snapshot())
            }
            BackendRequest::GetLibraryStatus => serialize(self.library.status()),
            BackendRequest::GetPlaybackState => serialize(self.playback.snapshot()),
            BackendRequest::GetPlaybackQueue => serialize(self.playback.queue_snapshot()),
            BackendRequest::PausePlayback => encode(self.playback.handle().pause(), playback_error),
            BackendRequest::ResumePlayback => {
                encode(self.playback.handle().resume(), playback_error)
            }
            BackendRequest::PreviousPlayback => {
                encode(self.playback.handle().previous(), playback_error)
            }
            BackendRequest::NextPlayback => encode(self.playback.handle().next(), playback_error),
            BackendRequest::SeekPlayback { position_ms } => {
                encode(self.playback.handle().seek(position_ms), playback_error)
            }
            BackendRequest::SetPlaybackVolume { volume } => {
                encode(self.playback.handle().set_volume(volume), playback_error)
            }
            BackendRequest::SetPlaybackMuted { muted } => {
                if muted {
                    encode(self.playback.handle().mute(), playback_error)
                } else {
                    encode(self.playback.handle().unmute(), playback_error)
                }
            }
            BackendRequest::ListAudioOutputDevices => serialize(list_output_devices()),
            BackendRequest::ValidateAudioFile { path } => self.validate(path),
            BackendRequest::GetLibraryTrackForPath { path } => {
                encode(self.library.handle().track_for_path(path), library_error)
            }
            BackendRequest::ListLibraryRoots => {
                encode(self.library.handle().roots(), library_error)
            }
            BackendRequest::RegisterLibraryRoot { path } => {
                encode(self.library.handle().register_root(path), library_error)
            }
            BackendRequest::SetLibraryRootEnabled { id, enabled } => encode(
                self.library.handle().set_root_enabled(id, enabled),
                library_error,
            ),
            BackendRequest::RemoveLibraryRoot { id } => {
                encode(self.library.handle().remove_root(id), library_error)
            }
            BackendRequest::GetLibraryScanState => serialize(self.library.handle().scan_state()),
            BackendRequest::StartLibraryScan => {
                encode(self.library.handle().start_scan(), library_error)
            }
            BackendRequest::CancelLibraryScan => {
                encode(self.library.handle().cancel_scan(), library_error)
            }
            BackendRequest::ListLibraryTracks { after_id, search } => encode(
                self.library.handle().tracks(after_id, search),
                library_error,
            ),
            BackendRequest::ListLibraryAlbums {
                after_cursor,
                search,
            } => encode(
                self.library.handle().catalog_albums(after_cursor, search),
                library_error,
            ),
            BackendRequest::ListLibraryAlbumArtists {
                after_cursor,
                search,
            } => encode(
                self.library
                    .handle()
                    .catalog_album_artists(after_cursor, search),
                library_error,
            ),
            BackendRequest::GetLibraryAlbumDetails { album_key } => encode(
                self.library.handle().catalog_album_details(album_key),
                library_error,
            ),
            BackendRequest::ListLibraryAlbumTracks { album_key, offset } => encode(
                self.library
                    .handle()
                    .catalog_album_tracks(album_key, offset),
                library_error,
            ),
            BackendRequest::StartLibraryTrack { track_id } => self.start_library_track(track_id),
            BackendRequest::StartLibraryAlbum { album_key } => self.start_library_album(album_key),
        };
        match result {
            Ok(result) => Response {
                id,
                result: Some(result),
                error: None,
            },
            Err(error) => Response {
                id,
                result: None,
                error: Some(error),
            },
        }
    }
    fn start_library_track(&self, track_id: String) -> Result<Value, ProtocolError> {
        let entry = self
            .library
            .handle()
            .playable_entry(track_id)
            .map_err(track_error)?;
        let snapshot = self
            .playback
            .handle()
            .play_entry(crate::audio::playback::PlaybackEntrySeed {
                file: entry.file,
                title: entry.title,
                artist: entry.artist,
                duration_ms: entry.duration_ms,
            })
            .map_err(playback_error)?;
        serialize(snapshot)
    }
    fn start_library_album(
        &self,
        album_key: crate::library::models::LibraryAlbumKey,
    ) -> Result<Value, ProtocolError> {
        let (entries, index) = self
            .library
            .handle()
            .catalog_playback(album_key, None)
            .map_err(album_track_error)?;
        let entries = entries
            .into_iter()
            .map(|entry| crate::audio::playback::PlaybackEntrySeed {
                file: entry.file,
                title: entry.title,
                artist: entry.artist,
                duration_ms: entry.duration_ms,
            })
            .collect();
        let snapshot = self
            .playback
            .handle()
            .play_sequence_entries_at(entries, index)
            .map_err(playback_error)?;
        serialize(snapshot)
    }
    fn validate(&self, path: String) -> Result<Value, ProtocolError> {
        serialize(crate::media::validation::validate_audio_file(&path))
    }
}

fn serialize<T: serde::Serialize>(value: T) -> Result<Value, ProtocolError> {
    serde_json::to_value(value).map_err(|_| ProtocolError {
        code: "serializationFailed".into(),
        message: "Backend response could not be serialized".into(),
    })
}

fn mapped_error(code: &'static str) -> ProtocolError {
    ProtocolError {
        code: code.into(),
        message: format!("Backend operation failed: {code}"),
    }
}

fn library_error(error: LibraryCommandError) -> ProtocolError {
    mapped_error(match error {
        LibraryCommandError::InvalidRoot => "invalidRoot",
        LibraryCommandError::RootNotFound => "rootNotFound",
        LibraryCommandError::RootNotDirectory => "rootNotDirectory",
        LibraryCommandError::CanonicalizationFailed => "canonicalizationFailed",
        LibraryCommandError::DuplicateRoot => "duplicateRoot",
        LibraryCommandError::OverlappingRoot => "overlappingRoot",
        LibraryCommandError::ScanInProgress => "scanInProgress",
        LibraryCommandError::InvalidId => "invalidId",
        LibraryCommandError::AlbumNotFound => "albumNotFound",
        LibraryCommandError::InvalidCursor => "invalidCursor",
        LibraryCommandError::InvalidAlbumKey => "invalidAlbumKey",
        LibraryCommandError::InvalidAlbumArtistKey => "invalidAlbumArtistKey",
        LibraryCommandError::AlbumArtistNotFound => "albumArtistNotFound",
        LibraryCommandError::RootMissing => "rootMissing",
        LibraryCommandError::ScanAlreadyRunning => "scanAlreadyRunning",
        LibraryCommandError::NoEnabledRoots => "noEnabledRoots",
        LibraryCommandError::ScanNotRunning => "scanNotRunning",
        LibraryCommandError::LibraryUnavailable => "libraryUnavailable",
        LibraryCommandError::PersistenceFailed => "persistenceFailed",
        LibraryCommandError::TaskFailed => "taskFailed",
    })
}

fn track_error(error: StartLibraryTrackError) -> ProtocolError {
    mapped_error(match error {
        StartLibraryTrackError::InvalidId => "invalidId",
        StartLibraryTrackError::TrackNotFound => "trackNotFound",
        StartLibraryTrackError::TrackUnavailable => "trackUnavailable",
        StartLibraryTrackError::TrackNotPlayable => "trackNotPlayable",
        StartLibraryTrackError::LibraryUnavailable => "libraryUnavailable",
        StartLibraryTrackError::PersistenceFailed => "persistenceFailed",
        StartLibraryTrackError::DecodeFailed => "decodeFailed",
        StartLibraryTrackError::NoOutputDevice => "noOutputDevice",
        StartLibraryTrackError::OutputDeviceUnavailable => "outputDeviceUnavailable",
        StartLibraryTrackError::OutputFailed => "outputFailed",
        StartLibraryTrackError::PlaybackWorkerUnavailable => "playbackWorkerUnavailable",
        StartLibraryTrackError::TaskFailed => "taskFailed",
    })
}

fn album_track_error(error: StartLibraryAlbumTrackError) -> ProtocolError {
    mapped_error(match error {
        StartLibraryAlbumTrackError::InvalidAlbumKey => "invalidAlbumKey",
        StartLibraryAlbumTrackError::InvalidTrackId => "invalidTrackId",
        StartLibraryAlbumTrackError::AlbumNotFound => "albumNotFound",
        StartLibraryAlbumTrackError::TrackNotMember => "trackNotMember",
        StartLibraryAlbumTrackError::TrackUnavailable => "trackUnavailable",
        StartLibraryAlbumTrackError::TrackNotPlayable => "trackNotPlayable",
        StartLibraryAlbumTrackError::NoPlayableTracks => "noPlayableTracks",
        StartLibraryAlbumTrackError::SourceUnavailable => "sourceUnavailable",
        StartLibraryAlbumTrackError::LibraryUnavailable => "libraryUnavailable",
        StartLibraryAlbumTrackError::PersistenceFailed => "persistenceFailed",
        StartLibraryAlbumTrackError::DecodeFailed => "decodeFailed",
        StartLibraryAlbumTrackError::NoOutputDevice => "noOutputDevice",
        StartLibraryAlbumTrackError::OutputDeviceUnavailable => "outputDeviceUnavailable",
        StartLibraryAlbumTrackError::OutputFailed => "outputFailed",
        StartLibraryAlbumTrackError::PlaybackWorkerUnavailable => "playbackWorkerUnavailable",
        StartLibraryAlbumTrackError::TaskFailed => "taskFailed",
    })
}

fn playback_error(error: crate::audio::playback::PlaybackServiceError) -> ProtocolError {
    use crate::audio::playback::PlaybackServiceError;
    let code = match error {
        PlaybackServiceError::WorkerUnavailable => "playbackWorkerUnavailable",
        PlaybackServiceError::QueueItemNotFound => "queueItemNotFound",
        PlaybackServiceError::QueueBusy => "queueBusy",
        PlaybackServiceError::InvalidVolume => "invalidVolume",
        PlaybackServiceError::InvalidDeviceId => "invalidDeviceId",
        PlaybackServiceError::OutputDeviceUnavailable => "outputDeviceUnavailable",
        PlaybackServiceError::InvalidPlaybackState => "invalidPlaybackState",
        PlaybackServiceError::DurationUnavailable => "durationUnavailable",
        PlaybackServiceError::Seek => "seekFailed",
        PlaybackServiceError::Output(code) => match code {
            crate::audio::playback::PlaybackFailureCode::NoOutputDevice => "noOutputDevice",
            crate::audio::playback::PlaybackFailureCode::OutputDeviceUnavailable => {
                "outputDeviceUnavailable"
            }
            crate::audio::playback::PlaybackFailureCode::UnsupportedOutputConfiguration => {
                "unsupportedOutputConfiguration"
            }
            crate::audio::playback::PlaybackFailureCode::OutputStreamBuildFailed => {
                "outputStreamBuildFailed"
            }
            crate::audio::playback::PlaybackFailureCode::OutputStreamStartFailed => {
                "outputStreamStartFailed"
            }
            crate::audio::playback::PlaybackFailureCode::OutputStreamPauseFailed => {
                "outputStreamPauseFailed"
            }
            crate::audio::playback::PlaybackFailureCode::OutputStreamResumeFailed => {
                "outputStreamResumeFailed"
            }
            crate::audio::playback::PlaybackFailureCode::OutputStreamRuntimeFailed => {
                "outputStreamRuntimeFailed"
            }
            crate::audio::playback::PlaybackFailureCode::CompletionTimingFailed => {
                "completionTimingFailed"
            }
            crate::audio::playback::PlaybackFailureCode::DecodeFailed => "decodeFailed",
            crate::audio::playback::PlaybackFailureCode::SampleRateConversionFailed => {
                "sampleRateConversionFailed"
            }
        },
        PlaybackServiceError::Decode => "decodeFailed",
    };
    ProtocolError {
        code: code.into(),
        message: format!("Backend operation failed: {code}"),
    }
}

fn encode<T: serde::Serialize, E>(
    value: Result<T, E>,
    map_error: fn(E) -> ProtocolError,
) -> Result<Value, ProtocolError> {
    value.map_err(map_error).and_then(serialize)
}

pub fn run() -> io::Result<()> {
    let app = Arc::new(BackendApp::initialize()?);
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    let output = ProtocolOutput::new();
    let output_sender = output.sender();
    if !output.send(Message::Event(BackendEvent::Ready)) {
        return Err(io::Error::other("output closed"));
    }
    let event_stop = Arc::new(AtomicBool::new(false));
    let mut event_threads = Vec::new();
    for (receiver, make_event) in [
        (
            app.activities.take_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || {
                    BackendEvent::ApplicationActivitiesChanged(app.activities.handle().snapshot())
                }
            }) as Box<dyn Fn() -> BackendEvent + Send>,
        ),
        (
            app.library.take_scan_state_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || BackendEvent::LibraryScanStateChanged(app.library.handle().scan_state())
            }) as Box<dyn Fn() -> BackendEvent + Send>,
        ),
        (
            app.playback.take_state_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || BackendEvent::PlaybackStateChanged(app.playback.snapshot())
            }) as Box<dyn Fn() -> BackendEvent + Send>,
        ),
        (
            app.playback.take_queue_state_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || BackendEvent::PlaybackQueueStateChanged(app.playback.queue_snapshot())
            }) as Box<dyn Fn() -> BackendEvent + Send>,
        ),
    ] {
        if let Some(receiver) = receiver {
            let output = output_sender.clone();
            let stop = Arc::clone(&event_stop);
            event_threads.push(thread::spawn(move || {
                while !stop.load(Ordering::Acquire) {
                    if receiver.recv_timeout(Duration::from_millis(100)).is_err() {
                        continue;
                    }
                    let _ = output.send(Message::Event(make_event()));
                }
            }));
        }
    }
    let requests = Arc::clone(&app);
    let output_requests = output_sender.clone();
    let (done_sender, done_receiver) = std::sync::mpsc::channel();
    let request_thread = thread::spawn(move || {
        for request in read_requests(BufReader::new(stdin.lock())) {
            match request {
                Ok(request) => {
                    let _ = output_requests.send(Message::Response(
                        requests.request(request.id, request.request),
                    ));
                }
                Err(error) => eprintln!("backend protocol input error: {error}"),
            }
        }
        let _ = done_sender.send(());
    });
    drop(output_sender);
    output.write_until(&mut stdout, || done_receiver.try_recv().is_ok())?;
    event_stop.store(true, Ordering::Release);
    app.playback.shutdown();
    app.library.shutdown();
    let _ = request_thread.join();
    for event_thread in event_threads {
        let _ = event_thread.join();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_library_and_playback_errors_without_debug_details() {
        assert_eq!(
            library_error(LibraryCommandError::PersistenceFailed).code,
            "persistenceFailed"
        );
        assert_eq!(
            track_error(StartLibraryTrackError::TrackNotPlayable).code,
            "trackNotPlayable"
        );
        assert_eq!(
            album_track_error(StartLibraryAlbumTrackError::NoPlayableTracks).code,
            "noPlayableTracks"
        );
        let error = playback_error(crate::audio::playback::PlaybackServiceError::Decode);
        assert_eq!(error.code, "decodeFailed");
        assert!(!error.message.contains("PlaybackServiceError"));
        assert!(!error.message.contains("Debug"));
    }

    #[test]
    fn response_serialization_keeps_success_and_error_separate() {
        let success = Response {
            id: 1,
            result: Some(serde_json::json!({ "value": true })),
            error: None,
        };
        let failure = Response {
            id: 2,
            result: None,
            error: Some(mapped_error("trackNotFound")),
        };
        let success_json = serde_json::to_value(success).expect("success response serializes");
        let failure_json = serde_json::to_value(failure).expect("error response serializes");
        assert_eq!(success_json["result"]["value"], true);
        assert!(success_json.get("error").is_none());
        assert_eq!(failure_json["error"]["code"], "trackNotFound");
        assert!(failure_json.get("result").is_none());
    }
}
