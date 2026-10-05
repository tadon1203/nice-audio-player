//! The worker is driven through the commands and events it receives, with a fake output device.
//! `Harness` plays the part of the worker thread: it hands the worker one input at a time, so a
//! test decides when a tick happens and when an event is delivered.

use super::input::{Inbox, WorkerEvent, WorkerInput};
use super::item::PlaybackItem;
use super::preferences::PlaybackPreferences;
use super::queue::{PlaybackQueue, PlaybackRepeatMode};
use super::resolver::testing::{resolver_of, track as library_track, FakeTracks};
use super::resolver::{NoTracks, TrackResolver};
use super::service::{PlaybackCommand, PlaybackService, PlaybackServiceError, Reply};
use super::session::{should_publish_position, POSITION_UPDATE_INTERVAL};
use super::snapshot::{
    ActiveSession, PlaybackChannelConversion, PlaybackFailureCode, PlaybackPosition,
    PlaybackProcessingInfo, PlaybackQueueSnapshot, PlaybackSnapshot, SnapshotBase,
    UPCOMING_IN_SNAPSHOT,
};
use super::worker::{
    output_failure_code, previous_restarts_track, stream_signal_action, FailureScope,
    PlaybackWorker, StartFailurePhase, StreamSignalAction, WorkerLinks,
};
use crate::audio::devices::AudioOutputSelection;
use crate::audio::fake_output::FakeOutput;
use crate::audio::meter::MeterHub;
use crate::audio::output::{AudioOutputError, OutputStreamId, PipelineId, StreamFailureKind};
use crate::audio::volume::{AtomicEffectiveGain, VolumeState};
use crate::events::BackendEvent;
use crate::library::store::PlayableTrack;
use crate::media::validation::ValidatedAudioFile;
use crate::test_support::{write_pcm_i16_wav, TestDirectory};
use cpal::StreamInstant;
use rand::{rngs::StdRng, SeedableRng};
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

const SAMPLE_RATE: u32 = 44_100;

// ---- the harness ----

type Answer<T> = Result<T, PlaybackServiceError>;

struct Harness {
    worker: PlaybackWorker,
    inputs: Receiver<WorkerInput>,
    snapshot: Arc<RwLock<PlaybackSnapshot>>,
    position: Arc<RwLock<Option<PlaybackPosition>>>,
    recorded: Arc<crate::events::testing::RecordingEventSink>,
    queue_snapshot: Arc<RwLock<PlaybackQueueSnapshot>>,
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
        let snapshot = Arc::new(RwLock::new(PlaybackSnapshot::Stopped {
            base: SnapshotBase::new(volume, AudioOutputSelection::SystemDefault),
            item: None,
        }));
        let queue_snapshot = Arc::new(RwLock::new(PlaybackQueueSnapshot::empty(
            0,
            PlaybackRepeatMode::Off,
            false,
        )));
        let library = Arc::new(FakeTracks::default());
        let position = Arc::new(RwLock::new(None));
        let (recorded, events) = crate::events::testing::RecordingEventSink::shared();
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
                events,
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
        PlayableTrack {
            title: name.into(),
            ..library_track(
                name,
                ValidatedAudioFile {
                    path: path.to_string_lossy().into_owned(),
                    file_name: format!("{name}.wav"),
                    extension: "wav".into(),
                },
            )
        }
    }

    /// Makes the library know `tracks` and returns their ids, which is what a queue is made of.
    fn register(&self, tracks: Vec<PlayableTrack>) -> Vec<String> {
        tracks
            .into_iter()
            .map(|track| {
                let id = track.track_id.clone();
                self.library.add(track);
                id
            })
            .collect()
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        self.snapshot.read().unwrap().clone()
    }

    fn position(&self) -> Option<PlaybackPosition> {
        self.position.read().unwrap().clone()
    }

    fn events(&self) -> Vec<BackendEvent> {
        self.recorded.events()
    }

    fn queue_snapshot(&self) -> PlaybackQueueSnapshot {
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
    }

    fn pause(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Pause { reply })
    }

    fn resume(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Resume { reply })
    }

    fn next(&mut self) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Next { reply })
    }

    fn seek(&mut self, position_ms: u64) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::Seek { position_ms, reply })
    }

    fn select_output(&mut self, selection: AudioOutputSelection) -> Answer<PlaybackSnapshot> {
        self.call(|reply| PlaybackCommand::SetOutputSelection { selection, reply })
    }

    /// The titles of the current item and then the upcoming ones.
    fn queue_titles(&self) -> Vec<String> {
        let queue = self.queue_snapshot();
        queue
            .current
            .into_iter()
            .chain(queue.upcoming)
            .map(|item| item.title)
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
                &format!("track-{i}"),
                ValidatedAudioFile {
                    path: format!("C:/missing/track-{i}.flac"),
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
    matches!(snapshot, PlaybackSnapshot::Playing { session, .. } if session.item.title == title)
}

// ---- starting ----

#[test]
fn a_start_plays_as_soon_as_the_prebuffer_is_ready() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "a"));
    assert_eq!(session(&snapshot).playback_id, "1");
    assert_eq!(session(&snapshot).duration_ms, Some(1_000));
    assert_eq!(session(&snapshot).output_device.name, "Fake speakers");
    assert!(harness.output.is_running());
    assert_eq!(harness.snapshot(), snapshot);
}

#[test]
fn the_worker_has_a_deadline_only_while_a_track_is_playing() {
    let mut harness = Harness::new();
    assert!(harness.worker.next_deadline().is_none(), "idle");

    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();
    assert!(harness.worker.next_deadline().is_some(), "playing");

    harness.pause().unwrap();
    assert!(harness.worker.next_deadline().is_none(), "paused");

    harness.start(missing(1), 0).unwrap_err();
    assert!(harness.worker.next_deadline().is_none(), "failed");
}

#[test]
fn a_playing_worker_wakes_only_a_few_times_per_second() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 60)];
    harness.start(tracks, 0).unwrap();
    harness.tick();

    let end = Instant::now() + Duration::from_secs(2);
    let mut wakes = 0;
    while let Some(deadline) = harness.worker.next_deadline() {
        if deadline >= end {
            break;
        }
        std::thread::sleep(deadline.saturating_duration_since(Instant::now()));
        harness.tick();
        wakes += 1;
    }

    assert!(wakes <= 4, "woke {wakes} times in 2 s");
}

