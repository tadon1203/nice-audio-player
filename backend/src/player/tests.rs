//! Playback through `Player`: the queue, transport, seek, gapless handover, failures, output
//! devices and preferences. A real Library in a temp directory holds real WAV files, and
//! `FakeOutput` plays the part of the device. Tests wait for the published state with `wait_until`
//! or for an event; none of them sleeps for a fixed time.
//!
//! The worker handles one input at a time in the order they arrive, so a command sent after an
//! event from the device is answered after that event. `settle` uses this to know that an event
//! has been handled when a test expects something to *not* happen.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::errors::CommandError;
use crate::ids::TrackId;
use crate::library::Library;
use crate::library::models::{ListRequest, SortDirection, TrackSortKey};
use crate::messages::StateTopic;
use crate::meter::Meter;
use crate::player::Player;
use crate::player::PlayerPreferences;
use crate::player::RepeatMode;
use crate::player::fake_output::FakeOutput;
use crate::player::output::{AudioOutputSelection, OutputError, StreamFailureKind};
use crate::player::state::{
    CurrentPlayback, PlaybackChannelConversion, PlaybackFailureCode, PlayerState, QueueState,
    StartedBy,
};
use crate::player::waveform::Waveforms;
use crate::state_store::StateStore;
use crate::test_support::{
    NotificationLog, TestDirectory, state_store_for_tests, wait_until, write_pcm_i16_wav,
};

const SAMPLE_RATE: u32 = 44_100;
const WAIT: Duration = Duration::from_secs(30);

/// A WAV file in the test library: its name is its title.
#[derive(Clone, Copy)]
struct Clip {
    name: &'static str,
    seconds: usize,
    rate: u32,
    channels: u16,
}

impl Clip {
    /// A mono clip at the usual sample rate.
    fn new(name: &'static str, seconds: usize) -> Self {
        Self {
            name,
            seconds,
            rate: SAMPLE_RATE,
            channels: 1,
        }
    }

    fn format(self, rate: u32, channels: u16) -> Self {
        Self {
            rate,
            channels,
            ..self
        }
    }
}

struct Fixture {
    player: Player,
    library: Library,
    output: FakeOutput,
    state_store: Arc<StateStore>,
    notifications: Arc<NotificationLog>,
    preferences: Arc<Mutex<Vec<PlayerPreferences>>>,
    /// The track of each clip, by name.
    ids: HashMap<&'static str, TrackId>,
    /// The music directory and the data directory; kept alive for the test.
    _files: TestDirectory,
}

impl Fixture {
    /// A Player over a Library that holds `clips`, after the scan has found them all.
    fn with(clips: &[Clip]) -> Self {
        let files = TestDirectory::new();
        let music = files.file("music");
        std::fs::create_dir_all(&music).expect("music directory");
        for clip in clips {
            write_pcm_i16_wav(
                &music.join(format!("{}.wav", clip.name)),
                clip.rate,
                clip.channels,
                &vec![0; clip.rate as usize * usize::from(clip.channels) * clip.seconds],
            );
        }
        let (notifications, notifier) = NotificationLog::shared();
        let state_store = state_store_for_tests(notifier.clone());
        let data = files.file("data");
        std::fs::create_dir_all(&data).expect("data directory");
        let library = Library::open(&data, Arc::clone(&state_store)).expect("library");
        library
            .add_directory(music.clone())
            .expect("the music directory is added");
        let found = wait_until(|| library_tracks(&library).len() == clips.len(), WAIT);
        assert!(found, "the scan found every clip");
        let ids = library_tracks(&library)
            .into_iter()
            .map(|(id, title)| (clip_named(clips, &title), id))
            .collect();

        let output = FakeOutput::new();
        let preferences = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&preferences);
        let waveforms = Arc::new(Waveforms::start(
            files.file("waveforms"),
            Arc::clone(&state_store),
        ));
        let player = Player::start(
            Some(Arc::new(library.clone())),
            Arc::clone(&state_store),
            Meter::new(),
            waveforms,
            PlayerPreferences::default(),
            move |preferences| observed.lock().push(preferences.clone()),
            Box::new(output.clone()),
        )
        .expect("the player starts");

