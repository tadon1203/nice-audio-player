use super::{
    dto::{
        js_non_negative_integer, AudioOutputDeviceDto, BackendEventDto, LibraryStatusDto,
        PlaybackQueueSnapshotDto, PlaybackSnapshotDto,
    },
    error::{self, to_napi_error, NativeErrorCode},
};
use crate::{
    app::BackendApp,
    audio::{devices::list_output_devices, playback::PlaybackServiceError},
};
use napi_derive::napi;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{mpsc, Mutex};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

// Keep this import alias local so the generated declaration exposes the intended names.
use super::dto::{
    LibraryAlbumArtistKeyDto as ArtistKey, LibraryAlbumArtistPageDto as ArtistPage,
    LibraryAlbumArtistSortKeyDto as ArtistSort, LibraryAlbumDetailsDto as AlbumDetails,
    LibraryAlbumKeyDto as AlbumKey, LibraryAlbumPageDto as AlbumPage,
    LibraryAlbumSortKeyDto as AlbumSort, LibraryAlbumTrackPageDto as AlbumTrackPage,
    LibraryArtistAlbumSortKeyDto as ArtistAlbumSort, LibraryScanSnapshotDto as ScanSnapshot,
    LibraryTrackPageDto as TrackPage, LibraryTrackSortKeyDto as TrackSort,
};

#[napi(js_name = "NativeBackend")]
pub struct NativeBackend {
    app: Arc<BackendApp>,
    cancellation: CancellationToken,
    tasks: TaskTracker,
    events: Mutex<mpsc::Receiver<BackendEventDto>>,
    shutdown_started: AtomicBool,
}