#[test]
fn a_start_through_a_service_thread_needs_no_poll() {
    let output = FakeOutput::new();
    let library = Arc::new(FakeTracks::default());
    let directory = TestDirectory::new();
    let path = directory.file("a.wav");
    write_pcm_i16_wav(&path, SAMPLE_RATE, 1, &vec![0; SAMPLE_RATE as usize]);
    library.add(library_track(
        "a",
        ValidatedAudioFile {
            path: path.to_string_lossy().into_owned(),
            file_name: "a.wav".into(),
            extension: "wav".into(),
        },
    ));
    let service = PlaybackService::start_with_backend(
        crate::events::null_event_sink(),
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
        resolver_of(&library),
        Arc::new(|_| {}),
        Box::new(output.clone()),
    )
    .expect("worker should start");

    // The worker sleeps in a blocking receive while idle; only an event can wake it for this.
    let snapshot = service.handle().start(vec!["a".to_owned()], 0).unwrap();

    assert!(matches!(snapshot, PlaybackSnapshot::Playing { .. }));
    assert!(output.is_running());
    service.shutdown();
}

#[test]
fn navigating_while_paused_starts_the_next_track_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    let snapshot = harness.next().unwrap();

    assert!(
        matches!(&snapshot, PlaybackSnapshot::Paused { session, .. } if session.item.title == "b")
    );
    assert!(!harness.output.is_running());
}

#[test]
fn volume_and_next_are_answered_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    let volume = harness.call(|reply| PlaybackCommand::SetVolume {
        volume: 0.25,
        reply,
    });
    let next = harness.next();

    assert_eq!(volume.unwrap().base().volume, 0.25);
    assert!(is_playing(&next.unwrap(), "b"));
    assert_eq!(start.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
}

#[test]
fn a_superseded_start_is_answered_instead_of_dropped() {
    let mut harness = Harness::new();
    let first_tracks = vec![harness.track("a", 1)];
    let second_tracks = vec![harness.track("b", 1)];

    let first_ids = harness.register(first_tracks);
    let second_ids = harness.register(second_tracks);
    let first = harness.send(|reply| PlaybackCommand::Start {
        track_ids: first_ids,
        start_index: 0,
        reply,
    });
    let second = harness.send(|reply| PlaybackCommand::Start {
        track_ids: second_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(first.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
    assert!(is_playing(&harness.wait_for(&second).unwrap(), "b"));
}

// ---- failures while starting ----

#[test]
fn a_file_that_cannot_be_read_is_skipped_to_the_next_one() {
    let mut harness = Harness::new();
    let mut tracks = missing(1);
    tracks.push(harness.track("b", 1));
    tracks.extend(missing(1));

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn when_every_file_fails_each_is_tried_once_and_the_queue_survives() {
    let mut harness = Harness::new();

    let result = harness.start(missing(3), 0);

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    assert_eq!(harness.queue_snapshot().upcoming_count, 0);
    assert_eq!(harness.queue_snapshot().history_count, 2);
    assert_eq!(
        harness.queue_snapshot().current.unwrap().title,
        "track-2.flac"
    );
    let current = harness.snapshot();
    assert!(matches!(
        current,
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
    assert!(current.base().can_go_previous);
    assert!(!current.base().can_go_next);
}

#[test]
fn skipping_failed_files_is_bounded_even_when_the_queue_repeats() {
    let mut harness = Harness::new();
    harness
        .call(|reply| PlaybackCommand::SetRepeatMode {
            mode: PlaybackRepeatMode::All,
            reply,
        })
        .unwrap();

    let result = harness.start(missing(4), 1);

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.history_count + 1 + queue.upcoming_count, 4);
}

#[test]
fn navigating_onto_a_broken_file_reports_the_failure_and_keeps_the_queue() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("a", 1)];
    tracks.extend(missing(1));
    harness.start(tracks, 0).unwrap();

    let result = harness.next();

    assert_eq!(result, Err(PlaybackServiceError::DecodeFailed));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.history_count + 1 + queue.upcoming_count, 2);
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
}

#[test]
fn an_output_that_cannot_be_prepared_fails_without_skipping() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness
        .output
        .fail_next_prepare(AudioOutputError::UnsupportedConfiguration);

    let result = harness.start(tracks, 0);

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::UnsupportedOutputConfiguration
        ))
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::UnsupportedOutputConfiguration,
            ..
        }
    ));
}

#[test]
fn a_missing_output_device_is_reported_as_such() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness
        .output
        .fail_next_prepare(AudioOutputError::NoOutputDevice);

    assert_eq!(
        harness.start(tracks, 0),
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::NoOutputDevice
        ))
    );
}

#[test]
fn a_stream_that_will_not_start_fails_the_start_without_skipping() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness
        .output
        .fail_next_start(AudioOutputError::StreamStartFailed);

    let result = harness.start(tracks, 0);

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputStreamStartFailed
        ))
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

// ---- pause, resume, position ----

#[test]
fn pause_reads_the_newest_position_and_resume_continues() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(22_050);

    let paused = harness.pause().unwrap();

    assert!(matches!(paused, PlaybackSnapshot::Paused { .. }));
    assert_eq!(session(&paused).position_ms, 500);
    assert!(!harness.output.is_running());

    let resumed = harness.resume().unwrap();
    assert!(matches!(resumed, PlaybackSnapshot::Playing { .. }));
    assert_eq!(session(&resumed).position_ms, 500);
    assert!(harness.output.is_running());
}

#[test]
fn pausing_a_paused_track_changes_nothing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let paused = harness.pause().unwrap();

    assert_eq!(harness.pause().unwrap(), paused);
}

#[test]
fn pause_and_resume_need_a_loaded_track() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.pause(),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
    assert_eq!(
        harness.resume(),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn a_tick_publishes_the_position_the_speakers_reached_without_a_new_snapshot() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    let started = harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(44_100);
    let events = harness.events().len();

    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    assert_eq!(harness.position().unwrap().position_ms, 1_000);
    assert_eq!(
        harness.position().unwrap().playback_id,
        session(&started).playback_id
    );
    assert_eq!(
        harness.events()[events..],
        [BackendEvent::PlaybackPositionChanged]
    );
    assert_eq!(harness.snapshot(), started);
}

#[test]
fn a_tick_inside_the_publish_interval_publishes_nothing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    let started = harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(44_100);
    let events = harness.events().len();

    harness.tick();

    assert_eq!(harness.snapshot(), started);
    assert_eq!(harness.events().len(), events);
}

#[test]
fn a_state_change_carries_the_newest_position() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(22_050);

    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();

    assert_eq!(session(&muted).position_ms, 500);
    assert_eq!(harness.position().unwrap().position_ms, 500);
}

