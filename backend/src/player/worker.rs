//! The playback worker thread. It owns the queue, the output stream and every track in flight, and
//! it is the only place where their state changes.
//!
//! The worker sleeps until something arrives on its one channel: a command from a caller, or an
//! event from a load, decode or output thread. While a track plays it also wakes every `TICK` to
//! send the position, start the prefetch and notice the end of the track.
//!
//! Why one thread: the output stream must stay on the thread that built it, and the position, the
//! end of a track and the prefetch are driven by time. A slow load runs elsewhere, so `pause` and
//! `next` are answered while it runs.
//!
//! The worker is the owner of the transport and the queue. It sends each of them whole to the Host
//! when it changes, and sends the playing position on its own schedule. A command is answered as
//! soon as its change is applied; a load that follows it reports through the transport.

use cpal::StreamInstant;
use rand::{SeedableRng, rngs::StdRng};
use std::sync::{
    Arc,
    mpsc::{Receiver, RecvTimeoutError, Sender},
};
use std::time::{Duration, Instant};

use super::PlayerPreferences;
use super::pipeline::{
    LoadEvent, LoadPosition, Pipeline, PipelineError, PreparedSource, SourceLoad, SourceLoadId,
    start_decoding,
};
use super::queue::{AdvanceReason, Queue, QueueEntry, RepeatMode};
use super::state::{
    CurrentPlayback, PlaybackFailureCode, PlaybackPosition, PlaybackProcessingInfo, PlayerControls,
    PlayerState, QueueItem, QueueState, QueueWindow, StartedBy,
};
use super::transport::{Output, Position, Track};
use crate::ids::{PlaybackId, QueueItemId, TrackId};
use crate::library::Library;
use crate::library::errors::LibraryError;
use crate::library::tracks::PlayableTrack;
use crate::messages::{self, BackendMessage};
use crate::meter::Meter;
use crate::player::errors::PlayerError;
use crate::player::errors::Result;
use crate::player::output::{
    AudioOutputSelection, OutputError, OutputEvent, OutputStreamFactory, OutputStreamId,
    PcmConsumer, PipelineId, StreamCallbacks, StreamFailureKind, make_queue,
};
use crate::player::pcm::millis_to_frame;
use crate::player::processing::PcmConverter;
use crate::player::volume::{AtomicEffectiveGain, NormalizedVolume, VolumeState};
use crate::player::waveform::Waveforms;
use crate::settings::SettingsStore;
use crate::threads::answer;
use log::{error, info};

type Reply<T> = crate::threads::Reply<T, PlayerError>;

/// How often a playing track is looked at when nothing else arrives.
const TICK: Duration = Duration::from_millis(100);
/// How often the position is sent while a track plays.
const POSITION_UPDATE_INTERVAL: Duration = Duration::from_secs(1);
/// "Previous" restarts the track instead of leaving it once it has played this long.
const PREVIOUS_RESTART_THRESHOLD_MS: u64 = 3_000;
/// How long before the end of a track the next one is opened. A shorter track opens it right after
/// it has loaded.
const PREFETCH_LEAD_MS: u64 = 10_000;

/// Everything the worker receives.
pub(super) enum WorkerInput {
    Command(PlayerCommand),
    Load(LoadEvent),
    Output(OutputEvent),
}

/// A command from a caller. The worker answers it on its own reply, once the change is applied.
pub(super) enum PlayerCommand {
    PlayQueue {
        tracks: Vec<TrackId>,
        start: usize,
        reply: Reply<()>,
    },
    Enqueue {
        tracks: Vec<TrackId>,
        next: bool,
        reply: Reply<()>,
    },
    Pause {
        reply: Reply<()>,
    },
    Resume {
        reply: Reply<()>,
    },
    Previous {
        reply: Reply<()>,
    },
    Next {
        reply: Reply<()>,
    },
    Seek {
        position_ms: u64,
        reply: Reply<()>,
    },
    SetVolume {
        volume: NormalizedVolume,
        reply: Reply<()>,
    },
    SetMuted {
        muted: bool,
        reply: Reply<()>,
    },
    SetOutputSelection {
        selection: AudioOutputSelection,
        reply: Reply<()>,
    },
    SetRepeatMode {
        mode: RepeatMode,
        reply: Reply<()>,
    },
    SetShuffle {
        enabled: bool,
        reply: Reply<()>,
    },
    RemoveQueueItem {
        id: QueueItemId,
        reply: Reply<()>,
    },
    MoveQueueItem {
        id: QueueItemId,
        to: usize,
        reply: Reply<()>,
    },
    PlayQueueItem {
        id: QueueItemId,
        reply: Reply<()>,
    },
    ClearQueue {
        reply: Reply<()>,
    },
    RestorePreviousQueue {
        reply: Reply<()>,
    },
    QueueWindow {
        offset: u32,
        limit: u32,
        reply: Reply<QueueWindow>,
    },
    Shutdown,
}

/// What a failure condemns. It decides whether the queue moves on.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum Failure {
    /// This file cannot be played. The next item is tried.
    SkipItem,
    /// The output failed. Another file would fail the same way, so playback stops with the queue
    /// intact and the listener can retry.
    StopOutput,
}

/// Sends an input to the worker. A worker that has stopped takes nothing, which is not an error.
pub(super) fn send(inbox: &Sender<WorkerInput>, input: WorkerInput) {
    let _ = inbox.send(input);
}

/// A start: what to play and how to begin.
pub(super) struct StartPlan {
    /// The playback this start belongs to. A device switch restarts the same playback.
    id: PlaybackId,
    entry: QueueEntry,
    playable: PlayableTrack,
    started_by: StartedBy,
    start_paused: bool,
    /// Where to seek to once playing, after a device switch restarted the track.
    resume_at_ms: Option<u64>,
    /// A device switch: the selection to commit once the restart is playing.
    selection: Option<AudioOutputSelection>,
}

/// A start whose file is being read.
struct StartLoad {
    load: SourceLoad,
    request: StartPlan,
}

/// A start whose stream is open and whose first samples are decoding.
struct Starting {
    request: StartPlan,
    track: Track,
}

/// The track that follows the playing one, being read.
struct NextLoad {
    load: SourceLoad,
    entry: QueueEntry,
    playable: PlayableTrack,
}

/// A seek whose file is being read. The playing track keeps playing until the seek is ready.
struct SeekLoad {
    load: SourceLoad,
    duration_ms: u64,
}

/// A seek whose new pipeline is decoding. The stream switches to its queue once it is prebuffered.
struct PendingSeek {
    pipeline: Pipeline,
    queue: PcmConsumer,
    base_frame: u64,
    remaining_frames: u64,
    duration_ms: u64,
}

/// The last failure. The transport is stopped until the listener retries or moves on.
struct Failed {
    code: PlaybackFailureCode,
    /// The worker moves on to the next item by itself: a skip, not a stop that waits for Retry.
    skipping: bool,
}

