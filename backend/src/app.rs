use crate::{
    activity::ApplicationActivityService,
    audio::{devices::list_output_devices, playback::PlaybackService},
    library::service::{
        LibraryCommandError, LibraryService, StartLibraryAlbumTrackError, StartLibraryTrackError,
    },
    lyrics::LyricsService,
    protocol::{
        event::BackendEvent,
        request::BackendRequest,
        response::{BackendResponse, NullResult, ValidateAudioFileResult},
        Message, ProtocolError, Response,
    },
};
use std::path::PathBuf;
use std::{io, sync::Arc, thread};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub struct BackendApp {
    playback: PlaybackService,
    activities: ApplicationActivityService,
    library: LibraryService,
    _lyrics: LyricsService,
}

impl BackendApp {
    pub fn initialize() -> io::Result<Self> {
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
        if request.validate_request().is_err() {
            return Response::Error {
                id,
                error: ProtocolError {
                    code: "validationFailed".into(),
                    message: "Request validation failed".into(),
                },
            };
        }
        let result: Result<BackendResponse, ProtocolError> = match request {
            BackendRequest::Ping => Ok(BackendResponse::Ping("pong".into())),
            BackendRequest::GetApplicationActivities => Ok(
                BackendResponse::GetApplicationActivities(self.activities.handle().snapshot()),
            ),
            BackendRequest::GetLibraryStatus => {
                Ok(BackendResponse::GetLibraryStatus(self.library.status()))
            }
            BackendRequest::GetPlaybackState => {
                Ok(BackendResponse::GetPlaybackState(self.playback.snapshot()))
            }
            BackendRequest::GetPlaybackQueue => Ok(BackendResponse::GetPlaybackQueue(
                self.playback.queue_snapshot(),
            )),
            BackendRequest::PausePlayback => encode(
                self.playback.handle().pause(),
                BackendResponse::PausePlayback,
                playback_error,
            ),
            BackendRequest::ResumePlayback => encode(
                self.playback.handle().resume(),
                BackendResponse::ResumePlayback,
                playback_error,
            ),
            BackendRequest::PreviousPlayback => encode(
                self.playback.handle().previous(),
                BackendResponse::PreviousPlayback,
                playback_error,
            ),
            BackendRequest::NextPlayback => encode(
                self.playback.handle().next(),
                BackendResponse::NextPlayback,
                playback_error,
            ),
            BackendRequest::SeekPlayback { position_ms } => encode(
                self.playback.handle().seek(position_ms),
                BackendResponse::SeekPlayback,
                playback_error,
            ),
            BackendRequest::SetPlaybackVolume { volume } => encode(
                self.playback.handle().set_volume(volume),
                BackendResponse::SetPlaybackVolume,
                playback_error,
            ),
            BackendRequest::SetPlaybackMuted { muted } => {
                if muted {
                    encode(
                        self.playback.handle().mute(),
                        BackendResponse::SetPlaybackMuted,
                        playback_error,
                    )
                } else {
                    encode(
                        self.playback.handle().unmute(),
                        BackendResponse::SetPlaybackMuted,
                        playback_error,
                    )
                }
            }
            BackendRequest::ListAudioOutputDevices => encode(
                list_output_devices(),
                BackendResponse::ListAudioOutputDevices,
                device_error,
            ),
            BackendRequest::ValidateAudioFile { path } => Ok(BackendResponse::ValidateAudioFile(
                match crate::media::validation::validate_audio_file(&path) {
                    Ok(file) => ValidateAudioFileResult::Ok(file),
                    Err(error) => ValidateAudioFileResult::Err(error),
                },
            )),
            BackendRequest::GetLibraryTrackForPath { path } => encode(
                self.library.handle().track_for_path(path),
                BackendResponse::GetLibraryTrackForPath,
                library_error,
            ),
            BackendRequest::ListLibraryRoots => encode(
                self.library.handle().roots(),
                BackendResponse::ListLibraryRoots,
                library_error,
            ),
            BackendRequest::RegisterLibraryRoot { path } => encode(
                self.library.handle().register_root(path),
                BackendResponse::RegisterLibraryRoot,
                library_error,
            ),
            BackendRequest::SetLibraryRootEnabled { id, enabled } => encode(
                self.library.handle().set_root_enabled(id, enabled),
                BackendResponse::SetLibraryRootEnabled,
                library_error,
            ),
            BackendRequest::RemoveLibraryRoot { id } => encode(
                self.library.handle().remove_root(id).map(|_| NullResult),
                BackendResponse::RemoveLibraryRoot,
                library_error,
            ),
            BackendRequest::GetLibraryScanState => Ok(BackendResponse::GetLibraryScanState(
                self.library.handle().scan_state(),
            )),
            BackendRequest::StartLibraryScan => encode(
                self.library.handle().start_scan().map(|_| NullResult),
                BackendResponse::StartLibraryScan,
                library_error,
            ),
            BackendRequest::CancelLibraryScan => encode(
                self.library.handle().cancel_scan().map(|_| NullResult),
                BackendResponse::CancelLibraryScan,
                library_error,
            ),
            BackendRequest::ListLibraryTracks {
                cursor,
                search,
                sort_key,
                sort_direction,
            } => encode(
                self.library
                    .handle()
                    .tracks(cursor, search, sort_key, sort_direction),
                BackendResponse::ListLibraryTracks,
                library_error,
            ),
            BackendRequest::ListLibraryAlbums {
                cursor,
                search,
                sort_key,
                sort_direction,
            } => encode(
                self.library
                    .handle()
                    .catalog_albums(cursor, search, sort_key, sort_direction),
                BackendResponse::ListLibraryAlbums,
                library_error,
            ),
            BackendRequest::ListLibraryAlbumArtists {
                cursor,
                search,
                sort_key,
                sort_direction,
            } => encode(
                self.library.handle().catalog_album_artists(
                    cursor,
                    search,
                    sort_key,
                    sort_direction,
                ),
                BackendResponse::ListLibraryAlbumArtists,
                library_error,
            ),
            BackendRequest::GetLibraryAlbumArtist { artist_key } => encode(
                self.library.handle().catalog_artist(artist_key),
                BackendResponse::GetLibraryAlbumArtist,
                library_error,
            ),
            BackendRequest::ListLibraryArtistAlbums {
                artist_key,
                cursor,
                sort_key,
                sort_direction,
            } => encode(
                self.library.handle().catalog_artist_albums(
                    artist_key,
                    cursor,
                    sort_key,
                    sort_direction,
                ),
                BackendResponse::ListLibraryArtistAlbums,
                library_error,
            ),
            BackendRequest::GetLibraryAlbumDetails { album_key } => encode(
                self.library.handle().catalog_album_details(album_key),
                BackendResponse::GetLibraryAlbumDetails,
                library_error,
            ),
            BackendRequest::ListLibraryAlbumTracks { album_key, cursor } => encode(
                self.library
                    .handle()
                    .catalog_album_tracks(album_key, cursor),
                BackendResponse::ListLibraryAlbumTracks,
                library_error,
            ),
            BackendRequest::StartLibraryTrack { track_id } => self.start_library_track(track_id),
            BackendRequest::StartLibraryAlbum { album_key } => self.start_library_album(album_key),
        };
        match result {
            Ok(response) => Response::Ok { id, response },
            Err(error) => Response::Error { id, error },
        }
    }
    fn start_library_track(&self, track_id: String) -> Result<BackendResponse, ProtocolError> {
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
        Ok(BackendResponse::StartLibraryTrack(snapshot))
    }
    fn start_library_album(
        &self,
        album_key: crate::library::models::LibraryAlbumKey,
    ) -> Result<BackendResponse, ProtocolError> {
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
        Ok(BackendResponse::StartLibraryAlbum(snapshot))
    }
}

