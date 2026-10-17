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
use crate::audio::meter::MeterHub;
use crate::audio::output::{AudioOutputError, OutputStreamId, PipelineId, StreamFailureKind};
use crate::audio::playback::input::{Inbox, WorkerEvent, WorkerInput};
use crate::audio::playback::item::PlaybackItem;
use crate::audio::playback::preferences::PlaybackPreferences;
use crate::audio::playback::queue::{PlaybackQueue, PlaybackRepeatMode};
use crate::audio::playback::resolver::testing::{FakeTracks, resolver_of, track as library_track};
use crate::audio::playback::resolver::{NoTracks, TrackResolver};
use crate::audio::playback::service::{
    PlaybackCommand, PlaybackService, PlaybackServiceError, Reply,
};
use crate::audio::playback::session::POSITION_UPDATE_INTERVAL;
use crate::audio::playback::snapshot::{
    ActiveSession, PlaybackChannelConversion, PlaybackFailureCode, PlaybackPosition,
    PlaybackQueueSnapshot, PlaybackSnapshot, SessionStartedBy, SnapshotBase, UPCOMING_IN_SNAPSHOT,
};
use crate::audio::playback::worker::{PlaybackWorker, WorkerLinks};
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::ids::TrackId;
use crate::library::store::PlayableTrack;
use crate::media::validation::ValidatedAudioFile;
use crate::messages::{StateTopic, Versioned, testing::Sent};
use crate::test_support::{TestDirectory, write_pcm_i16_wav};
use cpal::StreamInstant;
use rand::{SeedableRng, rngs::StdRng};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex, RwLock};
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

struct Harness {
    worker: PlaybackWorker,
    inputs: Receiver<WorkerInput>,
    snapshot: Arc<RwLock<Versioned<PlaybackSnapshot>>>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    recorded: Arc<crate::messages::testing::RecordingMessageSink>,
    queue_snapshot: Arc<RwLock<Versioned<PlaybackQueueSnapshot>>>,
    gain: AtomicEffectiveGain,
    output: FakeOutput,
    preferences: Arc<Mutex<Vec<PlaybackPreferences>>>,
    files: TestDirectory,
    /// What the library knows; the queue reads its tracks from here.
    library: Arc<FakeTracks>,
}

impl Harness {
    fn new() -> Self {
        let (inbox, inputs) = Inbox::channel();
        let queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
        let volume = VolumeState::default();
        let snapshot = Arc::new(RwLock::new(Versioned::new(PlaybackSnapshot::Stopped {
            base: SnapshotBase::new(volume, AudioOutputSelection::SystemDefault),
            item: None,
        })));
        let queue_snapshot = Arc::new(RwLock::new(Versioned::new(PlaybackQueueSnapshot::empty(
            PlaybackRepeatMode::Off,
            false,
        ))));
        let library = Arc::new(FakeTracks::default());
        let position = Arc::new(RwLock::new(None));
        let (recorded, messages) = crate::messages::testing::RecordingMessageSink::shared();
        let gain = AtomicEffectiveGain::new(1.0);
        let output = FakeOutput::new();
        let preferences = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&preferences);
        let worker = PlaybackWorker::new(
            WorkerLinks {
                snapshot: Arc::clone(&snapshot),
                position: Arc::clone(&position),
                queue_snapshot: Arc::clone(&queue_snapshot),
                effective_gain: gain.clone(),
                meter: MeterHub::new(),
                inbox,
                messages,
                observer: Arc::new(move |preferences| observed.lock().unwrap().push(preferences)),
                backend: Box::new(output.clone()),
                tracks: resolver_of(&library),
                on_prefetch: Arc::new(|_| {}),
            },
            queue,
            volume,
            AudioOutputSelection::SystemDefault,
        );
        Self {
            worker,
            inputs,
            snapshot,
            position,
            recorded,
            queue_snapshot,
            gain,
            output,
            preferences,
            files: TestDirectory::new(),
            library,
        }
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

    fn snapshot(&self) -> PlaybackSnapshot {
        self.versioned_snapshot().value
    }

    fn versioned_snapshot(&self) -> Versioned<PlaybackSnapshot> {
        self.snapshot.read().unwrap().clone()
    }

    fn position(&self) -> Option<PlaybackPosition> {
        self.position.read().unwrap().clone()
    }

    fn sent(&self) -> Vec<Sent> {
        self.recorded.sent()
    }

    fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
        self.versioned_queue_snapshot().value
    }

    fn versioned_queue_snapshot(&self) -> Versioned<PlaybackQueueSnapshot> {
        self.queue_snapshot.read().unwrap().clone()
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
            Err(_) => panic!("the worker was left waiting for an input that never came"),
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

    // The transport helpers answer with the snapshot alone; a test that reads a revision calls
    // `call` and gets the `Versioned` answer.
    fn start(
        &mut self,
        tracks: Vec<PlayableTrack>,
        start_index: usize,
    ) -> Answer<PlaybackSnapshot> {
        let track_ids = self.register(tracks);
        self.call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index,
            reply,
        })
        .map(|versioned| versioned.value)
    }

    fn pause(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Pause { reply })
            .map(|versioned| versioned.value)
    }

    fn resume(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Resume { reply })
            .map(|versioned| versioned.value)
    }

    fn next(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Next { reply })
            .map(|versioned| versioned.value)
    }

    fn seek(&mut self, position_ms: u64) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Seek { position_ms, reply })
            .map(|versioned| versioned.value)
    }

    fn select_output(&mut self, selection: AudioOutputSelection) -> Answer<PlaybackSnapshot> {
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

fn session(snapshot: &PlaybackSnapshot) -> &ActiveSession {
    snapshot.session().expect("a track is loaded")
}

fn is_playing(snapshot: &PlaybackSnapshot, title: &str) -> bool {
    matches!(snapshot, PlaybackSnapshot::Playing { session, .. } if session.item.track.core.title == title)
}

fn start_service() -> PlaybackService {
    PlaybackService::start_with_backend(
        crate::messages::null_message_sink(),
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
        Arc::new(TrackResolver::new(Box::new(NoTracks))),
        Arc::new(|_| {}),
        Box::new(FakeOutput::new()),
    )
    .expect("worker should start")
}