#[test]
fn previous_becomes_available_once_the_track_has_played_a_while() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 10)];
    let started = harness.start(tracks, 0).unwrap();
    assert!(!started.base().can_go_previous);
    harness.output.set_played_frames(SAMPLE_RATE as u64 * 5);

    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    assert!(harness.snapshot().base().can_go_previous);
    assert_eq!(
        harness.events().last(),
        Some(&BackendEvent::PlaybackChanged)
    );
}

// ---- the end of a track ----

#[test]
fn a_finished_track_moves_on_to_the_next_one() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.finish_playback();
    harness.deliver_pending();
    harness.tick();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn the_last_track_finishing_stops_and_clears_the_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.finish_playback();
    harness.deliver_pending();
    harness.tick();

    let PlaybackSnapshot::Stopped { item, .. } = harness.snapshot() else {
        panic!("the player must stop");
    };
    assert_eq!(item.unwrap().title, "a");
    assert!(harness.queue_snapshot().current.is_none());
}

#[test]
fn a_paused_track_does_not_finish_naturally() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.output.finish_playback();
    harness.deliver_pending();
    harness.pause().unwrap();

    harness.tick();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Paused { .. }
    ));
}

// ---- events from threads that are gone ----

#[test]
fn events_from_a_stream_the_worker_let_go_of_are_ignored() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let playing = harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::FinalFrames {
        pipeline: PipelineId(99),
        end_time: StreamInstant::new(0, 0),
    });
    harness.event(WorkerEvent::StreamFailed {
        stream: OutputStreamId(99),
        kind: StreamFailureKind::RuntimeFailed,
    });
    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(99),
    });
    harness.tick();

    assert_eq!(harness.snapshot(), playing);
}

// ---- failures while playing ----

#[test]
fn a_stream_failure_stops_with_the_queue_intact() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::RuntimeFailed);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::OutputStreamRuntimeFailed,
            ..
        }
    ));
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn resume_after_an_output_failure_retries_the_current_item_with_the_queue_intact() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.output.fail_stream(StreamFailureKind::RuntimeFailed);
    harness.deliver_pending();
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            skipping: false,
            ..
        }
    ));

    let snapshot = harness.resume().unwrap();

    assert!(is_playing(&snapshot, "a"));
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn a_failure_of_the_last_item_is_not_a_skip() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            skipping: false,
            ..
        }
    ));
}

#[test]
fn a_device_change_on_the_system_default_keeps_playing() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::DeviceChanged);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Playing { .. }
    ));
}

#[test]
fn a_device_change_on_a_chosen_device_keeps_playing() {
    let mut harness = Harness::new();
    harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.output.fail_stream(StreamFailureKind::DeviceChanged);
    harness.deliver_pending();

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Playing { .. }
    ));
}

#[test]
fn a_decode_failure_while_playing_moves_on_to_the_next_track() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));
}

#[test]
fn a_decode_failure_on_the_last_track_leaves_a_failed_player() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::DecodeFailed,
            ..
        }
    ));
}

#[test]
fn a_conversion_failure_while_playing_is_reported_with_its_own_code() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.event(WorkerEvent::ConversionFailed {
        pipeline: PipelineId(1),
    });

    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::SampleRateConversionFailed,
            ..
        }
    ));
}

#[test]
fn the_session_carries_the_source_format_of_the_loaded_track() {
    let mut harness = Harness::new();
    let mut known = harness.track("known", 1);
    known.file_format = Some("FLAC".into());
    known.bit_depth = Some(24);
    known.bitrate_kbps = Some(1_411);
    let unknown = harness.track("unknown", 1);

    let snapshot = harness.start(vec![known, unknown], 0).unwrap();
    assert_eq!(session(&snapshot).source_format, "FLAC");
    assert_eq!(session(&snapshot).source_bit_depth, Some(24));
    assert_eq!(session(&snapshot).source_bitrate_kbps, Some(1_411));

    let snapshot = harness.next().unwrap();
    assert_eq!(
        session(&snapshot).source_format,
        "wav",
        "a file the library does not know is named by its extension"
    );
    assert_eq!(session(&snapshot).source_bit_depth, None);
}

// ---- seeking ----

#[test]
fn a_seek_moves_the_position_and_keeps_the_session() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let seeked = harness.seek(1_500).unwrap();

    assert!(matches!(seeked, PlaybackSnapshot::Playing { .. }));
    let position = session(&seeked).position_ms;
    assert!((1_450..=1_550).contains(&position), "position {position}");
    assert_eq!(session(&seeked).seek_revision, 1);
    assert_eq!(session(&seeked).playback_id, session(&started).playback_id);
    assert!(harness.output.is_running());
}

#[test]
fn a_seek_while_paused_stays_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    let seeked = harness.seek(1_000).unwrap();

    assert!(matches!(seeked, PlaybackSnapshot::Paused { .. }));
    assert!(!harness.output.is_running());
}

#[test]
fn a_newer_seek_supersedes_one_still_prebuffering() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    let first = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 500,
        reply,
    });
    let second = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 2_000,
        reply,
    });

    assert_eq!(first.try_recv(), Ok(Err(PlaybackServiceError::Superseded)));
    let position = session(&harness.wait_for(&second).unwrap()).position_ms;
    assert!((1_950..=2_050).contains(&position), "position {position}");
}

#[test]
fn other_commands_are_answered_while_a_seek_prebuffers() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    let seek = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 1_000,
        reply,
    });
    let volume = harness.call(|reply| PlaybackCommand::SetVolume {
        volume: 0.25,
        reply,
    });

    assert_eq!(volume.unwrap().base().volume, 0.25);
    harness.wait_for(&seek).unwrap();
}

#[test]
fn seeking_needs_a_loaded_track() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.seek(1_000),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn seeking_to_the_end_stops() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let snapshot = harness.seek(5_000).unwrap();

    assert!(matches!(snapshot, PlaybackSnapshot::Stopped { .. }));
}

#[test]
fn seeking_past_the_end_plays_the_next_track_like_a_natural_finish() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    let snapshot = harness.seek(5_000).unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn seeks_reuse_the_one_output_stream_of_the_session() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();

    harness.seek(1_000).unwrap();
    harness.seek(2_000).unwrap();

    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 2);
    assert!(harness.output.is_running(), "a seek never stops the output");
}