/// What the transport is doing. Each stage holds what it needs. Leaving a stage drops it, which
/// stops the loads and decode threads it owns and closes the stream when no output is left.
enum Transport {
    /// Nothing plays. `failed` is the last failure, kept until the listener retries or moves on.
    Idle { failed: Option<Failed> },
    /// A start's file is being read.
    Loading(StartLoad),
    /// A start's stream is open and its first samples are decoding.
    Starting { output: Output, starting: Starting },
    /// The track plays or is paused on `output`. A track may be chained after it, and a seek may
    /// be in flight.
    Loaded {
        output: Output,
        current: Track,
        next: Next,
        seek: Seek,
    },
}

/// The track that follows the loaded one.
enum Next {
    None,
    /// The file is being read.
    Loading(NextLoad),
    /// Decoded and chained to the stream, so it plays without a gap.
    Ready(Track),
    /// Its prefetch failed. The entry is not prefetched again until the transport moves on.
    Failed(QueueItemId),
}

/// A seek of the loaded track.
enum Seek {
    None,
    Loading(SeekLoad),
    Decoding(PendingSeek),
}

/// What listeners were last sent. A value is sent again only when it differs from this.
#[derive(Default)]
struct Sent {
    player: Option<PlayerState>,
    queue: Option<QueueState>,
    position: Option<PlaybackPosition>,
}

pub(super) struct PlayerWorker {
    /// What the worker is doing with the stream and the track.
    transport: Transport,
    /// The last track that reached the output, kept so a stopped player can still name it.
    last_item: Option<QueueItem>,
    /// Completed seeks; sent with the state so the UI can tell a seek from a tick.
    seek_count: u64,
    queue: Queue,
    /// The queue's version: it moves on by one each time the queue changes.
    queue_version: u64,
    /// The queue before the last replacement, for one-step undo. Not kept across restarts.
    previous_queue: Option<Queue>,
    /// Files skipped in a row after failing; bounds the skipping to one pass over the queue.
    skipped_in_a_row: usize,
    rng: StdRng,
    volume_state: VolumeState,
    effective_gain: AtomicEffectiveGain,
    meter: Meter,
    output_selection: AudioOutputSelection,
    messages: Sender<BackendMessage>,
    sent: Sent,
    library: Arc<Library>,
    waveforms: Arc<Waveforms>,
    settings: Arc<SettingsStore>,
    output_stream_factory: Box<dyn OutputStreamFactory>,
    inbox: Sender<WorkerInput>,
    playback_id: PlaybackId,
    source_load_id: u64,
    pipeline_id: u64,
    stream_id: u64,
    last_tick: Instant,
}

impl PlayerWorker {
    /// The worker starts with the player preferences `settings` saved. `inbox` is the worker's own
    /// input: the loads, the decodes and the stream send to it through it.
    pub(super) fn new(
        inbox: Sender<WorkerInput>,
        messages: Sender<BackendMessage>,
        library: Arc<Library>,
        waveforms: Arc<Waveforms>,
        meter: Meter,
        settings: Arc<SettingsStore>,
        output_stream_factory: Box<dyn OutputStreamFactory>,
    ) -> Self {
        let preferences = settings.player_preferences();
        let volume_state = VolumeState::restored(preferences.volume, preferences.muted);
        Self {
            transport: Transport::Idle { failed: None },
            last_item: None,
            seek_count: 0,
            queue: Queue::new(preferences.repeat_mode, preferences.shuffle_enabled),
            queue_version: 0,
            previous_queue: None,
            skipped_in_a_row: 0,
            rng: StdRng::from_rng(&mut rand::rng()),
            effective_gain: AtomicEffectiveGain::new(volume_state.effective_gain()),
            volume_state,
            meter,
            output_selection: preferences.output_selection,
            messages,
            sent: Sent::default(),
            library,
            waveforms,
            settings,
            output_stream_factory,
            inbox,
            playback_id: PlaybackId::first(),
            source_load_id: 0,
            pipeline_id: 0,
            stream_id: 0,
            last_tick: Instant::now(),
        }
    }

