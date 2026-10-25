//! The worker is driven through the commands and events it receives, with a fake output device.
//! `Harness` plays the part of the worker thread: it hands the worker one input at a time, so a
//! test decides when a tick happens and when an event is delivered.

mod failure;
mod gapless;
mod output;
mod preferences;
mod queue;
mod seek;
mod service;
mod snapshot;
mod transport;

use crate::audio::devices::AudioOutputSelection;
use crate::audio::fake_output::FakeOutput;
use crate::audio::meter::Meter;
use crate::audio::output::{AudioOutputError, OutputStreamId, PipelineId, StreamFailureKind};
use crate::audio::playback::TrackListener;
use crate::audio::playback::input::{Inbox, WorkerEvent, WorkerInput};
use crate::audio::playback::item::PlaybackItem;
use crate::audio::playback::preferences::PlaybackPreferences;
use crate::audio::playback::queue::{PlaybackQueue, RepeatMode};
use crate::audio::playback::resolver::testing::{FakeTracks, resolver_of, track as library_track};
use crate::audio::playback::resolver::{NoTracks, TrackResolver};
use crate::audio::playback::service::{
    PlaybackCommand, PlaybackService, PlaybackServiceError, Reply,
};
use crate::audio::playback::session::POSITION_UPDATE_INTERVAL;
use crate::audio::playback::snapshot::{
    CurrentPlayback, PlaybackChannelConversion, PlaybackControls, PlaybackFailureCode,
    PlaybackPosition, PlaybackState, QueueState, StartedBy, UPCOMING_IN_SNAPSHOT,
};
use crate::audio::playback::worker::{PlaybackWorker, WorkerLinks};
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::errors::CommandError;
use crate::ids::{PlaybackId, TrackId};
use crate::library::media::ValidatedAudioFile;
use crate::library::tracks::PlayableTrack;
use crate::messages::{Notification, StateTopic, Versioned};
use crate::state_store::StateStore;
use crate::test_support::{
    NotificationLog, TestDirectory, state_store_for_tests, write_pcm_i16_wav,
};
use cpal::StreamInstant;
use parking_lot::{Mutex, RwLock};
use rand::{SeedableRng, rngs::StdRng};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};

const SAMPLE_RATE: u32 = 44_100;

/// The track ID a test gives the track of this name: the same name always gives the same ID.
fn track_id_of(name: &str) -> TrackId {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    TrackId::try_from_rowid(((hasher.finish() >> 1) as i64) | 1).unwrap()
}

// ---- the harness ----

type Answer<T> = Result<T, PlaybackServiceError>;

/// What the Player told its listener, in order: a track loaded as a playback, or a track about
/// to play next.
#[derive(Debug, Clone, PartialEq)]
enum Heard {
    Loaded(PlaybackId, String),
    Upcoming(String),
}

struct Harness {
    worker: PlaybackWorker,
    inputs: Receiver<WorkerInput>,
    state_store: Arc<StateStore>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    recorded: Arc<NotificationLog>,
    gain: AtomicEffectiveGain,
    output: FakeOutput,
    preferences: Arc<Mutex<Vec<PlaybackPreferences>>>,
    heard: Arc<Mutex<Vec<Heard>>>,
    files: TestDirectory,
    /// What the library knows; the queue reads its tracks from here.
    library: Arc<FakeTracks>,
}