#[test]
fn a_seek_while_paused_hands_over_the_queue_without_starting_the_output() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();

    harness.seek(1_000).unwrap();

    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 1);
    assert!(!harness.output.is_running());
}

#[test]
fn the_position_after_a_seek_counts_from_the_target_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.seek(1_000).unwrap();

    // The speakers got 0.5 s into the new queue.
    harness.output.set_played_frames(u64::from(SAMPLE_RATE) / 2);
    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.tick();

    let position = harness.position().unwrap().position_ms;
    assert!((1_450..=1_550).contains(&position), "position {position}");
}

#[test]
fn a_seek_whose_decode_fails_keeps_the_session_and_its_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let seek = harness.send(|reply| PlaybackCommand::Seek {
        position_ms: 1_000,
        reply,
    });
    // The seek's pipeline is the second one the worker opened.
    harness.event(WorkerEvent::DecodeFailed {
        pipeline: PipelineId(2),
    });

    assert_eq!(seek.try_recv(), Ok(Err(PlaybackServiceError::DecodeFailed)));
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Playing { .. }));
    assert_eq!(
        session(&snapshot).playback_id,
        session(&started).playback_id
    );
    assert_eq!(harness.output.streams_opened(), 1);
    assert_eq!(harness.output.queue_switches(), 0);
}

#[test]
fn a_failed_pause_fails_the_player() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness
        .output
        .fail_next_pause(AudioOutputError::StreamPauseFailed);

    let result = harness.pause();

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputStreamPauseFailed
        ))
    );
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Failed {
            error: PlaybackFailureCode::OutputStreamPauseFailed,
            ..
        }
    ));
}

#[test]
fn pausing_while_a_track_loads_starts_it_paused() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    harness.pause().unwrap();
    let loaded = harness.wait_for(&start).unwrap();

    assert!(matches!(loaded, PlaybackSnapshot::Paused { .. }));
    assert!(!harness.output.is_running());
}

#[test]
fn resuming_while_a_paused_start_loads_plays_it() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.pause().unwrap();
    let start = harness.send(|reply| PlaybackCommand::Next { reply });

    harness.resume().unwrap();

    assert!(is_playing(&harness.wait_for(&start).unwrap(), "b"));
}

#[test]
fn a_device_switch_keeps_the_playback_id() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    let started = harness.start(tracks, 0).unwrap();

    let switched = harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();

    assert_eq!(
        session(&switched).playback_id,
        session(&started).playback_id
    );
}

#[test]
fn a_failed_device_switch_keeps_the_saved_selection_and_the_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3), harness.track("b", 3)];
    harness.start(tracks, 0).unwrap();
    harness
        .output
        .fail_next_prepare(AudioOutputError::DeviceUnavailable);

    let result = harness.select_output(AudioOutputSelection::Device {
        device_id: "fake-other".into(),
    });

    assert_eq!(
        result,
        Err(PlaybackServiceError::from(
            PlaybackFailureCode::OutputDeviceUnavailable
        ))
    );
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Failed { .. }));
    assert_eq!(
        snapshot.base().output_selection,
        AudioOutputSelection::SystemDefault
    );
    assert!(harness.preferences.lock().unwrap().is_empty());
    assert_eq!(harness.queue_titles(), ["a", "b"]);
}

#[test]
fn previous_restarts_a_track_that_has_played_for_a_while() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 5), harness.track("b", 5)];
    harness.start(tracks, 1).unwrap();
    harness.output.set_played_frames(4 * u64::from(SAMPLE_RATE));
    harness.pause().unwrap();

    let restarted = harness
        .call(|reply| PlaybackCommand::Previous { reply })
        .unwrap();

    assert!(
        matches!(&restarted, PlaybackSnapshot::Paused { session, .. } if session.item.title == "b")
    );
    assert!(session(&restarted).position_ms < 100);
}

#[test]
fn navigation_availability_follows_the_queue_and_the_restart_rule() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 5), harness.track("b", 5)];
    let early = harness.start(tracks, 0).unwrap();
    assert!(!early.base().can_go_previous);
    assert!(early.base().can_go_next);

    harness.output.set_played_frames(4 * u64::from(SAMPLE_RATE));
    let late = harness.pause().unwrap();
    assert!(late.base().can_go_previous, "previous restarts the track");
}

// ---- queue edits ----

#[test]
fn queue_edits_are_rejected_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let extra = vec![harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    let extra_ids = harness.register(extra);
    let result = harness.call(|reply| PlaybackCommand::Enqueue {
        track_ids: extra_ids,
        next: false,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::QueueBusy));
    harness.wait_for(&start).unwrap();
}

#[test]
fn enqueueing_on_an_empty_queue_starts_playback_inside_the_worker() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let track_ids = harness.register(tracks);

    let queue = harness
        .call(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next: false,
            reply,
        })
        .unwrap();

    assert_eq!(queue.current.map(|item| item.title), Some("a".into()));
    assert_eq!(queue.upcoming_count, 1);
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "a"));
}

#[test]
fn enqueueing_nothing_on_an_empty_queue_is_refused() {
    let mut harness = Harness::new();

    let result = harness.call(|reply| PlaybackCommand::Enqueue {
        track_ids: Vec::new(),
        next: false,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::InvalidPlaybackState));
}

// ---- output selection ----

#[test]
fn the_output_can_be_chosen_while_stopped() {
    let mut harness = Harness::new();
    let selection = AudioOutputSelection::Device {
        device_id: "fake-other".into(),
    };

    let snapshot = harness.select_output(selection.clone()).unwrap();

    assert_eq!(snapshot.base().output_selection, selection);
    assert_eq!(harness.preferences.lock().unwrap().len(), 1);
    assert_eq!(harness.select_output(selection).unwrap(), snapshot);
    assert_eq!(harness.preferences.lock().unwrap().len(), 1, "no change");
}

#[test]
fn an_unusable_output_is_rejected() {
    let mut harness = Harness::new();

    assert_eq!(
        harness.select_output(AudioOutputSelection::Device {
            device_id: String::new()
        }),
        Err(PlaybackServiceError::InvalidDeviceId)
    );
    assert_eq!(
        harness.select_output(AudioOutputSelection::Device {
            device_id: "unplugged".into()
        }),
        Err(PlaybackServiceError::OutputDeviceUnavailable)
    );
}