#[napi]
impl NativeBackend {
    #[napi]
    pub async fn open(data_dir: String) -> napi::Result<NativeBackend> {
        if data_dir.trim().is_empty() {
            return Err(to_napi_error(NativeErrorCode::InvalidArgument));
        }
        let app = Arc::new(
            BackendApp::initialize(PathBuf::from(data_dir))
                .await
                .map_err(error::backend)
                .map_err(to_napi_error)?,
        );
        let cancellation = CancellationToken::new();
        let tasks = TaskTracker::new();
        let (sender, receiver) = mpsc::channel(128);
        let backend = Self {
            app: Arc::clone(&app),
            cancellation: cancellation.clone(),
            tasks: tasks.clone(),
            events: Mutex::new(receiver),
            shutdown_started: AtomicBool::new(false),
        };

        if let Some(receiver) = app.activities.take_changed_receiver() {
            bridge_events(&tasks, receiver, cancellation.clone(), sender.clone(), {
                let app = Arc::clone(&app);
                move || {
                    Ok(BackendEventDto::ApplicationActivitiesChanged {
                        payload: app
                            .activities
                            .handle()
                            .snapshot()
                            .into_iter()
                            .map(Into::into)
                            .collect(),
                    })
                }
            });
        }
        if let Some(receiver) = app.library.take_scan_state_changed_receiver() {
            bridge_events(&tasks, receiver, cancellation.clone(), sender.clone(), {
                let app = Arc::clone(&app);
                move || {
                    Ok(BackendEventDto::LibraryScanStateChanged {
                        payload: app.library.handle().scan_state().try_into()?,
                    })
                }
            });
        }
        if let Some(receiver) = app.playback.take_state_changed_receiver() {
            bridge_events(&tasks, receiver, cancellation.clone(), sender.clone(), {
                let app = Arc::clone(&app);
                move || {
                    Ok(BackendEventDto::PlaybackStateChanged {
                        payload: app.playback.snapshot().try_into()?,
                    })
                }
            });
        }
        if let Some(receiver) = app.playback.take_queue_state_changed_receiver() {
            bridge_events(&tasks, receiver, cancellation, sender, {
                let app = Arc::clone(&app);
                move || {
                    Ok(BackendEventDto::PlaybackQueueStateChanged {
                        payload: app.playback.queue_snapshot().try_into()?,
                    })
                }
            });
        }
        Ok(backend)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn get_playback_state(&self) -> napi::Result<PlaybackSnapshotDto> {
        let app = Arc::clone(&self.app);
        blocking(move || app.playback.snapshot().try_into())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackQueueSnapshot>")]
    pub async fn get_playback_queue(&self) -> napi::Result<PlaybackQueueSnapshotDto> {
        let app = Arc::clone(&self.app);
        blocking(move || app.playback.queue_snapshot().try_into())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn pause_playback(&self) -> napi::Result<PlaybackSnapshotDto> {
        self.playback_command(|handle| handle.pause())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn resume_playback(&self) -> napi::Result<PlaybackSnapshotDto> {
        self.playback_command(|handle| handle.resume())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn previous_playback(&self) -> napi::Result<PlaybackSnapshotDto> {
        self.playback_command(|handle| handle.previous())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn next_playback(&self) -> napi::Result<PlaybackSnapshotDto> {
        self.playback_command(|handle| handle.next())
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn seek_playback(&self, position_ms: f64) -> napi::Result<PlaybackSnapshotDto> {
        let position_ms =
            js_non_negative_integer(position_ms, "positionMs").map_err(to_napi_error)?;
        self.playback_command(move |handle| handle.seek(position_ms))
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn set_playback_volume(&self, volume: f64) -> napi::Result<PlaybackSnapshotDto> {
        if !volume.is_finite() || !(0.0..=1.0).contains(&volume) {
            return Err(to_napi_error(NativeErrorCode::InvalidVolume));
        }
        self.playback_command(move |handle| handle.set_volume(volume as f32))
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn set_playback_muted(&self, muted: bool) -> napi::Result<PlaybackSnapshotDto> {
        self.playback_command(move |handle| {
            if muted {
                handle.mute()
            } else {
                handle.unmute()
            }
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<Array<AudioOutputDevice>>")]
    pub async fn list_audio_output_devices(&self) -> napi::Result<Vec<AudioOutputDeviceDto>> {
        blocking(move || {
            list_output_devices()
                .map(|devices| devices.into_iter().map(Into::into).collect())
                .map_err(error::device)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<LibraryStatus>")]
    pub async fn get_library_status(&self) -> napi::Result<LibraryStatusDto> {
        let app = Arc::clone(&self.app);
        blocking(move || Ok(app.library.status().into()))
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<LibraryTrackSummary | null>")]
    pub async fn get_library_track_for_path(
        &self,
        path: String,
    ) -> napi::Result<Option<crate::napi::dto::LibraryTrackSummaryDto>> {
        require_non_empty(&path).map_err(to_napi_error)?;
        let library = self.app.library.handle();
        blocking(move || {
            library
                .track_for_path(path)
                .map_err(error::library)
                .and_then(|track| track.map(TryInto::try_into).transpose())
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<Array<LibraryRoot>>")]
    pub async fn list_library_roots(&self) -> napi::Result<Vec<crate::napi::dto::LibraryRootDto>> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .roots()
                .map_err(error::library)
                .and_then(|roots| roots.into_iter().map(TryInto::try_into).collect())
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<LibraryRoot>")]
    pub async fn register_library_root(
        &self,
        path: String,
    ) -> napi::Result<crate::napi::dto::LibraryRootDto> {
        require_non_empty(&path).map_err(to_napi_error)?;
        let library = self.app.library.handle();
        blocking(move || {
            library
                .register_root(path)
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<LibraryRoot>")]
    pub async fn set_library_root_enabled(
        &self,
        id: String,
        enabled: bool,
    ) -> napi::Result<crate::napi::dto::LibraryRootDto> {
        require_non_empty(&id).map_err(to_napi_error)?;
        let library = self.app.library.handle();
        blocking(move || {
            library
                .set_root_enabled(id, enabled)
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi]
    pub async fn remove_library_root(&self, id: String) -> napi::Result<()> {
        require_non_empty(&id).map_err(to_napi_error)?;
        let library = self.app.library.handle();
        blocking(move || library.remove_root(id).map_err(error::library))
            .await
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<LibraryScanSnapshot>")]
    pub async fn get_library_scan_state(&self) -> napi::Result<ScanSnapshot> {
        let library = self.app.library.handle();
        blocking(move || library.scan_state().try_into())
            .await
            .map_err(to_napi_error)
    }

    #[napi]
    pub async fn start_library_scan(&self) -> napi::Result<()> {
        let library = self.app.library.handle();
        blocking(move || library.start_scan().map_err(error::library))
            .await
            .map_err(to_napi_error)
    }

    #[napi]
    pub async fn cancel_library_scan(&self) -> napi::Result<()> {
        let library = self.app.library.handle();
        blocking(move || library.cancel_scan().map_err(error::library))
            .await
            .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "cursor: string | null, search: string | null, sortKey: LibraryTrackSortKey, sortDirection: LibrarySortDirection",
        ts_return_type = "Promise<LibraryTrackPage>"
    )]
    pub async fn list_library_tracks(
        &self,
        cursor: Option<String>,
        search: Option<String>,
        sort_key: TrackSort,
        sort_direction: crate::napi::dto::LibrarySortDirectionDto,
    ) -> napi::Result<TrackPage> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .tracks(cursor, search, sort_key.into(), sort_direction.into())
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "cursor: string | null, search: string | null, sortKey: LibraryAlbumSortKey, sortDirection: LibrarySortDirection",
        ts_return_type = "Promise<LibraryAlbumPage>"
    )]
    pub async fn list_library_albums(
        &self,
        cursor: Option<String>,
        search: Option<String>,
        sort_key: AlbumSort,
        sort_direction: crate::napi::dto::LibrarySortDirectionDto,
    ) -> napi::Result<AlbumPage> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_albums(cursor, search, sort_key.into(), sort_direction.into())
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "cursor: string | null, search: string | null, sortKey: LibraryAlbumArtistSortKey, sortDirection: LibrarySortDirection",
        ts_return_type = "Promise<LibraryAlbumArtistPage>"
    )]
    pub async fn list_library_album_artists(
        &self,
        cursor: Option<String>,
        search: Option<String>,
        sort_key: ArtistSort,
        sort_direction: crate::napi::dto::LibrarySortDirectionDto,
    ) -> napi::Result<ArtistPage> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_album_artists(cursor, search, sort_key.into(), sort_direction.into())
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "artistKey: LibraryAlbumArtistKey",
        ts_return_type = "Promise<LibraryAlbumArtistSummary>"
    )]
    pub async fn get_library_album_artist(
        &self,
        artist_key: ArtistKey,
    ) -> napi::Result<crate::napi::dto::LibraryAlbumArtistSummaryDto> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_artist(artist_key.into())
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "artistKey: LibraryAlbumArtistKey, cursor: string | null, sortKey: LibraryArtistAlbumSortKey, sortDirection: LibrarySortDirection",
        ts_return_type = "Promise<LibraryAlbumPage>"
    )]
    pub async fn list_library_artist_albums(
        &self,
        artist_key: ArtistKey,
        cursor: Option<String>,
        sort_key: ArtistAlbumSort,
        sort_direction: crate::napi::dto::LibrarySortDirectionDto,
    ) -> napi::Result<AlbumPage> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_artist_albums(
                    artist_key.into(),
                    cursor,
                    sort_key.into(),
                    sort_direction.into(),
                )
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "albumKey: LibraryAlbumKey",
        ts_return_type = "Promise<LibraryAlbumDetails>"
    )]
    pub async fn get_library_album_details(
        &self,
        album_key: AlbumKey,
    ) -> napi::Result<AlbumDetails> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_album_details(album_key.into())
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "albumKey: LibraryAlbumKey, cursor?: string | null",
        ts_return_type = "Promise<LibraryAlbumTrackPage>"
    )]
    pub async fn list_library_album_tracks(
        &self,
        album_key: AlbumKey,
        cursor: Option<String>,
    ) -> napi::Result<AlbumTrackPage> {
        let library = self.app.library.handle();
        blocking(move || {
            library
                .catalog_album_tracks(album_key.into(), cursor)
                .map_err(error::library)
                .and_then(TryInto::try_into)
        })
        .await
        .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<PlaybackSnapshot>")]
    pub async fn start_library_track(&self, track_id: String) -> napi::Result<PlaybackSnapshotDto> {
        require_non_empty(&track_id).map_err(to_napi_error)?;
        self.app
            .start_library_track(track_id)
            .await
            .map_err(error::track)
            .and_then(TryInto::try_into)
            .map_err(to_napi_error)
    }

    #[napi(
        ts_args_type = "albumKey: LibraryAlbumKey",
        ts_return_type = "Promise<PlaybackSnapshot>"
    )]
    pub async fn start_library_album(
        &self,
        album_key: AlbumKey,
    ) -> napi::Result<PlaybackSnapshotDto> {
        self.app
            .start_library_album(album_key.into())
            .await
            .map_err(error::album)
            .and_then(TryInto::try_into)
            .map_err(to_napi_error)
    }

    #[napi(ts_return_type = "Promise<BackendEvent>")]
    pub async fn next_event(&self) -> napi::Result<BackendEventDto> {
        let mut receiver = self.events.lock().await;
        let event = tokio::select! {
            _ = self.cancellation.cancelled() => Err(NativeErrorCode::BackendClosed),
            event = receiver.recv() => event.ok_or(NativeErrorCode::BackendClosed),
        };
        event.map_err(to_napi_error)
    }

    #[napi]
    pub async fn shutdown(&self) -> napi::Result<()> {
        if self.shutdown_started.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        self.cancellation.cancel();
        self.tasks.close();
        self.tasks.wait().await;
        let app = Arc::clone(&self.app);
        tokio::task::spawn_blocking(move || app.shutdown())
            .await
            .map_err(|_| NativeErrorCode::TaskFailed)
            .map_err(to_napi_error)?;
        Ok(())
    }

    async fn playback_command<F>(&self, command: F) -> Result<PlaybackSnapshotDto, NativeErrorCode>
    where
        F: FnOnce(
                crate::audio::playback::PlaybackServiceHandle,
            )
                -> Result<crate::audio::playback::PlaybackSnapshot, PlaybackServiceError>
            + Send
            + 'static,
    {
        let handle = self.app.playback.handle();
        blocking(move || {
            command(handle)
                .map_err(error::playback)
                .and_then(TryInto::try_into)
        })
        .await
    }
}

fn require_non_empty(value: &str) -> Result<(), NativeErrorCode> {
    if value.trim().is_empty() {
        Err(NativeErrorCode::InvalidArgument)
    } else {
        Ok(())
    }
}

async fn blocking<T, F>(operation: F) -> Result<T, NativeErrorCode>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, NativeErrorCode> + Send + 'static,
{
    let result = tokio::task::spawn_blocking(operation)
        .await
        .map_err(|_| NativeErrorCode::TaskFailed)?;
    result
}

fn bridge_events<F>(
    tasks: &TaskTracker,
    receiver: std::sync::mpsc::Receiver<()>,
    cancellation: CancellationToken,
    sender: mpsc::Sender<BackendEventDto>,
    make_event: F,
) where
    F: Fn() -> Result<BackendEventDto, NativeErrorCode> + Send + 'static,
{
    tasks.spawn_blocking(move || loop {
        if cancellation.is_cancelled() {
            break;
        }
        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(()) => {
                if let Ok(event) = make_event() {
                    let _ = sender.try_send(event);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    });
}