    pub(super) fn run(mut self, inputs: &Receiver<WorkerInput>) {
        // The first values: the queue and the transport, as they stand before any input.
        self.send_queue();
        self.send_state();
        loop {
            let input = if self.is_playing() {
                match inputs.recv_timeout(TICK) {
                    Ok(input) => input,
                    Err(RecvTimeoutError::Timeout) => {
                        self.tick();
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            } else {
                match inputs.recv() {
                    Ok(input) => input,
                    Err(_) => break,
                }
            };
            if !self.handle(input) {
                break;
            }
            // A steady stream of inputs must not starve the tick.
            if self.is_playing() && self.last_tick.elapsed() >= TICK {
                self.tick();
            }
        }
        self.shutdown();
    }

    /// Takes one input. Returns whether the worker should keep running.
    fn handle(&mut self, input: WorkerInput) -> bool {
        match input {
            WorkerInput::Command(command) => {
                // Only a command resets the skip count; the worker's own moves do not.
                self.skipped_in_a_row = 0;
                if !self.command(command) {
                    return false;
                }
                self.revalidate_prefetch();
            }
            WorkerInput::Load(event) => self.handle_load(event),
            WorkerInput::Output(event) => self.handle_output(event),
        }
        true
    }

    /// Carries out a command and answers it. Returns `false` when the command stops the worker.
    fn command(&mut self, command: PlayerCommand) -> bool {
        match command {
            PlayerCommand::PlayQueue {
                tracks,
                start,
                reply,
            } => {
                answer(&reply, self.play_queue(tracks, start));
            }
            PlayerCommand::Enqueue {
                tracks,
                next,
                reply,
            } => {
                answer(&reply, self.enqueue(tracks, next));
            }
            PlayerCommand::Pause { reply } => {
                self.pause();
                answer(&reply, Ok(()));
            }
            PlayerCommand::Resume { reply } => {
                answer(&reply, self.resume());
            }
            PlayerCommand::Previous { reply } => {
                answer(&reply, self.previous());
            }
            PlayerCommand::Next { reply } => {
                answer(&reply, self.next());
            }
            PlayerCommand::Seek { position_ms, reply } => {
                answer(&reply, self.seek(position_ms));
            }
            PlayerCommand::SetVolume { volume, reply } => {
                self.set_volume(volume);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetMuted { muted, reply } => {
                self.set_muted(muted);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetOutputSelection { selection, reply } => {
                self.set_output_selection(selection);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetRepeatMode { mode, reply } => {
                self.set_repeat_mode(mode);
                answer(&reply, Ok(()));
            }
            PlayerCommand::SetShuffle { enabled, reply } => {
                self.set_shuffle(enabled);
                answer(&reply, Ok(()));
            }
            PlayerCommand::RemoveQueueItem { id, reply } => {
                answer(&reply, self.remove_queue_item(id));
            }
            PlayerCommand::MoveQueueItem { id, to, reply } => {
                answer(&reply, self.move_queue_item(id, to));
            }
            PlayerCommand::PlayQueueItem { id, reply } => {
                answer(&reply, self.play_queue_item(id));
            }
            PlayerCommand::ClearQueue { reply } => {
                self.clear_queue();
                answer(&reply, Ok(()));
            }
            PlayerCommand::RestorePreviousQueue { reply } => {
                answer(&reply, self.restore_previous_queue());
            }
            PlayerCommand::QueueWindow {
                offset,
                limit,
                reply,
            } => {
                answer(&reply, Ok(self.queue_window(offset, limit)));
            }
            PlayerCommand::Shutdown => return false,
        }
        true
    }

    fn is_playing(&self) -> bool {
        self.current().is_some_and(|track| !track.paused)
    }

    fn tick(&mut self) {
        self.last_tick = Instant::now();
        self.finish_if_due();
        self.update_position();
        self.maybe_prefetch();
    }

    fn shutdown(&mut self) {
        self.discard_transport();
        self.send_state();
    }

    fn handle_load(&mut self, event: LoadEvent) {
        match event {
            LoadEvent::SourceReady { id, result } => self.source_ready(id, result),
            LoadEvent::PrebufferReady { pipeline } => self.prebuffer_ready(pipeline),
            LoadEvent::DecodeFailed { pipeline, error } => {
                error!(
                    "playback.decode_failed pipeline_id={} error={error:?}",
                    pipeline.0
                );
                self.decode_failed(pipeline, error);
            }
        }
    }

    fn handle_output(&mut self, event: OutputEvent) {
        match event {
            OutputEvent::FinalFrames { pipeline, end_time } => {
                self.final_frames(pipeline, end_time);
            }
            OutputEvent::Failed { stream, kind } => self.stream_failed(stream, kind),
        }
    }

    // ----- ids -----

    fn next_playback_id(&mut self) -> PlaybackId {
        let id = self.playback_id;
        self.playback_id = id.next();
        id
    }

    fn next_source_load_id(&mut self) -> SourceLoadId {
        self.source_load_id = self.source_load_id.wrapping_add(1);
        SourceLoadId(self.source_load_id)
    }

    fn next_pipeline_id(&mut self) -> PipelineId {
        self.pipeline_id = self.pipeline_id.wrapping_add(1);
        PipelineId(self.pipeline_id)
    }

    fn next_stream_id(&mut self) -> OutputStreamId {
        self.stream_id = self.stream_id.wrapping_add(1);
        OutputStreamId(self.stream_id)
    }

    /// What the output stream of `stream` reports to the worker: its events arrive as inputs.
    fn stream_callbacks(&self, stream: OutputStreamId) -> StreamCallbacks {
        let inbox = self.inbox.clone();
        StreamCallbacks {
            stream,
            gain: self.effective_gain.clone(),
            events: Arc::new(move |event| send(&inbox, WorkerInput::Output(event))),
            meter: self.meter.clone(),
        }
    }

    // ----- commands -----

    pub(super) fn play_queue(&mut self, track_ids: Vec<TrackId>, start_index: usize) -> Result<()> {
        self.replace_queue(track_ids, start_index);
        self.start_current(false, StartedBy::Jump)
    }

    /// Replaces the queue, keeping the old one for one-step undo. Nothing is kept when nothing
    /// was queued, so an Undo never resurrects something older than what was just replaced.
    fn replace_queue(&mut self, track_ids: Vec<TrackId>, start_index: usize) {
        let before = self.queue.clone();
        self.queue.replace(track_ids, start_index, &mut self.rng);
        self.previous_queue = (!before.is_empty()).then_some(before);
    }

    /// Puts back the queue the last replacement or Clear upcoming took away. When the same item
    /// is still current, it keeps playing; otherwise the restored current item starts.
    pub(super) fn restore_previous_queue(&mut self) -> Result<()> {
        let Some(previous) = self.previous_queue.take() else {
            return Ok(());
        };
        let same_current = matches!(
            (self.queue.current(), previous.current()),
            (Some(now), Some(then)) if now.id == then.id
        ) && self.current().is_some();
        self.queue.restore(previous, &mut self.rng);
        if same_current {
            self.send_queue();
            self.send_state();
            return Ok(());
        }
        self.start_current(false, StartedBy::Jump)
    }

    /// Items enqueued with nothing current: they start playing.
    fn start_enqueued(&mut self, track_ids: Vec<TrackId>) -> Result<()> {
        self.replace_queue(track_ids, 0);
        self.start_current(false, StartedBy::Jump)
    }

    pub(super) fn previous(&mut self) -> Result<()> {
        self.navigate(AdvanceReason::UserPrevious)
    }

    pub(super) fn next(&mut self) -> Result<()> {
        self.navigate(AdvanceReason::UserNext)
    }

    fn navigate(&mut self, reason: AdvanceReason) -> Result<()> {
        if reason == AdvanceReason::UserPrevious
            && let Some(current) = self.current()
            && previous_restarts_track(current.position_ms(), current.position.duration_ms)
        {
            return self.seek(0);
        }
        let paused = self.current().is_some_and(|current| current.paused);
        if self.queue.advance(reason, &mut self.rng).is_none() {
            return Ok(());
        }
        let started_by = match reason {
            AdvanceReason::UserPrevious => StartedBy::Previous,
            _ => StartedBy::Next,
        };
        self.start_current(paused, started_by)
    }

    /// Pauses the playing track. Nothing happens when no track is loaded.
    pub(super) fn pause(&mut self) {
        if self.set_pending_pause(true) {
            return;
        }
        let Transport::Loaded {
            output, current, ..
        } = &mut self.transport
        else {
            return;
        };
        if current.paused {
            return;
        }
        if let Err(error) = output.stream.pause() {
            // The stream is stopped with the queue intact.
            self.fail_output(error.code());
            return;
        }
        current.position.sample(output.stream.as_mut());
        output.stream.clear_timing_anchor();
        current.paused = true;
        self.meter.set_running(false);
        self.send_state();
    }

    /// Resume, or after a failure Retry: starts the current queue item again, queue intact.
    pub(super) fn resume(&mut self) -> Result<()> {
        if matches!(self.transport, Transport::Idle { failed: Some(_) }) {
            return self.start_current(false, StartedBy::Jump);
        }
        self.unpause();
        Ok(())
    }

    fn unpause(&mut self) {
        if self.set_pending_pause(false) {
            return;
        }
        let Transport::Loaded {
            output, current, ..
        } = &mut self.transport
        else {
            return;
        };
        if !current.paused {
            return;
        }
        if let Err(error) = output.stream.start() {
            let error = match error {
                OutputError::StreamStartFailed => OutputError::StreamResumeFailed,
                other => other,
            };
            self.fail_output(error.code());
            return;
        }
        current.paused = false;
        self.meter.set_running(true);
        self.send_state();
    }

    /// Pause and resume while a start is still loading only change what the start does once it
    /// plays. Returns whether a start was loading.
    fn set_pending_pause(&mut self, paused: bool) -> bool {
        match &mut self.transport {
            Transport::Loading(load) => {
                load.request.start_paused = paused;
                true
            }
            Transport::Starting { starting, .. } => {
                starting.request.start_paused = paused;
                starting.track.paused = paused;
                true
            }
            _ => false,
        }
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device at
    /// the same position and keeps its paused state and queue.
    pub(super) fn set_output_selection(&mut self, selection: AudioOutputSelection) {
        let Transport::Loaded { current, seek, .. } = &self.transport else {
            self.set_idle_output_selection(selection);
            return;
        };
        if !matches!(seek, Seek::None) || selection == self.output_selection {
            return;
        }
        if let Err(error) = self.output_stream_factory.resolve(&selection) {
            self.fail_output(error.code());
            return;
        }
        let request = StartPlan {
            id: current.id,
            entry: current.entry.clone(),
            playable: current.playable.clone(),
            started_by: current.started_by,
            start_paused: current.paused,
            resume_at_ms: Some(current.position_ms()),
            selection: Some(selection),
        };
        self.begin_start(request);
    }

    fn set_idle_output_selection(&mut self, selection: AudioOutputSelection) {
        if self.is_starting() {
            return;
        }
        if let AudioOutputSelection::Device { .. } = &selection
            && let Err(error) = self.output_stream_factory.resolve(&selection)
        {
            self.fail_output(error.code());
            return;
        }
        let unchanged = self.output_selection == selection;
        self.output_selection = selection;
        if !unchanged {
            self.preferences_changed();
        }
        self.transport = Transport::Idle { failed: None };
        self.send_state();
    }

    /// Seeks the playing track. The new position is prebuffered while the old one keeps playing.
    /// A seek that fails while it loads leaves the playing track as it is.
    pub(super) fn seek(&mut self, requested_position_ms: u64) -> Result<()> {
        self.set_seek(Seek::None);
        self.set_next(Next::None);
        let Transport::Loaded {
            output, current, ..
        } = &self.transport
        else {
            return Ok(());
        };
        let Some(duration_ms) = current.position.duration_ms else {
            return Ok(());
        };
        let target_ms = requested_position_ms.min(duration_ms);
        if target_ms == duration_ms {
            let paused = current.paused;
            return self.advance_after_track(paused);
        }
        let file = current.playable.file.clone();
        let plan = output.config.processing_plan;
        let id = self.next_source_load_id();
        let load = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Seek { target_ms, plan },
            self.inbox.clone(),
        );
        self.set_seek(Seek::Loading(SeekLoad { load, duration_ms }));
        Ok(())
    }

    pub(super) fn set_volume(&mut self, volume: NormalizedVolume) {
        let changed = self.volume_state.set_volume(volume);
        self.volume_changed(changed);
    }

    pub(super) fn set_muted(&mut self, muted: bool) {
        let changed = if muted {
            self.volume_state.mute()
        } else {
            self.volume_state.unmute()
        };
        self.volume_changed(changed);
    }

    fn volume_changed(&mut self, changed: bool) {
        if changed {
            self.effective_gain
                .store(self.volume_state.effective_gain());
            self.preferences_changed();
        }
        self.send_state();
    }

    pub(super) fn set_repeat_mode(&mut self, mode: RepeatMode) {
        let changed = self.queue.set_repeat(mode);
        if changed {
            self.preferences_changed();
        }
        self.queue_changed(changed);
    }

    pub(super) fn set_shuffle(&mut self, enabled: bool) {
        let changed = self.queue.set_shuffle(enabled, &mut self.rng);
        if changed {
            self.preferences_changed();
        }
        self.queue_changed(changed);
    }

    pub(super) fn remove_queue_item(&mut self, id: QueueItemId) -> Result<()> {
        self.queue.remove_upcoming(id)?;
        self.queue_changed(true);
        Ok(())
    }

    pub(super) fn move_queue_item(&mut self, id: QueueItemId, to: usize) -> Result<()> {
        let changed = self.queue.move_upcoming(id, to)?;
        self.queue_changed(changed);
        Ok(())
    }

    pub(super) fn play_queue_item(&mut self, id: QueueItemId) -> Result<()> {
        self.queue.jump_to(id)?;
        self.start_current(false, StartedBy::Jump)
    }

    pub(super) fn enqueue(&mut self, track_ids: Vec<TrackId>, next: bool) -> Result<()> {
        if self.queue.current().is_none() {
            return self.start_enqueued(track_ids);
        }
        self.queue.enqueue(track_ids, next);
        self.queue_changed(true);
        Ok(())
    }

    pub(super) fn clear_queue(&mut self) {
        let before = self.queue.clone();
        let changed = self.queue.clear_upcoming();
        if changed {
            self.previous_queue = Some(before);
        }
        self.queue_changed(changed);
    }

    /// Upcoming queue items from `offset` (at most `limit`), read from the library now. The rows
    /// carry the queue version they were cut from.
    pub(super) fn queue_window(&self, offset: u32, limit: u32) -> QueueWindow {
        QueueWindow::of(
            &self.queue,
            self.queue_version,
            offset as usize,
            limit as usize,
            &self.library,
        )
    }

    // ----- starting -----

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    fn start_current(&mut self, start_paused: bool, started_by: StartedBy) -> Result<()> {
        let Some(entry) = self.queue.current().cloned() else {
            return Ok(());
        };
        self.send_queue();
        self.start_entry(entry, started_by, start_paused)
    }

    /// Reads the track of `entry` and starts it. A track the library no longer has is a failed
    /// item, like a file that cannot be decoded.
    fn start_entry(
        &mut self,
        entry: QueueEntry,
        started_by: StartedBy,
        start_paused: bool,
    ) -> Result<()> {
        match self.library_track(entry.track_id) {
            Ok(Some(playable)) => {
                let request = StartPlan {
                    id: self.next_playback_id(),
                    entry,
                    playable,
                    started_by,
                    start_paused,
                    resume_at_ms: None,
                    selection: None,
                };
                self.begin_start(request);
                Ok(())
            }
            // A track the library no longer has. When nothing follows it, the command says so.
            Ok(None) => {
                let skipping = self.will_skip();
                self.fail(
                    Failure::SkipItem,
                    PlaybackFailureCode::DecodeFailed,
                    started_by,
                );
                if skipping {
                    Ok(())
                } else {
                    Err(LibraryError::TrackUnavailable.into())
                }
            }
            Err(error) => {
                self.discard_transport();
                self.send_queue();
                self.send_state();
                Err(error)
            }
        }
    }

    /// Begins a start: its file is read from now on, and the transport shows the track as loading.
    fn begin_start(&mut self, request: StartPlan) {
        self.discard_transport();
        let file = request.playable.file.clone();
        let id = self.next_source_load_id();
        let load = SourceLoad::spawn(file, id, LoadPosition::Start, self.inbox.clone());
        self.transport = Transport::Loading(StartLoad { load, request });
        self.send_state();
    }

    /// The file of a start is read: open the stream and start decoding into it.
    fn open_start(&mut self, request: StartPlan, prepared: PreparedSource) {
        let device_switch = request.selection.is_some();
        let selection = request
            .selection
            .clone()
            .unwrap_or_else(|| self.output_selection.clone());
        let stream_id = self.next_stream_id();
        let pipeline_id = self.next_pipeline_id();
        let callbacks = self.stream_callbacks(stream_id);
        let spec = prepared.decoder.spec();
        let prepared_output =
            match self
                .output_stream_factory
                .open(&selection, spec, pipeline_id, callbacks)
            {
                Ok(prepared_output) => prepared_output,
                Err(error) => {
                    self.fail(Failure::StopOutput, error.code(), request.started_by);
                    return;
                }
            };
        let plan = prepared_output.config.processing_plan;
        let Ok(converter) = PcmConverter::new(plan) else {
            self.fail_pipeline(
                PipelineError::ProcessorCreate,
                device_switch,
                request.started_by,
            );
            return;
        };
        let duration_ms = prepared.duration_ms;
        let pipeline = start_decoding(
            &self.inbox,
            pipeline_id,
            prepared,
            prepared_output.producer,
            converter,
            plan,
        );
        let output = Output {
            id: stream_id,
            stream: prepared_output.stream,
            config: prepared_output.config,
        };
        let position = Position::from_start(output.sample_rate(), duration_ms);
        let track = Track {
            id: request.id,
            entry: request.entry.clone(),
            playable: request.playable.clone(),
            started_by: request.started_by,
            pipeline,
            position,
            completion_time: None,
            paused: request.start_paused,
        };
        self.transport = Transport::Starting {
            output,
            starting: Starting { request, track },
        };
    }

    /// The prebuffer is ready: start the stream (unless starting paused) and send the track.
    fn finish_start(&mut self) {
        let Transport::Starting {
            output,
            starting: Starting { request, track },
        } = self.take_transport()
        else {
            return;
        };
        if !request.start_paused
            && let Err(error) = output.stream.start()
        {
            self.fail(Failure::StopOutput, error.code(), request.started_by);
            return;
        }
        let StartPlan {
            selection,
            resume_at_ms,
            ..
        } = request;
        if let Some(selection) = selection {
            self.output_selection = selection;
            self.preferences_changed();
        }
        self.waveforms.loaded(track.id, &track.playable);
        self.last_item = Some(queue_item(track.entry.id, &track.playable));
        let running = !track.paused;
        self.transport = Transport::Loaded {
            output,
            current: track,
            next: Next::None,
            seek: Seek::None,
        };
        self.meter.set_running(running);
        self.send_state();
        self.send_position();
        if let Some(position_ms) = resume_at_ms
            && let Err(cause) = self.seek(position_ms)
        {
            error!("playback.resume_seek_failed cause={cause}");
        }
    }

    /// A load reports its file. Only the load the transport is waiting for is used: a load that was
    /// replaced or cancelled reports nothing the worker needs.
    fn source_ready(
        &mut self,
        id: SourceLoadId,
        result: std::result::Result<PreparedSource, PipelineError>,
    ) {
        match &self.transport {
            Transport::Loading(start) if start.load.id == id => self.start_ready(result),
            Transport::Loaded {
                next: Next::Loading(load),
                ..
            } if load.load.id == id => self.next_ready(result),
            Transport::Loaded {
                seek: Seek::Loading(load),
                ..
            } if load.load.id == id => self.seek_ready(result),
            _ => {}
        }
    }

    /// The file of a start is read: it opens its stream, or fails the start.
    fn start_ready(&mut self, result: std::result::Result<PreparedSource, PipelineError>) {
        let Transport::Loading(StartLoad { request, .. }) = self.take_transport() else {
            return;
        };
        match result {
            Ok(prepared) => self.open_start(request, prepared),
            Err(error) => {
                let device_switch = request.selection.is_some();
                self.fail_pipeline(error, device_switch, request.started_by);
            }
        }
    }

    /// The prebuffer of a decode is ready. The one that is waited for is the start, or a seek.
    fn prebuffer_ready(&mut self, pipeline: PipelineId) {
        match &self.transport {
            Transport::Starting { starting, .. } if starting.track.pipeline.id == pipeline => {
                self.finish_start();
            }
            Transport::Loaded {
                seek: Seek::Decoding(seek),
                ..
            } if seek.pipeline.id == pipeline => self.finish_seek(),
            _ => {}
        }
    }

    fn fail_pipeline(&mut self, error: PipelineError, device_switch: bool, started_by: StartedBy) {
        // A device switch that cannot play is a failed output, not a file to skip.
        let failure = if device_switch {
            Failure::StopOutput
        } else {
            Failure::SkipItem
        };
        self.fail(failure, error.code(), started_by);
    }

    // ----- failures -----

    /// Stops the transport on a failure and keeps the reason for the listener. A skip moves on to
    /// the next item, which is logged if it cannot start.
    fn fail(&mut self, failure: Failure, code: PlaybackFailureCode, started_by: StartedBy) {
        error!("playback.failed code={code:?} failure={failure:?} started_by={started_by:?}");
        self.discard_transport();
        let skipping = failure == Failure::SkipItem && self.will_skip();
        self.transport = Transport::Idle {
            failed: Some(Failed { code, skipping }),
        };
        self.send_state();
        if skipping {
            self.send_track_skipped();
        }
        if failure == Failure::SkipItem
            && let Some(entry) = self.next_after_item_failure()
            && let Err(cause) = self.start_entry(entry, StartedBy::Auto, false)
        {
            error!("playback.skip_start_failed cause={cause}");
        }
    }

    fn fail_output(&mut self, code: PlaybackFailureCode) {
        self.fail(Failure::StopOutput, code, StartedBy::Jump);
    }

    /// Whether a failure of the current item is followed by trying the next one.
    fn will_skip(&self) -> bool {
        self.skipped_in_a_row + 1 < self.queue.len() && self.queue.can_go_next()
    }

    /// Moves the queue past a failed item. Returns the entry to try, if there is one.
    fn next_after_item_failure(&mut self) -> Option<QueueEntry> {
        self.skipped_in_a_row += 1;
        if self.skipped_in_a_row >= self.queue.len() {
            return None;
        }
        self.queue.advance(AdvanceReason::UserNext, &mut self.rng)?;
        self.send_queue();
        self.queue.current().cloned()
    }

    /// Tells listeners that the current item could not be played and the worker moves on. Call it
    /// before the queue advances, so the current item is still the one that failed.
    fn send_track_skipped(&self) {
        let title = self
            .queue
            .current()
            .and_then(|entry| self.library_track(entry.track_id).ok().flatten())
            .map(|track| track.track.core.title);
        messages::send(&self.messages, BackendMessage::TrackSkipped { title });
    }

    /// A decode thread failed. The pipeline it belongs to is the one the transport holds; a failure
    /// of a pipeline that is no longer held is ignored.
    fn decode_failed(&mut self, pipeline: PipelineId, error: PipelineError) {
        match &self.transport {
            Transport::Starting { starting, .. } if starting.track.pipeline.id == pipeline => {
                let Transport::Starting {
                    starting: Starting { request, .. },
                    ..
                } = self.take_transport()
                else {
                    return;
                };
                let device_switch = request.selection.is_some();
                self.fail_pipeline(error, device_switch, request.started_by);
            }
            Transport::Loaded { current, .. } if current.pipeline.id == pipeline => {
                self.fail_pipeline(error, false, StartedBy::Auto);
            }
            Transport::Loaded {
                seek: Seek::Decoding(seek),
                ..
            } if seek.pipeline.id == pipeline => {
                // The playing track keeps playing; the failed seek is only dropped.
                self.set_seek(Seek::None);
            }
            Transport::Loaded {
                next: Next::Ready(next),
                ..
            } if next.pipeline.id == pipeline => {
                let failed = next.entry.id;
                self.set_next(Next::Failed(failed));
            }
            _ => {}
        }
    }

    fn stream_failed(&mut self, stream: OutputStreamId, kind: StreamFailureKind) {
        if !self.output().is_some_and(|output| output.id == stream) {
            return;
        }
        match stream_signal_action(&self.output_selection, kind) {
            StreamSignalAction::RefreshDefaultDevice => {
                info!("playback.stream_interrupted stream_id={}", stream.0);
                self.set_seek(Seek::None);
                if self.refresh_default_device() {
                    info!("playback.output_recovered stream_id={}", stream.0);
                } else {
                    self.fail_output(PlaybackFailureCode::OutputDeviceUnavailable);
                }
            }
            StreamSignalAction::PreservePlayback => {}
            StreamSignalAction::Fail(code) => {
                error!(
                    "playback.stream_failed stream_id={} code={:?}",
                    stream.0, code
                );
                self.fail_output(code);
            }
        }
    }

    fn refresh_default_device(&mut self) -> bool {
        let Ok(identity) = self
            .output_stream_factory
            .resolve(&AudioOutputSelection::SystemDefault)
        else {
            return false;
        };
        let Some(output) = self.output_mut() else {
            return false;
        };
        output.config.device_id = identity.id;
        output.config.device_name = identity.name;
        self.send_state();
        true
    }

    // ----- playing on -----

    /// The stream has handed the last frames of `pipeline` to the device. The end of the track is
    /// known once they are heard, so the end time is kept for the stream clock to reach.
    fn final_frames(&mut self, pipeline: PipelineId, end_time: StreamInstant) {
        if let Transport::Loaded { current, next, .. } = &mut self.transport {
            if current.pipeline.id == pipeline {
                current.completion_time = Some(end_time);
            } else if let Next::Ready(next) = next
                && next.pipeline.id == pipeline
            {
                next.completion_time = Some(end_time);
            }
        }
    }

    /// Takes the loaded track's end: the prefetched track if it is chained, otherwise the next
    /// item through the ordinary start. The stream position is what says the track is over.
    fn finish_if_due(&mut self) {
        let now = self.output().map(|output| output.stream.now());
        let due = match (self.current(), now) {
            (Some(current), Some(now)) => {
                !current.paused && current.completion_time.is_some_and(|end| now >= end)
            }
            _ => false,
        };
        if !due {
            return;
        }
        if self.adopt_next() {
            return;
        }
        if let Err(cause) = self.advance_after_track(false) {
            error!("playback.advance_failed cause={cause}");
        }
    }

    /// The track is over, because it played out or a seek went past its end: play the next one or
    /// stop.
    fn advance_after_track(&mut self, start_paused: bool) -> Result<()> {
        if self
            .queue
            .advance(AdvanceReason::Natural, &mut self.rng)
            .is_some()
            && let Some(entry) = self.queue.current().cloned()
        {
            self.send_queue();
            return self.start_entry(entry, StartedBy::Auto, start_paused);
        }
        self.discard_transport();
        self.queue.clear();
        self.send_queue();
        self.send_state();
        Ok(())
    }

    /// Opens the track that follows the playing one once its end is near.
    fn maybe_prefetch(&mut self) {
        let Transport::Loaded {
            output,
            current,
            next,
            seek,
        } = &self.transport
        else {
            return;
        };
        if current.paused
            || !matches!(next, Next::None | Next::Failed(_))
            || !matches!(seek, Seek::None)
        {
            return;
        }
        let Some(duration_ms) = current.position.duration_ms else {
            return;
        };
        if duration_ms.saturating_sub(current.position_ms()) > PREFETCH_LEAD_MS {
            return;
        }
        let Some(entry) = self.queue.peek_natural().cloned() else {
            return;
        };
        if matches!(next, Next::Failed(failed) if *failed == entry.id) {
            return;
        }
        let plan = output.config.processing_plan;
        let Ok(Some(playable)) = self.library_track(entry.track_id) else {
            self.set_next(Next::Failed(entry.id));
            return;
        };
        // Its waveform is analyzed now, in the background, so skipping ahead finds it.
        self.waveforms.upcoming(&playable);
        let id = self.next_source_load_id();
        let file = playable.file.clone();
        let load = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Prefetch { plan },
            self.inbox.clone(),
        );
        self.set_next(Next::Loading(NextLoad {
            load,
            entry,
            playable,
        }));
    }

    /// The file of the next track is read: it is decoded into a queue that the stream plays right
    /// after the playing track.
    fn next_ready(&mut self, result: std::result::Result<PreparedSource, PipelineError>) {
        let Transport::Loaded { next, .. } = &mut self.transport else {
            return;
        };
        let Next::Loading(NextLoad {
            entry, playable, ..
        }) = std::mem::replace(next, Next::None)
        else {
            return;
        };
        let chained = self.chain_next(result, entry, playable);
        self.set_next(match chained {
            Ok(track) => Next::Ready(track),
            Err(failed) => Next::Failed(failed),
        });
    }

    /// Decodes a prefetched file into a queue that the stream plays right after the playing track.
    /// A failure gives the entry's id, so that the entry is not prefetched again.
    fn chain_next(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
        entry: QueueEntry,
        playable: PlayableTrack,
    ) -> std::result::Result<Track, QueueItemId> {
        let failed = entry.id;
        let pipeline_id = self.next_pipeline_id();
        let id = self.next_playback_id();
        let inbox = self.inbox.clone();
        let Ok(prepared) = result else {
            return Err(failed);
        };
        let Transport::Loaded {
            output, current, ..
        } = &mut self.transport
        else {
            return Err(failed);
        };
        let after = current.pipeline.id;
        let plan = output.config.processing_plan;
        let Ok((producer, consumer)) = make_queue(plan.output()) else {
            return Err(failed);
        };
        let Ok(converter) = PcmConverter::new(plan) else {
            return Err(failed);
        };
        let duration_ms = prepared.duration_ms;
        let pipeline = start_decoding(&inbox, pipeline_id, prepared, producer, converter, plan);
        output.stream.queue_next(after, consumer, pipeline_id);
        let position = Position::from_start(output.sample_rate(), duration_ms);
        Ok(Track {
            id,
            entry,
            playable,
            started_by: StartedBy::Auto,
            pipeline,
            position,
            completion_time: None,
            paused: false,
        })
    }

    /// The playing track has ended and the chained one is already playing: it becomes the current
    /// track. Returns false when there is no such track.
    fn adopt_next(&mut self) -> bool {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        let Transport::Loaded {
            next: Next::Ready(next),
            ..
        } = &self.transport
        else {
            return false;
        };
        if Some(next.entry.id) != natural {
            self.set_next(Next::None);
            return false;
        }
        let _ = self.queue.advance(AdvanceReason::Natural, &mut self.rng);
        let Transport::Loaded {
            output,
            current,
            next,
            ..
        } = &mut self.transport
        else {
            return false;
        };
        let Next::Ready(track) = std::mem::replace(next, Next::None) else {
            return false;
        };
        output.stream.adopt_next(track.pipeline.id);
        self.waveforms.loaded(track.id, &track.playable);
        self.last_item = Some(queue_item(track.entry.id, &track.playable));
        // The finished track is dropped here, which stops its decode thread.
        *current = track;
        self.send_queue();
        self.send_state();
        self.send_position();
        true
    }

    /// Drops the prefetched track when something other than it plays next now.
    fn revalidate_prefetch(&mut self) {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        let stale = match &self.transport {
            Transport::Loaded {
                next: Next::Ready(track),
                ..
            } => Some(track.entry.id) != natural,
            Transport::Loaded {
                next: Next::Loading(load),
                ..
            } => Some(load.entry.id) != natural,
            _ => false,
        };
        if stale {
            self.set_next(Next::None);
        }
    }

    /// Replaces what follows the playing track. A track that was chained to the stream is unchained
    /// first, and the rest is dropped with its value.
    fn set_next(&mut self, value: Next) {
        if let Transport::Loaded { output, next, .. } = &mut self.transport {
            if let Next::Ready(_) = next {
                output.stream.clear_next();
            }
            *next = value;
        }
    }

    /// Replaces the seek of the loaded track. Nothing happens when no track is loaded.
    fn set_seek(&mut self, value: Seek) {
        if let Transport::Loaded { seek, .. } = &mut self.transport {
            *seek = value;
        }
    }

    /// The seek's file is read: start decoding the new position. A seek that cannot start is logged,
    /// and the playing track keeps playing.
    fn seek_ready(&mut self, result: std::result::Result<PreparedSource, PipelineError>) {
        let Transport::Loaded { seek, .. } = &mut self.transport else {
            return;
        };
        let Seek::Loading(SeekLoad { duration_ms, .. }) = std::mem::replace(seek, Seek::None)
        else {
            return;
        };
        match self.pending_seek(result, duration_ms) {
            Ok(pending) => self.set_seek(Seek::Decoding(pending)),
            Err(error) => error!("playback.seek_failed error={error:?}"),
        }
    }

    /// The new pipeline of a seek: the stream output of it, and the position it starts from.
    fn pending_seek(
        &mut self,
        result: std::result::Result<PreparedSource, PipelineError>,
        duration_ms: u64,
    ) -> std::result::Result<PendingSeek, PipelineError> {
        let prepared = result?;
        let pipeline_id = self.next_pipeline_id();
        let plan = self
            .output()
            .map(|output| output.config.processing_plan)
            .expect("a seek is prepared only while a track is loaded");
        let (producer, queue) = make_queue(plan.output()).map_err(PipelineError::Output)?;
        let converter = PcmConverter::new(plan)
            .ok()
            .ok_or(PipelineError::ProcessorCreate)?;
        let rate = plan.output().sample_rate().get();
        let total_frames = millis_to_frame(duration_ms, rate);
        let base_frame = prepared.start_output_frame.min(total_frames);
        let remaining_frames = total_frames.saturating_sub(prepared.start_output_frame);
        let pipeline = start_decoding(
            &self.inbox,
            pipeline_id,
            prepared,
            producer,
            converter,
            plan,
        );
        Ok(PendingSeek {
            pipeline,
            queue,
            base_frame,
            remaining_frames,
            duration_ms,
        })
    }

    /// The seek's prebuffer is ready: the stream switches to its queue.
    fn finish_seek(&mut self) {
        {
            let Transport::Loaded {
                output,
                current,
                seek,
                ..
            } = &mut self.transport
            else {
                return;
            };
            let Seek::Decoding(pending) = std::mem::replace(seek, Seek::None) else {
                return;
            };
            output
                .stream
                .switch_queue(pending.queue, pending.pipeline.id);
            // Assigning the pipeline drops the old one, which stops its decode thread.
            current.pipeline = pending.pipeline;
            current.position.sample_rate = output.sample_rate();
            current.position.duration_ms = Some(pending.duration_ms);
            current.position.frame = pending.base_frame;
            current.position.base_frame = pending.base_frame;
            current.position.remaining_frames = Some(pending.remaining_frames);
            current.position.last_send = Instant::now();
            current.completion_time = None;
        }
        self.seek_count = self.seek_count.saturating_add(1);
        self.send_state();
        self.send_position();
    }

    /// The position and the end of the track, sent every tick.
    fn update_position(&mut self) {
        let send = match &mut self.transport {
            Transport::Loaded {
                output, current, ..
            } if !current.paused => {
                current.position.sample(output.stream.as_mut());
                let position = &mut current.position;
                let due = position.frame != position.sent_frame
                    && position.last_send.elapsed() >= POSITION_UPDATE_INTERVAL;
                if due {
                    position.sent_frame = position.frame;
                    position.last_send = Instant::now();
                }
                due
            }
            _ => return,
        };
        if send {
            self.send_position();
        }
        if let Some(current) = self.current()
            && self.loaded_can_go_previous(current) != self.sent_can_go_previous()
        {
            self.send_state();
        }
    }

    /// Lets go of everything in flight. Dropping the transport stops its threads, and the output
    /// stream is closed.
    fn discard_transport(&mut self) {
        self.meter.set_running(false);
        self.transport = Transport::Idle { failed: None };
    }

    /// Takes the transport out, leaving nothing in flight. The caller puts back the stage it keeps.
    fn take_transport(&mut self) -> Transport {
        std::mem::replace(&mut self.transport, Transport::Idle { failed: None })
    }

    /// The loaded track, playing or paused.
    fn current(&self) -> Option<&Track> {
        if let Transport::Loaded { current, .. } = &self.transport {
            Some(current)
        } else {
            None
        }
    }

    /// The output stream of the start in progress or of the loaded track.
    fn output(&self) -> Option<&Output> {
        match &self.transport {
            Transport::Starting { output, .. } | Transport::Loaded { output, .. } => Some(output),
            Transport::Idle { .. } | Transport::Loading(_) => None,
        }
    }

    fn output_mut(&mut self) -> Option<&mut Output> {
        match &mut self.transport {
            Transport::Starting { output, .. } | Transport::Loaded { output, .. } => Some(output),
            Transport::Idle { .. } | Transport::Loading(_) => None,
        }
    }

    /// Whether a start has begun and not yet produced its track.
    fn is_starting(&self) -> bool {
        matches!(
            self.transport,
            Transport::Loading(_) | Transport::Starting { .. }
        )
    }

    // ----- queue -----

    /// Publishes the queue and the transport after a change. Nothing is sent when nothing changed.
    fn queue_changed(&mut self, changed: bool) {
        if changed {
            self.send_queue();
            self.send_state();
        }
    }

    // ----- library -----

    /// The track of `track_id`, read from the library now. `None` when the library no longer has it.
    fn library_track(&self, track_id: TrackId) -> Result<Option<PlayableTrack>> {
        Ok(self.library.playable_tracks(&[track_id])?.pop().flatten())
    }

    /// The queue entry as a row for the transport, read from the library now.
    fn queue_item_of(&self, entry: &QueueEntry) -> Option<QueueItem> {
        self.library_track(entry.track_id)
            .ok()
            .flatten()
            .map(|playable| queue_item(entry.id, &playable))
    }

    // ----- sending -----

    /// Sends the queue when it differs from the one last sent. Each change moves the queue version on
    /// by one, and the version is part of the state.
    fn send_queue(&mut self) {
        let mut value = QueueState::of(&self.queue, &self.library);
        value.version = self.queue_version;
        if self.sent.queue.as_ref() == Some(&value) {
            return;
        }
        self.queue_version += 1;
        value.version = self.queue_version;
        self.sent.queue = Some(value.clone());
        messages::send(&self.messages, BackendMessage::Queue(value));
    }

    /// Renders the transport and sends it when it differs from the one last sent. The position of
    /// the loaded track is read first, so the state carries it.
    fn send_state(&mut self) {
        if let Transport::Loaded {
            output, current, ..
        } = &mut self.transport
            && !current.paused
        {
            current.position.sample(output.stream.as_mut());
        }
        let value = self.render();
        if self.sent.player.as_ref() == Some(&value) {
            return;
        }
        self.sent.player = Some(value.clone());
        messages::send(&self.messages, BackendMessage::Player(Box::new(value)));
    }

    /// Sends the position of the loaded track when it differs from the one last sent.
    fn send_position(&mut self) {
        let Some(current) = self.current() else {
            return;
        };
        let position = PlaybackPosition {
            playback_id: current.id,
            position_ms: current.position_ms(),
            seek_count: self.seek_count,
        };
        if self.sent.position.as_ref() == Some(&position) {
            return;
        }
        self.sent.position = Some(position.clone());
        messages::send(&self.messages, BackendMessage::Position(position));
    }

    fn render(&self) -> PlayerState {
        let mut base = PlayerControls::new(self.volume_state, self.output_selection.clone());
        if let Transport::Idle {
            failed: Some(failed),
        } = &self.transport
        {
            base.can_go_previous = self.queue.can_go_previous();
            base.can_go_next = self.queue.can_go_next();
            let item = self
                .queue
                .current()
                .and_then(|entry| self.queue_item_of(entry))
                .or_else(|| self.last_item.clone());
            return PlayerState::Failed {
                base,
                item,
                error: failed.code,
                skipping: failed.skipping,
            };
        }
        if let Some(request) = self.loading_request() {
            base.can_go_previous = self.queue.can_go_previous();
            base.can_go_next = self.queue.can_go_next();
            return PlayerState::Loading {
                base,
                item: queue_item(request.entry.id, &request.playable),
            };
        }
        if let Transport::Loaded {
            output, current, ..
        } = &self.transport
        {
            base.can_go_previous = self.loaded_can_go_previous(current);
            base.can_go_next = self.queue.can_go_next();
            let session = render_session(current, output, self.seek_count);
            if current.paused {
                PlayerState::Paused { base, session }
            } else {
                PlayerState::Playing { base, session }
            }
        } else {
            PlayerState::Stopped {
                base,
                item: self.last_item.clone(),
            }
        }
    }

    /// The start in progress: its file is being read, or its first samples are decoding.
    fn loading_request(&self) -> Option<&StartPlan> {
        match &self.transport {
            Transport::Loading(load) => Some(&load.request),
            Transport::Starting { starting, .. } => Some(&starting.request),
            _ => None,
        }
    }

    /// Previous is offered when the queue has an earlier item, or the track has played long enough
    /// that Previous restarts it.
    fn loaded_can_go_previous(&self, current: &Track) -> bool {
        self.queue.can_go_previous()
            || previous_restarts_track(current.position_ms(), current.position.duration_ms)
    }

    /// Whether Previous is offered, as listeners last saw it.
    fn sent_can_go_previous(&self) -> bool {
        self.sent
            .player
            .as_ref()
            .is_some_and(|state| state.base().can_go_previous)
    }

    fn preferences(&self) -> PlayerPreferences {
        PlayerPreferences {
            volume: self.volume_state.volume(),
            muted: self.volume_state.muted(),
            output_selection: self.output_selection.clone(),
            repeat_mode: self.queue.repeat(),
            shuffle_enabled: self.queue.shuffle(),
        }
    }

    fn preferences_changed(&self) {
        self.settings.record_player(&self.preferences());
    }
}

fn queue_item(entry_id: QueueItemId, playable: &PlayableTrack) -> QueueItem {
    QueueItem {
        queue_item_id: entry_id,
        track: playable.track.clone(),
    }
}

fn render_session(current: &Track, output: &Output, seek_count: u64) -> CurrentPlayback {
    let config = &output.config;
    let processing = PlaybackProcessingInfo::from_plan(config.processing_plan);
    let playable = &current.playable;
    CurrentPlayback {
        item: queue_item(current.entry.id, playable),
        started_by: current.started_by,
        playback_id: current.id,
        position_ms: current.position_ms(),
        seek_count,
        duration_ms: current.position.duration_ms,
        output_device_name: config.device_name.clone(),
        channel_conversion: processing.channel_conversion,
        source_format: playable
            .file_format
            .clone()
            .unwrap_or_else(|| playable.file.extension.clone()),
        source_bit_depth: playable.bit_depth,
        source_bitrate_kbps: playable.bitrate_kbps,
        source_sample_rate: processing.source_sample_rate,
        output_sample_rate: processing.output_sample_rate,
        resampling_active: processing.resampling_active(),
    }
}

pub(super) fn previous_restarts_track(position_ms: u64, duration_ms: Option<u64>) -> bool {
    duration_ms.is_some() && position_ms >= PREVIOUS_RESTART_THRESHOLD_MS
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StreamSignalAction {
    RefreshDefaultDevice,
    PreservePlayback,
    Fail(PlaybackFailureCode),
}

fn stream_signal_action(
    selection: &AudioOutputSelection,
    kind: StreamFailureKind,
) -> StreamSignalAction {
    match kind {
        StreamFailureKind::DeviceChanged => match selection {
            AudioOutputSelection::SystemDefault => StreamSignalAction::RefreshDefaultDevice,
            AudioOutputSelection::Device { .. } => StreamSignalAction::PreservePlayback,
        },
        StreamFailureKind::DeviceUnavailable => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputDeviceUnavailable)
        }
        StreamFailureKind::RuntimeFailed | StreamFailureKind::CompletionTimingFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputFailed)
        }
    }
}