#[test]
fn the_output_cannot_be_chosen_while_a_start_loads() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    let track_ids = harness.register(tracks);
    let start = harness.send(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(
        harness.select_output(AudioOutputSelection::SystemDefault),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
    harness.wait_for(&start).unwrap();
}

#[test]
fn switching_the_output_while_paused_resumes_the_position_on_the_new_device() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 3)];
    harness.start(tracks, 0).unwrap();
    harness.output.set_played_frames(u64::from(SAMPLE_RATE));
    harness.pause().unwrap();

    let restarted = harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    harness.pump_until(|harness| {
        harness
            .snapshot()
            .session()
            .is_some_and(|session| session.seek_revision == 1)
    });

    assert!(matches!(restarted, PlaybackSnapshot::Paused { .. }));
    let snapshot = harness.snapshot();
    assert!(matches!(snapshot, PlaybackSnapshot::Paused { .. }));
    assert_eq!(session(&snapshot).output_device.name, "Other fake speakers");
    let position = session(&snapshot).position_ms;
    assert!((950..=1_050).contains(&position), "position {position}");
    assert_eq!(harness.preferences.lock().unwrap().len(), 1);
    assert_eq!(
        harness.output.prepared_selections().last(),
        Some(&AudioOutputSelection::Device {
            device_id: "fake-other".into()
        })
    );
}

// ---- volume ----

#[test]
fn volume_commands_update_the_snapshot_and_the_gain() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    let changed = harness
        .call(|reply| PlaybackCommand::SetVolume { volume: 0.5, reply })
        .unwrap();
    assert_eq!((changed.base().volume, changed.base().muted), (0.5, false));
    assert_eq!(harness.gain.load(), 0.5);

    let before_invalid = harness.snapshot();
    assert_eq!(
        harness.call(|reply| PlaybackCommand::SetVolume {
            volume: f32::NAN,
            reply
        }),
        Err(PlaybackServiceError::InvalidVolume)
    );
    assert_eq!(harness.snapshot(), before_invalid);

    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();
    assert_eq!((muted.base().volume, muted.base().muted), (0.5, true));
    assert_eq!(harness.gain.load(), 0.0);
    let unmuted = harness
        .call(|reply| PlaybackCommand::Unmute { reply })
        .unwrap();
    assert_eq!((unmuted.base().volume, unmuted.base().muted), (0.5, false));
    assert_eq!(harness.gain.load(), 0.5);
}

#[test]
fn published_revisions_grow_and_commands_that_change_nothing_keep_theirs() {
    let mut harness = Harness::new();

    let changed = harness
        .call(|reply| PlaybackCommand::SetVolume { volume: 0.5, reply })
        .unwrap();
    let muted = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();
    let muted_again = harness
        .call(|reply| PlaybackCommand::Mute { reply })
        .unwrap();

    assert_eq!(changed.revision(), 1);
    assert_eq!(muted.revision(), 2);
    assert_eq!(muted_again.revision(), 2);
}

// ---- the service ----

fn start_service() -> PlaybackService {
    PlaybackService::start_with_backend(
        crate::events::null_event_sink(),
        PlaybackPreferences::default(),
        Arc::new(|_| {}),
        Arc::new(TrackResolver::new(Box::new(NoTracks))),
        Arc::new(|_| {}),
        Box::new(FakeOutput::new()),
    )
    .expect("worker should start")
}

#[test]
fn the_initial_snapshot_is_stopped_with_the_saved_volume() {
    let service = start_service();

    assert_eq!(
        serde_json::to_value(service.snapshot()).unwrap(),
        serde_json::json!({"status": "stopped", "base": base_json(), "item": null})
    );
    service.shutdown();
}

#[test]
fn shutdown_joins_the_worker_thread() {
    let service = start_service();
    service.shutdown();

    assert!(service.worker.lock().unwrap().is_none());
}

#[test]
fn commands_after_shutdown_report_an_unavailable_worker() {
    let service = start_service();
    let handle = service.handle();
    service.shutdown();

    assert_eq!(handle.pause(), Err(PlaybackServiceError::WorkerUnavailable));
}

// ---- pure rules ----

#[test]
fn processing_info_derives_resampling_from_rates() {
    let equal = PlaybackProcessingInfo {
        channel_conversion: PlaybackChannelConversion::None,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
    };
    let different = PlaybackProcessingInfo {
        source_sample_rate: 44_100,
        output_sample_rate: 48_000,
        ..equal
    };
    assert!(!equal.resampling_active());
    assert!(different.resampling_active());
}

#[test]
fn classifies_stream_failures_by_selection_and_kind() {
    let device = AudioOutputSelection::Device {
        device_id: "device".into(),
    };
    let default = AudioOutputSelection::SystemDefault;
    assert_eq!(
        stream_signal_action(&default, StreamFailureKind::DeviceChanged),
        StreamSignalAction::RefreshDefaultDevice
    );
    assert_eq!(
        stream_signal_action(&device, StreamFailureKind::DeviceChanged),
        StreamSignalAction::PreservePlayback
    );
    assert_eq!(
        stream_signal_action(&default, StreamFailureKind::DeviceUnavailable),
        StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
    );
    assert_eq!(
        stream_signal_action(&default, StreamFailureKind::RuntimeFailed),
        StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
    );
    assert_eq!(
        stream_signal_action(&default, StreamFailureKind::CompletionTimingFailed),
        StreamSignalAction::Fail(PlaybackFailureCode::CompletionTimingFailed)
    );
}

#[test]
fn maps_output_errors_to_failure_codes() {
    use AudioOutputError as E;
    use PlaybackFailureCode as C;
    for (error, code) in [
        (E::NoOutputDevice, C::NoOutputDevice),
        (E::DeviceUnavailable, C::OutputDeviceUnavailable),
        (
            E::UnsupportedConfiguration,
            C::UnsupportedOutputConfiguration,
        ),
        (
            E::StreamConfigurationUnsupported,
            C::UnsupportedOutputConfiguration,
        ),
        (
            E::ConfigurationQueryFailed,
            C::UnsupportedOutputConfiguration,
        ),
        (E::StreamBuildFailed, C::OutputStreamBuildFailed),
        (E::StreamStartFailed, C::OutputStreamStartFailed),
        (E::StreamPauseFailed, C::OutputStreamPauseFailed),
        (E::StreamResumeFailed, C::OutputStreamResumeFailed),
    ] {
        assert_eq!(output_failure_code(error.clone()), code, "{error:?}");
    }
}