impl Harness {
    fn new() -> Self {
        let (inbox, inputs) = Inbox::channel();
        let queue = PlaybackQueue::new(RepeatMode::Off, false);
        let volume = VolumeState::default();
        let library = Arc::new(FakeTracks::default());
        let position = Arc::new(RwLock::new(None));
        let (recorded, messages) = NotificationLog::shared();
        let state_store = state_store_for_tests(messages.clone());
        let gain = AtomicEffectiveGain::new(1.0);
        let output = FakeOutput::new();
        let preferences = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&preferences);
        let heard = Arc::new(Mutex::new(Vec::new()));
        let loaded_heard = Arc::clone(&heard);
        let upcoming_heard = Arc::clone(&heard);
        let listener = TrackListener {
            loaded: Arc::new(move |playback_id, track| {
                let title = track.track.core.title.clone();
                loaded_heard.lock().push(Heard::Loaded(playback_id, title));
            }),
            upcoming: Arc::new(move |track| {
                let title = track.track.core.title.clone();
                upcoming_heard.lock().push(Heard::Upcoming(title));
            }),
        };
        let worker = PlaybackWorker::new(
            WorkerLinks {
                state_store: Arc::clone(&state_store),
                position: Arc::clone(&position),
                effective_gain: gain.clone(),
                meter: Meter::new(),
                inbox,
                messages,
                observer: Arc::new(move |preferences| observed.lock().push(preferences)),
                backend: Box::new(output.clone()),
                tracks: resolver_of(&library),
                listener,
            },
            queue,
            volume,
            AudioOutputSelection::SystemDefault,
        );
        Self {
            worker,
            inputs,
            state_store,
            position,
            recorded,
            gain,
            output,
            preferences,
            heard,
            files: TestDirectory::new(),
            library,
        }
    }

    fn heard(&self) -> Vec<Heard> {
        self.heard.lock().clone()
    }

    /// A real WAV of `seconds` of silence, which the decode thread reads as any other file.
    fn track(&self, name: &str, seconds: usize) -> PlayableTrack {
        let path = self.files.file(&format!("{name}.wav"));
        write_pcm_i16_wav(
            &path,
            SAMPLE_RATE,
            1,
            &vec![0; SAMPLE_RATE as usize * seconds],
        );
        let mut track = library_track(
            track_id_of(name),
            ValidatedAudioFile {
                path,
                file_name: format!("{name}.wav"),
                extension: "wav".into(),
            },
        );
        track.track.core.title = name.into();
        track
    }

    /// Makes the library know `tracks` and returns their ids, which is what a queue is made of.
    fn register(&self, tracks: Vec<PlayableTrack>) -> Vec<TrackId> {
        tracks
            .into_iter()
            .map(|track| {
                let id = track.id();
                self.library.add(track);
                id
            })
            .collect()
    }

    fn snapshot(&self) -> PlaybackState {
        self.versioned_snapshot().value
    }

    fn versioned_snapshot(&self) -> Versioned<PlaybackState> {
        self.state_store.playback()
    }

    fn position(&self) -> Option<PlaybackPosition> {
        self.position.read().clone()
    }

    fn sent(&self) -> Vec<Notification> {
        self.recorded.sent()
    }

    fn queue_snapshot(&self) -> QueueState {
        self.versioned_queue_snapshot().value
    }

    fn versioned_queue_snapshot(&self) -> Versioned<QueueState> {
        self.state_store.queue()
    }

    /// Sends a command without waiting for the answer.
    fn send<T>(&mut self, make: impl FnOnce(Reply<T>) -> PlaybackCommand) -> Receiver<Answer<T>> {
        let (reply, answer) = std::sync::mpsc::sync_channel(1);
        self.worker.handle(WorkerInput::Command(make(reply)));
        answer
    }

    /// Hands the worker what arrives until `answer` has the reply.
    fn wait_for<T>(&mut self, answer: &Receiver<Answer<T>>) -> Answer<T> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Ok(result) = answer.try_recv() {
                return result;
            }
            self.deliver_next(deadline);
        }
    }

    fn call<T>(&mut self, make: impl FnOnce(Reply<T>) -> PlaybackCommand) -> Answer<T> {
        let answer = self.send(make);
        self.wait_for(&answer)
    }

    fn deliver_next(&mut self, deadline: Instant) {
        let wait = deadline.saturating_duration_since(Instant::now());
        match self.inputs.recv_timeout(wait) {
            Ok(input) => {
                self.worker.handle(input);
            }
            Err(
                std::sync::mpsc::RecvTimeoutError::Timeout
                | std::sync::mpsc::RecvTimeoutError::Disconnected,
            ) => panic!("the worker was left waiting for an input that never came"),
        }
    }

    fn pump_until(&mut self, done: impl Fn(&Self) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !done(self) {
            self.deliver_next(deadline);
        }
    }

    /// Hands the worker what has already arrived.
    fn deliver_pending(&mut self) {
        while let Ok(input) = self.inputs.try_recv() {
            self.worker.handle(input);
        }
    }

    fn event(&mut self, event: WorkerEvent) {
        self.worker.handle(WorkerInput::Event(event));
    }

    fn tick(&mut self) {
        self.worker.tick();
    }

    // The transport helpers answer with the snapshot alone; a test that reads a version calls
    // `call` and gets the `Versioned` answer.
    fn start(&mut self, tracks: Vec<PlayableTrack>, start_index: usize) -> Answer<PlaybackState> {
        let track_ids = self.register(tracks);
        self.call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index,
            reply,
        })
        .map(|versioned| versioned.value)
    }

    fn pause(&mut self) -> Answer<PlaybackState> {
        self.call(|reply| PlaybackCommand::Pause { reply })
            .map(|versioned| versioned.value)
    }

    fn resume(&mut self) -> Answer<PlaybackState> {
        self.call(|reply| PlaybackCommand::Resume { reply })
            .map(|versioned| versioned.value)
    }

    fn next(&mut self) -> Answer<PlaybackState> {
        self.call(|reply| PlaybackCommand::Next { reply })
            .map(|versioned| versioned.value)
    }

    fn seek(&mut self, position_ms: u64) -> Answer<PlaybackState> {
        self.call(|reply| PlaybackCommand::Seek { position_ms, reply })
            .map(|versioned| versioned.value)
    }

    fn select_output(&mut self, selection: AudioOutputSelection) -> Answer<PlaybackState> {
        self.call(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
            .map(|versioned| versioned.value)
    }

    /// The titles of the current item and then the upcoming ones.
    fn queue_titles(&self) -> Vec<String> {
        let queue = self.queue_snapshot();
        queue
            .current
            .into_iter()
            .chain(queue.upcoming)
            .map(|item| item.core.title)
            .collect()
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        self.worker.shutdown();
    }
}

/// Files that do not exist, so loading them fails as an unreadable file.
fn missing(count: usize) -> Vec<PlayableTrack> {
    (0..count)
        .map(|i| {
            library_track(
                track_id_of(&format!("track-{i}")),
                ValidatedAudioFile {
                    path: format!("C:/missing/track-{i}.flac").into(),
                    file_name: format!("track-{i}.flac"),
                    extension: "flac".into(),
                },
            )
        })
        .collect()
}

fn session(snapshot: &PlaybackState) -> &CurrentPlayback {
    snapshot.session().expect("a track is loaded")
}

fn is_playing(snapshot: &PlaybackState, title: &str) -> bool {
    matches!(snapshot, PlaybackState::Playing { session, .. } if session.item.track.core.title == title)
}

/// A listener that hears nothing, for tests that do not look at what it is told.
fn silent_listener() -> TrackListener {
    TrackListener {
        loaded: Arc::new(|_, _| {}),
        upcoming: Arc::new(|_| {}),
    }
}

fn start_service() -> PlaybackService {
    let messages = crate::test_support::null_notifier();
    PlaybackService::start_with_backend(
        state_store_for_tests(messages.clone()),
        messages,
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
        Arc::new(TrackResolver::new(Box::new(NoTracks))),
        silent_listener(),
        Box::new(FakeOutput::new()),
    )
    .expect("worker should start")
}