        Self {
            player,
            library,
            output,
            state_store,
            notifications,
            preferences,
            ids,
            _files: files,
        }
    }

    /// The track ids of the clips `names`, in the order given.
    fn ids(&self, names: &[&str]) -> Vec<TrackId> {
        names.iter().map(|name| self.id(name)).collect()
    }

    fn id(&self, name: &str) -> TrackId {
        *self
            .ids
            .get(name)
            .unwrap_or_else(|| panic!("no clip named {name}"))
    }

    fn state(&self) -> PlayerState {
        self.state_store.playback().value
    }

    fn queue(&self) -> QueueState {
        self.player.queue_state().value
    }

    /// The titles of the current item and then the upcoming ones.
    fn titles(&self) -> Vec<String> {
        let queue = self.queue();
        queue
            .current
            .into_iter()
            .chain(queue.upcoming)
            .map(|item| item.track.core.title)
            .collect()
    }

    /// Waits until the published state satisfies `done`.
    fn wait_for(&self, done: impl Fn(&PlayerState) -> bool) {
        let reached = wait_until(|| done(&self.state()), WAIT);
        assert!(
            reached,
            "the playback state did not reach the expected value: {:?}",
            self.state()
        );
    }

    /// Waits until the published position of the loaded track reaches `position_ms`.
    fn wait_for_position(&self, position_ms: u64) {
        let reached = wait_until(
            || {
                self.player
                    .position()
                    .is_some_and(|position| position.position_ms >= position_ms)
            },
            WAIT,
        );
        assert!(reached, "the position did not reach {position_ms} ms");
    }

    /// Lets the worker handle everything the device has sent so far: a command is answered only
    /// after the events that arrived before it.
    fn settle(&self) {
        let mode = self.queue().repeat_mode;
        self.player
            .set_repeat_mode(mode)
            .expect("the worker answers");
    }

    /// The device heard the end of the playing track, and the worker moves on.
    fn finish(&self) {
        self.output.finish_playback();
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.player.shutdown();
        self.library.shutdown();
    }
}

/// The library's tracks as (id, title), by title.
fn library_tracks(library: &Library) -> Vec<(TrackId, String)> {
    let request = ListRequest {
        search: None,
        sort: TrackSortKey::Title,
        direction: SortDirection::Ascending,
        offset: 0,
        limit: 500,
    };
    library
        .list_tracks(&request)
        .expect("track list")
        .items
        .into_iter()
        .map(|row| (row.core.id, row.core.title))
        .collect()
}

/// The clip whose name is `title`. Titles of the test files are their names.
fn clip_named(clips: &[Clip], title: &str) -> &'static str {
    clips
        .iter()
        .map(|clip| clip.name)
        .find(|name| *name == title)
        .unwrap_or_else(|| panic!("the library holds {title}, which is not a clip"))
}

fn clips(names: &[&'static str]) -> Vec<Clip> {
    names.iter().map(|name| Clip::new(name, 2)).collect()
}

fn is_playing(state: &PlayerState, title: &str) -> bool {
    matches!(state, PlayerState::Playing { session, .. } if session.item.track.core.title == title)
}

fn is_paused(state: &PlayerState, title: &str) -> bool {
    matches!(state, PlayerState::Paused { session, .. } if session.item.track.core.title == title)
}

fn session(state: &PlayerState) -> &CurrentPlayback {
    state
        .session()
        .unwrap_or_else(|| panic!("a track is loaded, the state is {state:?}"))
}

mod failures;
mod gapless;
mod loading;
mod output;
mod preferences;
mod queue;
mod transport;