#[test]
fn start_failure_scope_separates_file_problems_from_output_problems() {
    for phase in [
        StartFailurePhase::SourceOpen,
        StartFailurePhase::SourceMetadata,
        StartFailurePhase::DecoderOpen,
        StartFailurePhase::FirstPacketDecode,
        StartFailurePhase::ProcessorCreate,
        StartFailurePhase::PrebufferDecode,
        StartFailurePhase::PrebufferConversion,
    ] {
        assert_eq!(phase.scope(), FailureScope::Item, "{phase:?}");
    }
    for phase in [
        StartFailurePhase::SourceWorker,
        StartFailurePhase::OutputPrepare,
        StartFailurePhase::StreamStart,
    ] {
        assert_eq!(phase.scope(), FailureScope::Output, "{phase:?}");
    }
}

#[test]
fn previous_restarts_after_three_seconds_of_a_track_with_a_duration() {
    assert!(!previous_restarts_track(2_999, Some(60_000)));
    assert!(previous_restarts_track(3_000, Some(60_000)));
    assert!(!previous_restarts_track(30_000, None));
}

#[test]
fn position_publication_requires_interval_and_a_changed_position() {
    assert!(!should_publish_position(
        POSITION_UPDATE_INTERVAL - Duration::from_millis(1),
        true
    ));
    assert!(!should_publish_position(POSITION_UPDATE_INTERVAL, false));
    assert!(should_publish_position(POSITION_UPDATE_INTERVAL, true));
    assert!(should_publish_position(POSITION_UPDATE_INTERVAL * 2, true));
}

// ---- the wire format ----

fn test_item() -> PlaybackItem {
    PlaybackItem {
        queue_item_id: "queue-item-1".into(),
        track: library_track(
            "7",
            ValidatedAudioFile {
                path: "C:/test.flac".into(),
                file_name: "test.flac".into(),
                extension: "flac".into(),
            },
        ),
    }
}

fn base() -> SnapshotBase {
    SnapshotBase::new(VolumeState::default(), AudioOutputSelection::SystemDefault)
}

fn wire_session() -> ActiveSession {
    ActiveSession {
        item: test_item(),
        playback_id: "1".into(),
        position_ms: 1_000,
        seek_revision: 0,
        duration_ms: Some(60_000),
        output_device: crate::audio::devices::AudioOutputDeviceIdentity {
            id: "test-device".into(),
            name: "Test device".into(),
        },
        channel_conversion: PlaybackChannelConversion::None,
        source_format: "FLAC".into(),
        source_bit_depth: Some(24),
        source_bitrate_kbps: None,
        source_sample_rate: 44_100,
        output_sample_rate: 44_100,
        resampling_active: false,
    }
}

fn item_json() -> serde_json::Value {
    serde_json::json!({
        "queueItemId": "queue-item-1",
        "trackId": "7",
        "trackNumber": null,
        "discNumber": null,
        "year": null,
        "albumKey": null,
        "albumTrackCount": null,
        "file": { "path": "C:/test.flac", "fileName": "test.flac", "extension": "flac" },
        "title": "test.flac",
        "artist": null,
        "album": null,
        "albumArtist": null,
        "artwork": null,
        "durationMs": null
    })
}

fn base_json() -> serde_json::Value {
    serde_json::json!({
        "revision": 0,
        "volume": 1.0,
        "muted": false,
        "outputSelection": { "kind": "systemDefault" },
        "canGoPrevious": false,
        "canGoNext": false
    })
}

fn session_json() -> serde_json::Value {
    serde_json::json!({
        "item": item_json(),
        "playbackId": "1",
        "positionMs": 1_000,
        "seekRevision": 0,
        "durationMs": 60_000,
        "outputDevice": { "id": "test-device", "name": "Test device" },
        "channelConversion": "none",
        "sourceFormat": "FLAC",
        "sourceBitDepth": 24,
        "sourceBitrateKbps": null,
        "sourceSampleRate": 44_100,
        "outputSampleRate": 44_100,
        "resamplingActive": false
    })
}

#[test]
fn serializes_playing_and_paused_snapshots_with_a_camel_case_playback_id() {
    let playing = PlaybackSnapshot::Playing {
        base: base(),
        session: wire_session(),
    };
    let paused = PlaybackSnapshot::Paused {
        base: base(),
        session: wire_session(),
    };

    assert_eq!(
        serde_json::to_value(playing).unwrap(),
        serde_json::json!({ "status": "playing", "base": base_json(), "session": session_json() })
    );
    assert_eq!(
        serde_json::to_value(paused).unwrap(),
        serde_json::json!({ "status": "paused", "base": base_json(), "session": session_json() })
    );
}

#[test]
fn serializes_a_missing_playback_id_as_null_in_a_failed_snapshot() {
    let snapshot = PlaybackSnapshot::Failed {
        base: base(),
        item: None,
        playback_id: None,
        error: PlaybackFailureCode::NoOutputDevice,
        skipping: false,
    };

    assert_eq!(
        serde_json::to_value(snapshot).unwrap(),
        serde_json::json!({
            "status": "failed",
            "base": base_json(),
            "item": null,
            "playbackId": null,
            "error": "noOutputDevice",
            "skipping": false
        })
    );
}

// ---- undo ----

fn restore(harness: &mut Harness) -> Answer<PlaybackSnapshot> {
    harness.call(|reply| PlaybackCommand::RestorePreviousQueue { reply })
}

#[test]
fn replacing_the_queue_can_be_undone_in_one_step() {
    let mut harness = Harness::new();
    let first = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(first, 0).unwrap();
    assert!(!harness.queue_snapshot().can_restore_previous);

    let second = vec![harness.track("c", 1)];
    harness.start(second, 0).unwrap();
    assert!(harness.queue_snapshot().can_restore_previous);

    let restored = restore(&mut harness).unwrap();

    assert!(
        is_playing(&restored, "a"),
        "the item that was current plays again"
    );
    assert_eq!(harness.queue_titles(), ["a", "b"]);
    assert!(
        !harness.queue_snapshot().can_restore_previous,
        "one step back, no further"
    );
    assert_eq!(
        restore(&mut harness),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn there_is_nothing_to_undo_after_starting_from_an_empty_queue() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    assert!(!harness.queue_snapshot().can_restore_previous);
    assert_eq!(
        restore(&mut harness),
        Err(PlaybackServiceError::InvalidPlaybackState)
    );
}

#[test]
fn clearing_upcoming_can_be_undone_without_restarting_the_track() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    let playing = harness.start(tracks, 0).unwrap();
    harness
        .call(|reply| PlaybackCommand::ClearQueue { reply })
        .unwrap();
    assert_eq!(harness.queue_titles(), ["a"]);
    assert!(harness.queue_snapshot().can_restore_previous);

    let restored = restore(&mut harness).unwrap();

    assert_eq!(harness.queue_titles(), ["a", "b", "c"]);
    assert_eq!(
        session(&restored).playback_id,
        session(&playing).playback_id,
        "the track that kept playing is not restarted"
    );
}

