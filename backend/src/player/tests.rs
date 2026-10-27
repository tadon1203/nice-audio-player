//! Playback through `Player`: the queue, transport, seek, gapless handover, failures, output
//! devices and preferences. A real Library in a temp directory holds real WAV files, and
//! `FakeOutput` plays the part of the device. Tests wait for the message they expect with
//! `wait_for` or `wait_until`; none of them sleeps for a fixed time.
//!
//! A command is answered once the worker has applied it, so the state it causes is in the message
//! log by then. A start is answered before its track loads: a test that needs the track to play
//! waits for it.

pub(crate) use std::collections::HashMap;
pub(crate) use std::sync::Arc;
pub(crate) use std::time::Duration;

pub(crate) use crate::errors::CommandError;
pub(crate) use crate::ids::TrackId;
pub(crate) use crate::library::Library;
pub(crate) use crate::library::read::lists::{ListRequest, SortDirection};
pub(crate) use crate::library::read::tracks::TrackSortKey;
pub(crate) use crate::messages::BackendMessage;
pub(crate) use crate::meter::Meter;
pub(crate) use crate::player::Player;
pub(crate) use crate::player::RepeatMode;
pub(crate) use crate::player::fake_output::FakeOutput;
pub(crate) use crate::player::output::{AudioOutputSelection, OutputError, StreamFailureKind};
pub(crate) use crate::player::state::{
    CurrentPlayback, PlaybackChannelConversion, PlaybackFailureCode, PlaybackPosition, PlayerState,
    QueueState, StartedBy,
};
pub(crate) use crate::player::waveform::Waveforms;
pub(crate) use crate::settings::{self, SettingsStore};
pub(crate) use crate::test_support::{MessageLog, TestDirectory, wait_until, write_pcm_i16_wav};

pub(crate) const SAMPLE_RATE: u32 = 44_100;
pub(crate) const WAIT: Duration = Duration::from_secs(30);

/// A WAV file in the test library: its name is its title.
#[derive(Clone, Copy)]
pub(crate) struct Clip {
    pub(crate) name: &'static str,
    pub(crate) seconds: usize,
    pub(crate) rate: u32,
    pub(crate) channels: u16,
}

impl Clip {
    /// A mono clip at the usual sample rate.
    pub(crate) fn new(name: &'static str, seconds: usize) -> Self {
        Self {
            name,
            seconds,
            rate: SAMPLE_RATE,
            channels: 1,
        }
    }

    pub(crate) fn format(self, rate: u32, channels: u16) -> Self {
        Self {
            rate,
            channels,
            ..self
        }
    }
}

pub(crate) struct Fixture {
    pub(crate) player: Player,
    pub(crate) library: Library,
    pub(crate) output: FakeOutput,
    /// What the Backend sent, in order.
    pub(crate) messages: Arc<MessageLog>,
    pub(crate) settings: Arc<SettingsStore>,
    /// The track of each clip, by name.
    pub(crate) ids: HashMap<&'static str, TrackId>,
    /// The music directory and the data directory; kept alive for the test.
    pub(crate) _files: TestDirectory,
}

impl Fixture {
    /// A Player over a Library that holds `clips`, after the scan has found them all.
    pub(crate) fn with(clips: &[Clip]) -> Self {
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
        let (messages, sender) = MessageLog::shared();
        let data = files.file("data");
        std::fs::create_dir_all(&data).expect("data directory");
        let library = Library::start(&data, &sender);
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
        let settings_path = settings::file_path(&data);
        let settings = Arc::new(SettingsStore::open(
            settings_path.clone(),
            settings::read(&settings_path),
            sender.clone(),
        ));
        let waveforms = Arc::new(Waveforms::start(files.file("waveforms"), sender.clone()));
        let player = Player::start(
            Arc::new(library.clone()),
            sender,
            Meter::new(),
            waveforms,
            Arc::clone(&settings),
            Box::new(output.clone()),
        );

        let started = wait_until(
            || messages.player().is_some() && messages.queue().is_some(),
            WAIT,
        );
        assert!(started, "the worker sends its first transport and queue");

        Self {
            player,
            library,
            output,
            messages,
            settings,
            ids,
            _files: files,
        }
    }

    /// The track ids of the clips `names`, in the order given.
    pub(crate) fn ids(&self, names: &[&str]) -> Vec<TrackId> {
        names.iter().map(|name| self.id(name)).collect()
    }

    pub(crate) fn id(&self, name: &str) -> TrackId {
        *self
            .ids
            .get(name)
            .unwrap_or_else(|| panic!("no clip named {name}"))
    }

    /// The newest transport state sent.
    pub(crate) fn state(&self) -> PlayerState {
        self.messages.player().expect("the transport is sent")
    }

    /// The newest queue state sent.
    pub(crate) fn queue(&self) -> QueueState {
        self.messages.queue().expect("the queue is sent")
    }

    /// The newest playing position sent.
    pub(crate) fn position(&self) -> Option<PlaybackPosition> {
        self.messages.latest(|message| match message {
            BackendMessage::Position(position) => Some(position.clone()),
            _ => None,
        })
    }

    /// The titles of the current item and then the upcoming ones.
    pub(crate) fn titles(&self) -> Vec<String> {
        let queue = self.queue();
        queue
            .current
            .into_iter()
            .chain(queue.upcoming)
            .map(|item| item.track.core.title)
            .collect()
    }

    /// Waits until the published state satisfies `done`.
    pub(crate) fn wait_for(&self, done: impl Fn(&PlayerState) -> bool) {
        let reached = wait_until(|| done(&self.state()), WAIT);
        assert!(
            reached,
            "the playback state did not reach the expected value: {:?}",
            self.state()
        );
    }

    /// Waits until the published position of the loaded track reaches `position_ms`.
    pub(crate) fn wait_for_position(&self, position_ms: u64) {
        let reached = wait_until(
            || {
                self.position()
                    .is_some_and(|position| position.position_ms >= position_ms)
            },
            WAIT,
        );
        assert!(reached, "the position did not reach {position_ms} ms");
    }

    /// Lets the worker handle everything the device has sent so far: a command is answered only
    /// after the events that arrived before it.
    pub(crate) fn settle(&self) {
        let mode = self.queue().repeat_mode;
        self.player
            .set_repeat_mode(mode)
            .expect("the worker answers");
    }

    /// The device heard the end of the playing track, and the worker moves on.
    pub(crate) fn finish(&self) {
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
pub(crate) fn library_tracks(library: &Library) -> Vec<(TrackId, String)> {
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
pub(crate) fn clip_named(clips: &[Clip], title: &str) -> &'static str {
    clips
        .iter()
        .map(|clip| clip.name)
        .find(|name| *name == title)
        .unwrap_or_else(|| panic!("the library holds {title}, which is not a clip"))
}

pub(crate) fn clips(names: &[&'static str]) -> Vec<Clip> {
    names.iter().map(|name| Clip::new(name, 2)).collect()
}

pub(crate) fn is_playing(state: &PlayerState, title: &str) -> bool {
    matches!(state, PlayerState::Playing { session, .. } if session.item.track.core.title == title)
}

pub(crate) fn is_paused(state: &PlayerState, title: &str) -> bool {
    matches!(state, PlayerState::Paused { session, .. } if session.item.track.core.title == title)
}

pub(crate) fn session(state: &PlayerState) -> &CurrentPlayback {
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