fn mapped_error(code: &'static str) -> ProtocolError {
    ProtocolError {
        code: code.into(),
        message: format!("Backend operation failed: {code}"),
    }
}

fn device_error(error: crate::audio::devices::AudioDeviceListError) -> ProtocolError {
    mapped_error(match error {
        crate::audio::devices::AudioDeviceListError::EnumerationFailed => "enumerationFailed",
    })
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

fn encode<T, E>(
    value: Result<T, E>,
    wrap: fn(T) -> BackendResponse,
    map_error: fn(E) -> ProtocolError,
) -> Result<BackendResponse, ProtocolError> {
    value.map(wrap).map_err(map_error)
}

/// Serves newline-delimited Serde protocol frames over stdin/stdout.
///
/// Request work is isolated in blocking tasks because the current library and
/// playback handles are synchronous internally. The transport itself remains
/// asynchronous and has exactly one stdout writer, so concurrent requests can
/// complete out of order without interleaving JSON frames.
pub async fn serve(app: Arc<BackendApp>) -> io::Result<()> {
    enum EventBridgeMessage {
        Event(Box<BackendEvent>),
        Stop,
    }

    let (output_sender, mut output_receiver) = mpsc::channel::<Message>(128);
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::BufWriter::new(tokio::io::stdout());
        while let Some(message) = output_receiver.recv().await {
            let bytes = serde_json::to_vec(&message)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
            stdout.write_all(&bytes).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
        stdout.flush().await
    });

    output_sender
        .send(Message::Event(BackendEvent::Ready))
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "stdout writer closed"))?;

    let cancellation = CancellationToken::new();
    let (event_sender, event_receiver) = std::sync::mpsc::channel::<EventBridgeMessage>();
    let event_router_sender = output_sender.clone();
    let event_router = tokio::task::spawn_blocking(move || {
        while let Ok(message) = event_receiver.recv() {
            match message {
                EventBridgeMessage::Event(event) => {
                    if event_router_sender
                        .blocking_send(Message::Event(*event))
                        .is_err()
                    {
                        break;
                    }
                }
                EventBridgeMessage::Stop => break,
            }
        }
    });

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
            }),
        ),
        (
            app.playback.take_state_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || BackendEvent::PlaybackStateChanged(app.playback.snapshot())
            }),
        ),
        (
            app.playback.take_queue_state_changed_receiver(),
            Box::new({
                let app = Arc::clone(&app);
                move || BackendEvent::PlaybackQueueStateChanged(app.playback.queue_snapshot())
            }),
        ),
    ] {
        if let Some(receiver) = receiver {
            let event_sender = event_sender.clone();
            let cancellation = cancellation.clone();
            thread::spawn(move || {
                while !cancellation.is_cancelled() {
                    let Ok(()) = receiver.recv() else { break };
                    if event_sender
                        .send(EventBridgeMessage::Event(Box::new(make_event())))
                        .is_err()
                    {
                        break;
                    }
                }
            });
        }
    }
    let stop_sender = event_sender.clone();
    drop(event_sender);

    let mut lines = tokio::io::BufReader::new(tokio::io::stdin()).lines();
    let requests = TaskTracker::new();
    let mut input_error = None;
    while let Some(line) = lines.next_line().await? {
        let envelope: crate::protocol::request::Envelope = match serde_json::from_str(&line) {
            Ok(envelope) => envelope,
            Err(error) => {
                input_error = Some(io::Error::new(io::ErrorKind::InvalidData, error));
                break;
            }
        };
        let app = Arc::clone(&app);
        let output_sender = output_sender.clone();
        requests.spawn(async move {
            let id = envelope.id;
            let response = tokio::task::spawn_blocking(move || app.request(id, envelope.request))
                .await
                .unwrap_or_else(|_| Response::Error {
                    id,
                    error: ProtocolError {
                        code: "taskFailed".into(),
                        message: "Backend request task failed".into(),
                    },
                });
            let _ = output_sender.send(Message::Response(response)).await;
        });
    }

    requests.close();
    requests.wait().await;
    cancellation.cancel();
    let _ = stop_sender.send(EventBridgeMessage::Stop);
    event_router
        .await
        .map_err(|error| io::Error::other(format!("event router failed: {error}")))?;
    drop(output_sender);
    writer
        .await
        .map_err(|error| io::Error::other(format!("stdout writer failed: {error}")))??;
    app.playback.shutdown();
    app.library.shutdown();
    input_error.map_or(Ok(()), Err)
}

pub fn run() -> io::Result<()> {
    let app = Arc::new(BackendApp::initialize()?);
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| io::Error::other(format!("tokio runtime failed: {error}")))?
        .block_on(serve(app))
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
        let success = Response::Ok {
            id: 1,
            response: BackendResponse::Ping("pong".into()),
        };
        let failure = Response::Error {
            id: 2,
            error: mapped_error("trackNotFound"),
        };
        let success_json = serde_json::to_value(success).expect("success response serializes");
        let failure_json = serde_json::to_value(failure).expect("error response serializes");
        assert_eq!(success_json["response"]["result"], "pong");
        assert_eq!(success_json["status"], "ok");
        assert_eq!(failure_json["error"]["code"], "trackNotFound");
        assert_eq!(failure_json["status"], "error");
    }
}