#[test]
fn an_undone_queue_follows_the_shuffle_chosen_since() {
    let mut harness = Harness::new();
    let first = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(first, 0).unwrap();
    let second = vec![harness.track("c", 1)];
    harness.start(second, 0).unwrap();
    harness
        .call(|reply| PlaybackCommand::SetShuffle {
            enabled: true,
            reply,
        })
        .unwrap();

    restore(&mut harness).unwrap();

    let queue = harness.queue_snapshot();
    assert!(queue.shuffle_enabled);
    assert_eq!(queue.current.map(|item| item.title), Some("a".into()));
    assert_eq!(queue.upcoming_count, 1);
}

// ---- lazy resolution ----

#[test]
fn starting_reads_only_the_part_of_a_huge_queue_that_is_shown() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("first", 1)];
    tracks.extend((0..4_999).map(|i| named_track(&format!("t{i}"))));

    let snapshot = harness.start(tracks, 0).unwrap();

    assert!(is_playing(&snapshot, "first"));
    let queue = harness.queue_snapshot();
    assert_eq!(queue.upcoming_count, 4_999);
    assert_eq!(queue.upcoming.len(), UPCOMING_IN_SNAPSHOT);
    assert!(
        harness.library.reads() <= UPCOMING_IN_SNAPSHOT + 2,
        "read {} tracks for a queue of 5000",
        harness.library.reads()
    );
}

#[test]
fn the_rows_further_down_a_long_queue_are_read_when_asked_for() {
    let mut harness = Harness::new();
    let mut tracks = vec![harness.track("first", 1)];
    tracks.extend((0..999).map(|i| named_track(&format!("t{i}"))));
    harness.start(tracks, 0).unwrap();
    let before = harness.library.reads();

    let window = harness.queue_snapshot().window(500, 50);

    assert_eq!(window.offset, 500);
    assert_eq!(window.items.len(), 50);
    assert_eq!(window.items[0].title, "t500.flac");
    assert_eq!(harness.library.reads() - before, 50);
}

#[test]
fn a_track_that_left_the_library_after_the_start_is_dropped_where_it_is_read() {
    let mut harness = Harness::new();
    let first = harness.track("first", 1);
    let mut tracks = vec![first];
    tracks.extend(["x", "gone", "y"].map(named_track));
    let track_ids = harness.register(tracks);
    harness.library.remove("gone");

    harness
        .call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index: 0,
            reply,
        })
        .unwrap();

    let queue = harness.queue_snapshot();
    assert_eq!(queue.upcoming_count, 2, "the missing item is not counted");
    assert_eq!(
        harness.queue_titles(),
        ["first", "x.flac", "y.flac"],
        "nor shown"
    );
}

#[test]
fn a_current_track_that_left_the_library_is_skipped() {
    let mut harness = Harness::new();
    let tracks = vec![named_track("gone"), harness.track("b", 1)];
    let track_ids = harness.register(tracks);
    harness.library.remove("gone");

    let snapshot = harness
        .call(|reply| PlaybackCommand::Start {
            track_ids,
            start_index: 0,
            reply,
        })
        .unwrap();

    assert!(is_playing(&snapshot, "b"));
    assert_eq!(harness.queue_snapshot().history_count, 0);
}

#[test]
fn when_every_track_has_left_the_library_the_start_is_refused() {
    let mut harness = Harness::new();
    let track_ids = harness.register(vec![named_track("gone")]);
    harness.library.remove("gone");

    let result = harness.call(|reply| PlaybackCommand::Start {
        track_ids,
        start_index: 0,
        reply,
    });

    assert_eq!(result, Err(PlaybackServiceError::TrackUnavailable));
    assert!(harness.queue_snapshot().current.is_none());
}

#[test]
fn a_window_leaves_out_a_track_that_has_left_the_library_since() {
    let library = Arc::new(FakeTracks::default());
    let tracks = resolver_of(&library);
    let ids: Vec<String> = (0..10).map(|i| format!("t{i}")).collect();
    for id in &ids {
        library.add(named_track(id));
    }
    let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
    queue
        .replace(ids, 0, &mut StdRng::seed_from_u64(1))
        .unwrap();
    let snapshot = PlaybackQueueSnapshot::of(1, &queue, &tracks, false);
    tracks.forget();
    library.remove("t4");

    let window = snapshot.window(0, 20);

    assert_eq!(window.items.len(), 8, "nine upcoming, one of them gone");
    assert!(window.items.iter().all(|item| item.track_id != "t4"));
}

#[test]
fn a_long_queue_snapshot_carries_a_prefix_and_serves_the_rest_in_windows() {
    let library = Arc::new(FakeTracks::default());
    let tracks = resolver_of(&library);
    let total = UPCOMING_IN_SNAPSHOT + 150;
    let ids: Vec<String> = (0..total + 61).map(|i| format!("t{i}")).collect();
    for id in &ids {
        library.add(named_track(id));
    }
    let mut queue = PlaybackQueue::new(PlaybackRepeatMode::Off, false);
    queue
        .replace(ids, 60, &mut StdRng::seed_from_u64(1))
        .unwrap();

    let snapshot = PlaybackQueueSnapshot::of(7, &queue, &tracks, false);

    assert_eq!(snapshot.history.len(), 50);
    assert_eq!(snapshot.history_count, 60);
    assert_eq!(
        snapshot.history.last().map(|i| i.title.as_str()),
        Some("t59.flac")
    );
    assert_eq!(snapshot.upcoming.len(), UPCOMING_IN_SNAPSHOT);
    assert_eq!(snapshot.upcoming_count as usize, total);
    assert_eq!(library.reads(), 50 + 1 + UPCOMING_IN_SNAPSHOT);
    let window = snapshot.window(UPCOMING_IN_SNAPSHOT, 500);
    assert_eq!(window.revision, 7);
    assert_eq!(window.offset as usize, UPCOMING_IN_SNAPSHOT);
    assert_eq!(window.items.len(), 150);
    assert_eq!(window.items[0].title, "t261.flac");
    assert!(snapshot.window(total + 10, 5).items.is_empty());
}

/// A track whose file does not exist: fine to queue and show, unplayable.
fn named_track(name: &str) -> PlayableTrack {
    library_track(
        name,
        ValidatedAudioFile {
            path: format!("C:/music/{name}.flac"),
            file_name: format!("{name}.flac"),
            extension: "flac".into(),
        },
    )
}

