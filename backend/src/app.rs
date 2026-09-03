use crate::{
    activity::ApplicationActivityService,
    audio::{devices::list_output_devices, playback::PlaybackService},
    library::service::LibraryService,
    lyrics::LyricsService,
    protocol::{
        read_requests, request::BackendRequest, write_message, Message, ProtocolError, Response,
    },
};
use serde_json::Value;
use std::io::{self, BufReader};
use std::path::PathBuf;

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
                serde_json::to_value(self.activities.handle().snapshot())
            }
            BackendRequest::GetLibraryStatus => serde_json::to_value(self.library.status()),
            BackendRequest::GetPlaybackState => serde_json::to_value(self.playback.snapshot()),
            BackendRequest::GetPlaybackQueue => {
                serde_json::to_value(self.playback.queue_snapshot())
            }
            BackendRequest::ListAudioOutputDevices => serde_json::to_value(list_output_devices()),
            BackendRequest::ValidateAudioFile { path } => self.validate(path),
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
                error: Some(ProtocolError {
                    code: "requestFailed".into(),
                    message: error.to_string(),
                }),
            },
        }
    }
    fn validate(&self, path: String) -> Result<Value, serde_json::Error> {
        serde_json::to_value(crate::media::validation::validate_audio_file(&path))
    }
}

pub fn run() -> io::Result<()> {
    let app = BackendApp::initialize()?;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    write_message(&mut stdout, &Message::Ready { event: "ready" })?;
    for request in read_requests(BufReader::new(stdin.lock())) {
        match request {
            Ok(request) => write_message(
                &mut stdout,
                &Message::Response(app.request(request.id, request.request)),
            )?,
            Err(error) => eprintln!("backend protocol input error: {error}"),
        }
    }
    app.playback.shutdown();
    app.library.shutdown();
    Ok(())
}