// ---- gapless ----

impl Harness {
    /// A WAV of `seconds` of silence in another format than `track` makes.
    fn track_in(&self, name: &str, rate: u32, channels: u16, seconds: usize) -> PlayableTrack {
        let path = self.files.file(&format!("{name}.wav"));
        write_pcm_i16_wav(
            &path,
            rate,
            channels,
            &vec![0; rate as usize * usize::from(channels) * seconds],
        );
        PlayableTrack {
            title: name.into(),
            ..library_track(
                name,
                ValidatedAudioFile {
                    path: path.to_string_lossy().into_owned(),
                    file_name: format!("{name}.wav"),
                    extension: "wav".into(),
                },
            )
        }
    }

    /// Ticks until the next track is chained to the stream.
    fn prefetch_next(&mut self) {
        self.tick();
        self.pump_until(|harness| harness.output.chained_pipeline().is_some());
    }

    /// Lets a prefetch that cannot be chained finish trying.
    fn settle_prefetch(&mut self) {
        self.tick();
        std::thread::sleep(Duration::from_millis(150));
        self.deliver_pending();
    }

    /// The stream heard the end of the playing track.
    fn hear_the_end(&mut self) {
        self.output.finish_playback();
        self.deliver_pending();
        self.tick();
    }
}

#[test]
fn a_track_of_the_same_format_follows_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    let first = harness.start(tracks, 0).unwrap();

    harness.prefetch_next();
    harness.hear_the_end();

    let snapshot = harness.snapshot();
    assert!(is_playing(&snapshot, "b"));
    assert_ne!(
        session(&snapshot).playback_id,
        session(&first).playback_id,
        "each track is its own playback"
    );
    assert_eq!(session(&snapshot).position_ms, 0);
    assert_eq!(harness.output.streams_opened(), 1, "the stream is kept");
    assert_eq!(harness.output.adoptions(), 1);
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
    assert!(harness.output.is_running());
}

#[test]
fn a_track_of_another_sample_rate_reopens_the_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track_in("b", 48_000, 2, 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    assert_eq!(harness.output.chained_pipeline(), None);
    harness.hear_the_end();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(
        harness.output.streams_opened(),
        2,
        "a short gap is accepted"
    );
    assert_eq!(harness.output.adoptions(), 0);
    let snapshot = harness.snapshot();
    assert_eq!(session(&snapshot).source_sample_rate, 48_000);
}

#[test]
fn a_different_channel_count_reopens_the_stream_too() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track_in("b", SAMPLE_RATE, 2, 1),
    ];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    harness.hear_the_end();
    harness.pump_until(|harness| is_playing(&harness.snapshot(), "b"));

    assert_eq!(harness.output.streams_opened(), 2);
}

#[test]
fn a_long_track_is_not_prefetched_until_its_last_ten_seconds() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 30), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness
        .output
        .set_played_frames(21 * u64::from(SAMPLE_RATE));
    std::thread::sleep(POSITION_UPDATE_INTERVAL + Duration::from_millis(10));
    harness.prefetch_next();
}

#[test]
fn putting_a_track_next_discards_the_prefetch_and_plays_it_next() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    let track_ids = harness.register(vec![harness.track("d", 1)]);
    harness
        .call(|reply| PlaybackCommand::Enqueue {
            track_ids,
            next: true,
            reply,
        })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None, "b is not next now");

    harness.prefetch_next();
    harness.hear_the_end();

    assert!(is_playing(&harness.snapshot(), "d"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn repeat_one_discards_the_prefetch_and_repeats_on_the_same_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .call(|reply| PlaybackCommand::SetRepeatMode {
            mode: PlaybackRepeatMode::One,
            reply,
        })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None, "b is not next now");

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "a"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn turning_shuffle_on_discards_the_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
        harness.track("d", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .call(|reply| PlaybackCommand::SetShuffle {
            enabled: true,
            reply,
        })
        .unwrap();
    let next = harness.queue_snapshot().upcoming[0].title.clone();
    harness.prefetch_next();
    harness.hear_the_end();

    assert!(is_playing(&harness.snapshot(), &next), "{next} plays next");
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn removing_the_next_track_discards_the_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();
    let next = harness.queue_snapshot().upcoming[0].id.clone();

    harness
        .call(|reply| PlaybackCommand::RemoveQueueItem { id: next, reply })
        .unwrap();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "c"));
}

#[test]
fn a_seek_discards_the_prefetch_and_the_end_opens_it_again() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness.seek(500).unwrap();
    assert_eq!(harness.output.chained_pipeline(), None);

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn skipping_during_the_handover_window_plays_the_next_track() {
    let mut harness = Harness::new();
    let tracks = vec![
        harness.track("a", 1),
        harness.track("b", 1),
        harness.track("c", 1),
    ];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness.next().unwrap();

    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.queue_snapshot().current.unwrap().title, "b");
}

#[test]
fn pausing_in_the_handover_window_holds_the_next_track_back() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();
    harness.output.finish_playback();
    harness.deliver_pending();
    harness.pause().unwrap();
    harness.tick();
    assert!(matches!(
        harness.snapshot(),
        PlaybackSnapshot::Paused { .. }
    ));

    harness.resume().unwrap();
    harness.tick();

    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 1);
}

#[test]
fn a_device_change_in_the_handover_window_prefetches_again_on_the_new_stream() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 2), harness.track("b", 1)];
    harness.start(tracks, 0).unwrap();
    harness.prefetch_next();

    harness
        .select_output(AudioOutputSelection::Device {
            device_id: "fake-other".into(),
        })
        .unwrap();
    assert_eq!(harness.output.streams_opened(), 2);
    assert_eq!(harness.output.chained_pipeline(), None);
    // The restart seeks back to where it was before anything else follows.
    std::thread::sleep(Duration::from_millis(150));
    harness.deliver_pending();

    harness.prefetch_next();
    harness.hear_the_end();
    assert!(is_playing(&harness.snapshot(), "b"));
    assert_eq!(harness.output.streams_opened(), 2);
}

#[test]
fn the_last_track_of_the_queue_has_nothing_to_prefetch() {
    let mut harness = Harness::new();
    let tracks = vec![harness.track("a", 1)];
    harness.start(tracks, 0).unwrap();

    harness.settle_prefetch();

    assert_eq!(harness.output.chained_pipeline(), None);
}
