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
    LoadPosition, Pipeline, PipelineError, PreparedSource, SourceLoad, SourceLoadId, start_decoding,
};
use super::queue::{AdvanceReason, Queue, QueueEntry, QueueError, RepeatMode};
use super::state::{
    CurrentPlayback, PlaybackFailureCode, PlaybackPosition, PlaybackProcessingInfo, PlayerControls,
    PlayerState, QueueItem, QueueState, QueueWindow, StartedBy,
};
use super::transport::{Output, Position, Track};
use crate::errors::CommandError;
use crate::ids::{PlaybackId, QueueItemId, TrackId};
use crate::library::Library;
use crate::library::tracks::PlayableTrack;
use crate::messages::{self, BackendMessage};
use crate::meter::Meter;
use crate::player::output::{
    AudioOutputSelection, DeviceResolutionError, OutputError, OutputEvent, OutputLinks,
    OutputStreamFactory, OutputStreamId, PcmConsumer, PipelineId, StreamFailureKind, make_queue,
};
use crate::player::pcm::millis_to_frame;
use crate::player::processing::PcmConverter;
use crate::player::volume::{AtomicEffectiveGain, NormalizedVolume, VolumeState};
use crate::player::waveform::Waveforms;
use log::{debug, error, info};

/// How often a playing track is looked at when nothing else arrives.
const TICK: Duration = Duration::from_millis(100);
/// How often the position is sent while a track plays.
const POSITION_UPDATE_INTERVAL: Duration = Duration::from_secs(1);
/// "Previous" restarts the track instead of leaving it once it has played this long.
const PREVIOUS_RESTART_THRESHOLD_MS: u64 = 3_000;
/// How long before the end of a track the next one is opened. A shorter track opens it right after
/// it has loaded.
const PREFETCH_LEAD_MS: u64 = 10_000;

/// A job a caller hands to the worker: it runs on the worker thread and answers its caller.
pub(super) type Job = Box<dyn FnOnce(&mut PlayerWorker) + Send>;

/// Everything the worker receives.
pub(super) enum Input {
    Run(Job),
    WorkerEvent(WorkerEvent),
    Shutdown,
}

/// What the threads the worker starts report back.
pub(super) enum WorkerEvent {
    SourceReady {
        id: SourceLoadId,
        result: Result<PreparedSource, PipelineError>,
    },
    PrebufferReady {
        pipeline: PipelineId,
    },
    DecodeFailed {
        pipeline: PipelineId,
        error: PipelineError,
    },
    FinalFrames {
        pipeline: PipelineId,
        end_time: StreamInstant,
    },
    StreamFailed {
        stream: OutputStreamId,
        kind: StreamFailureKind,
    },
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

/// Sends an event to the worker. A worker that has stopped takes nothing, which is not an error.
pub(super) fn send(inbox: &Sender<Input>, event: WorkerEvent) {
    if let Err(cause) = inbox.send(Input::WorkerEvent(event)) {
        debug!("audio.playback.input_send_failed cause={cause}");
    }
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

/// What listeners were last sent. A value is sent again only when it differs from this.
#[derive(Default)]
struct Sent {
    player: Option<PlayerState>,
    queue: Option<QueueState>,
    position: Option<PlaybackPosition>,
}

/// What the player hands to the worker thread when it starts.
pub(super) struct WorkerLinks {
    pub messages: Sender<BackendMessage>,
    pub effective_gain: AtomicEffectiveGain,
    pub meter: Meter,
    pub inbox: Sender<Input>,
    pub library: Option<Arc<Library>>,
    pub waveforms: Arc<Waveforms>,
    pub on_preferences: Box<dyn Fn(&PlayerPreferences) + Send + Sync>,
    pub output_stream_factory: Box<dyn OutputStreamFactory>,
}

pub(super) struct PlayerWorker {
    /// The playing track, or the one that is paused.
    current: Option<Track>,
    /// The output stream. It is opened for each start and lives as long as the playback that
    /// plays through it.
    output: Option<Output>,
    /// The track that plays after the current one, decoded and chained to the stream.
    next: Option<Track>,
    /// The file for `next` is being read.
    next_load: Option<NextLoad>,
    /// The queue entry whose prefetch failed. It is not tried again until the queue moves on.
    next_failed_for: Option<QueueItemId>,
    /// A seek's file is being read.
    seek_load: Option<SeekLoad>,
    /// A seek's new pipeline is decoding.
    seek: Option<PendingSeek>,
    /// A start's file is being read.
    start_load: Option<StartLoad>,
    /// A start's stream is open and its first samples are decoding.
    starting: Option<Starting>,
    failed: Option<Failed>,
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
    library: Option<Arc<Library>>,
    waveforms: Arc<Waveforms>,
    on_preferences: Box<dyn Fn(&PlayerPreferences) + Send + Sync>,
    output_stream_factory: Box<dyn OutputStreamFactory>,
    inbox: Sender<Input>,
    playback_id: PlaybackId,
    source_load_id: u64,
    pipeline_id: u64,
    stream_id: u64,
    last_tick: Instant,
}

impl PlayerWorker {
    pub(super) fn new(
        links: WorkerLinks,
        queue: Queue,
        volume_state: VolumeState,
        output_selection: AudioOutputSelection,
    ) -> Self {
        Self {
            current: None,
            output: None,
            next: None,
            next_load: None,
            next_failed_for: None,
            seek_load: None,
            seek: None,
            start_load: None,
            starting: None,
            failed: None,
            last_item: None,
            seek_count: 0,
            queue,
            queue_version: 0,
            previous_queue: None,
            skipped_in_a_row: 0,
            rng: StdRng::from_rng(&mut rand::rng()),
            volume_state,
            effective_gain: links.effective_gain,
            meter: links.meter,
            output_selection,
            messages: links.messages,
            sent: Sent::default(),
            library: links.library,
            waveforms: links.waveforms,
            on_preferences: links.on_preferences,
            output_stream_factory: links.output_stream_factory,
            inbox: links.inbox,
            playback_id: PlaybackId::first(),
            source_load_id: 0,
            pipeline_id: 0,
            stream_id: 0,
            last_tick: Instant::now(),
        }
    }

    pub(super) fn run(mut self, inputs: &Receiver<Input>) {
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
    fn handle(&mut self, input: Input) -> bool {
        match input {
            Input::Run(job) => {
                // Only a command resets the skip count; the worker's own moves do not.
                self.skipped_in_a_row = 0;
                job(self);
                self.revalidate_prefetch();
            }
            Input::WorkerEvent(event) => self.handle_event(event),
            Input::Shutdown => return false,
        }
        true
    }

    fn is_playing(&self) -> bool {
        self.current.as_ref().is_some_and(|track| !track.paused)
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

    fn handle_event(&mut self, event: WorkerEvent) {
        match event {
            WorkerEvent::SourceReady { id, result } => self.source_ready(id, result),
            WorkerEvent::PrebufferReady { pipeline } => {
                if self
                    .starting
                    .as_ref()
                    .is_some_and(|starting| starting.track.pipeline.id == pipeline)
                {
                    self.finish_start();
                } else if self
                    .seek
                    .as_ref()
                    .is_some_and(|seek| seek.pipeline.id == pipeline)
                {
                    self.finish_seek();
                }
            }
            WorkerEvent::DecodeFailed { pipeline, error } => {
                error!(
                    "playback.decode_failed pipeline_id={} error={error:?}",
                    pipeline.0
                );
                self.decode_failed(pipeline, error);
            }
            WorkerEvent::FinalFrames { pipeline, end_time } => {
                if let Some(current) = self.current.as_mut()
                    && current.pipeline.id == pipeline
                {
                    current.completion_time = Some(end_time);
                } else if let Some(next) = self.next.as_mut()
                    && next.pipeline.id == pipeline
                {
                    next.completion_time = Some(end_time);
                }
            }
            WorkerEvent::StreamFailed { stream, kind } => self.stream_failed(stream, kind),
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

    fn output_links(&self, stream: OutputStreamId) -> OutputLinks {
        let inbox = self.inbox.clone();
        OutputLinks {
            gain: self.effective_gain.clone(),
            events: Arc::new(move |event| {
                let event = match event {
                    OutputEvent::FinalFrames { pipeline, end_time } => {
                        WorkerEvent::FinalFrames { pipeline, end_time }
                    }
                    OutputEvent::Failed(kind) => WorkerEvent::StreamFailed { stream, kind },
                };
                send(&inbox, event);
            }),
            meter: self.meter.clone(),
        }
    }

    // ----- commands -----

    pub(super) fn play_queue(
        &mut self,
        track_ids: Vec<TrackId>,
        start_index: usize,
    ) -> Result<(), CommandError> {
        self.replace_queue(track_ids, start_index)
            .map_err(|_| CommandError::InvalidPlaybackState)?;
        self.start_current(false, StartedBy::Jump)
    }

    /// Replaces the queue, keeping the old one for one-step undo. Nothing is kept when nothing
    /// was queued, so an Undo never resurrects something older than what was just replaced.
    fn replace_queue(
        &mut self,
        track_ids: Vec<TrackId>,
        start_index: usize,
    ) -> Result<(), QueueError> {
        let before = self.queue.clone();
        self.queue.replace(track_ids, start_index, &mut self.rng)?;
        self.previous_queue = (!before.is_empty()).then_some(before);
        Ok(())
    }

    /// Puts back the queue the last replacement or Clear upcoming took away. When the same item
    /// is still current, it keeps playing; otherwise the restored current item starts.
    pub(super) fn restore_previous_queue(&mut self) -> Result<(), CommandError> {
        let Some(previous) = self.previous_queue.take() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        let same_current = matches!(
            (self.queue.current(), previous.current()),
            (Some(now), Some(then)) if now.id == then.id
        ) && self.current.is_some();
        self.queue.restore(previous, &mut self.rng);
        if same_current {
            self.send_queue();
            self.send_state();
            return Ok(());
        }
        self.start_current(false, StartedBy::Jump)
    }

    /// Items enqueued with nothing current: they start playing.
    fn start_enqueued(&mut self, track_ids: Vec<TrackId>) -> Result<(), CommandError> {
        self.replace_queue(track_ids, 0)
            .map_err(|_| CommandError::InvalidPlaybackState)?;
        self.start_current(false, StartedBy::Jump)
    }

    pub(super) fn previous(&mut self) -> Result<(), CommandError> {
        self.navigate(AdvanceReason::UserPrevious)
    }

    pub(super) fn next(&mut self) -> Result<(), CommandError> {
        self.navigate(AdvanceReason::UserNext)
    }

    fn navigate(&mut self, reason: AdvanceReason) -> Result<(), CommandError> {
        if reason == AdvanceReason::UserPrevious
            && let Some(current) = self.current.as_ref()
            && previous_restarts_track(current.position_ms(), current.position.duration_ms)
        {
            return self.seek(0);
        }
        let paused = self.current.as_ref().is_some_and(|current| current.paused);
        if self.queue.advance(reason, &mut self.rng).is_none() {
            return Ok(());
        }
        let started_by = match reason {
            AdvanceReason::UserPrevious => StartedBy::Previous,
            _ => StartedBy::Next,
        };
        self.start_current(paused, started_by)
    }

    pub(super) fn pause(&mut self) -> Result<(), CommandError> {
        if self.set_pending_pause(true) {
            return Ok(());
        }
        let Some(current) = self.current.as_ref() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if current.paused {
            return Ok(());
        }
        let Some(output) = self.output.as_mut() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if let Err(error) = output.stream.pause() {
            return Err(self.control_failure(error));
        }
        let current = self.current.as_mut().expect("checked above");
        current.position.sample(output.stream.as_mut());
        output.stream.clear_timing_anchor();
        current.paused = true;
        self.meter.set_running(false);
        self.send_state();
        Ok(())
    }

    /// Resume, or after a failure Retry: starts the current queue item again, queue intact.
    pub(super) fn resume(&mut self) -> Result<(), CommandError> {
        if self.failed.is_some() {
            return self.start_current(false, StartedBy::Jump);
        }
        self.unpause()
    }

    fn unpause(&mut self) -> Result<(), CommandError> {
        if self.set_pending_pause(false) {
            return Ok(());
        }
        let Some(current) = self.current.as_ref() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if !current.paused {
            return Ok(());
        }
        let Some(output) = self.output.as_mut() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        if let Err(error) = output.stream.start() {
            let error = match error {
                OutputError::StreamStartFailed => OutputError::StreamResumeFailed,
                other => other,
            };
            return Err(self.control_failure(error));
        }
        let current = self.current.as_mut().expect("checked above");
        current.paused = false;
        self.meter.set_running(true);
        self.send_state();
        Ok(())
    }

    /// Pause and resume while a start is still loading only change what the start does once it
    /// plays. Returns whether a start was loading.
    fn set_pending_pause(&mut self, paused: bool) -> bool {
        if let Some(load) = self.start_load.as_mut() {
            load.request.start_paused = paused;
            return true;
        }
        if let Some(starting) = self.starting.as_mut() {
            starting.request.start_paused = paused;
            starting.track.paused = paused;
            return true;
        }
        false
    }

    /// Switches the output device. While a track is loaded, playback restarts on the new device at
    /// the same position and keeps its paused state and queue.
    pub(super) fn set_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<(), CommandError> {
        let Some(current) = self.current.as_ref() else {
            return self.set_idle_output_selection(selection);
        };
        if self.seek.is_some() || self.seek_load.is_some() {
            return Err(CommandError::InvalidPlaybackState);
        }
        if selection == self.output_selection {
            return Ok(());
        }
        if let Err(error) = self.output_stream_factory.resolve(&selection) {
            return Err(resolution_error(error));
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
        self.begin_start(request)
    }

    fn set_idle_output_selection(
        &mut self,
        selection: AudioOutputSelection,
    ) -> Result<(), CommandError> {
        if self.start_load.is_some() || self.starting.is_some() {
            return Err(CommandError::InvalidPlaybackState);
        }
        if let AudioOutputSelection::Device { .. } = &selection {
            self.output_stream_factory
                .resolve(&selection)
                .map_err(resolution_error)?;
        }
        let unchanged = self.output_selection == selection;
        self.output_selection = selection;
        if !unchanged {
            self.preferences_changed();
        }
        self.failed = None;
        self.send_state();
        Ok(())
    }

    /// Seeks the playing track. The new position is prebuffered while the old one keeps playing.
    /// A seek that fails while it loads leaves the playing track as it is.
    pub(super) fn seek(&mut self, requested_position_ms: u64) -> Result<(), CommandError> {
        self.cancel_seek();
        self.cancel_prefetch();
        let Some(current) = self.current.as_ref() else {
            return Err(CommandError::InvalidPlaybackState);
        };
        let Some(duration_ms) = current.position.duration_ms else {
            return Err(CommandError::DurationUnavailable);
        };
        let target_ms = requested_position_ms.min(duration_ms);
        if target_ms == duration_ms {
            let paused = current.paused;
            return self.advance_after_track(paused);
        }
        let file = current.playable.file.clone();
        let Some(plan) = self
            .output
            .as_ref()
            .map(|output| output.config.processing_plan)
        else {
            return Err(CommandError::InvalidPlaybackState);
        };
        let id = self.next_source_load_id();
        let Ok(load) = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Seek { target_ms, plan },
            self.inbox.clone(),
        ) else {
            return Err(CommandError::TaskFailed);
        };
        self.seek_load = Some(SeekLoad { load, duration_ms });
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

    pub(super) fn remove_queue_item(&mut self, id: QueueItemId) -> Result<(), CommandError> {
        let changed = self.edit_queue(|queue| queue.remove_upcoming(id).map(|()| true))?;
        self.queue_changed(changed);
        Ok(())
    }

    pub(super) fn move_queue_item(
        &mut self,
        id: QueueItemId,
        to: usize,
    ) -> Result<(), CommandError> {
        let changed = self.edit_queue(|queue| queue.move_upcoming(id, to))?;
        self.queue_changed(changed);
        Ok(())
    }

    pub(super) fn play_queue_item(&mut self, id: QueueItemId) -> Result<(), CommandError> {
        match self.queue.jump_to(id) {
            Ok(()) => self.start_current(false, StartedBy::Jump),
            Err(_) => Err(CommandError::QueueItemNotFound),
        }
    }

    pub(super) fn enqueue(
        &mut self,
        track_ids: Vec<TrackId>,
        next: bool,
    ) -> Result<(), CommandError> {
        if self.queue.current().is_none() {
            return self.start_enqueued(track_ids);
        }
        let changed = self.edit_queue(|queue| queue.enqueue(track_ids, next).map(|()| true))?;
        self.queue_changed(changed);
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
            self.library.as_deref(),
        )
    }

    // ----- starting -----

    /// Starts whatever the queue points at, after telling listeners where the queue stands.
    fn start_current(
        &mut self,
        start_paused: bool,
        started_by: StartedBy,
    ) -> Result<(), CommandError> {
        let Some(entry) = self.queue.current().cloned() else {
            return Err(CommandError::InvalidPlaybackState);
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
    ) -> Result<(), CommandError> {
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
                self.begin_start(request)
            }
            Ok(None) => self.fail(
                Failure::SkipItem,
                PlaybackFailureCode::DecodeFailed,
                CommandError::TrackUnavailable,
                started_by,
            ),
            Err(error) => {
                self.discard_transport();
                self.send_queue();
                self.send_state();
                Err(error)
            }
        }
    }

    /// Begins a start: its file is read from now on, and the transport shows the track as loading.
    fn begin_start(&mut self, request: StartPlan) -> Result<(), CommandError> {
        self.discard_transport();
        self.failed = None;
        let file = request.playable.file.clone();
        let id = self.next_source_load_id();
        match SourceLoad::spawn(file, id, LoadPosition::Start, self.inbox.clone()) {
            Ok(load) => {
                self.start_load = Some(StartLoad { load, request });
                self.send_state();
                Ok(())
            }
            Err(()) => self.fail(
                Failure::StopOutput,
                PlaybackFailureCode::DecodeFailed,
                CommandError::TaskFailed,
                request.started_by,
            ),
        }
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
        let links = self.output_links(stream_id);
        let spec = prepared.decoder.spec();
        let prepared_output =
            match self
                .output_stream_factory
                .open(&selection, spec, pipeline_id, links)
            {
                Ok(prepared_output) => prepared_output,
                Err(error) => {
                    let code = output_failure_code(error);
                    let _ = self.fail(
                        Failure::StopOutput,
                        code,
                        CommandError::from(code),
                        request.started_by,
                    );
                    return;
                }
            };
        let plan = prepared_output.config.processing_plan;
        let Ok(converter) = PcmConverter::new(plan) else {
            let _ = self.fail_pipeline(
                PipelineError::ProcessorCreate,
                device_switch,
                request.started_by,
            );
            return;
        };
        let duration_ms = prepared.duration_ms;
        let pipeline = match start_decoding(
            &self.inbox,
            pipeline_id,
            prepared,
            prepared_output.producer,
            converter,
            plan,
        ) {
            Ok(pipeline) => pipeline,
            Err(error) => {
                let _ = self.fail_pipeline(error, device_switch, request.started_by);
                return;
            }
        };
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
        self.output = Some(output);
        self.starting = Some(Starting { request, track });
    }

    /// The prebuffer is ready: start the stream (unless starting paused) and send the track.
    fn finish_start(&mut self) {
        let Some(Starting { request, track }) = self.starting.take() else {
            return;
        };
        if !request.start_paused
            && let Some(output) = self.output.as_ref()
            && let Err(error) = output.stream.start()
        {
            track.pipeline.cancel();
            let code = output_failure_code(error);
            let _ = self.fail(
                Failure::StopOutput,
                code,
                CommandError::from(code),
                request.started_by,
            );
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
        self.current = Some(track);
        self.failed = None;
        let running = self.is_playing();
        self.meter.set_running(running);
        self.send_state();
        self.send_position();
        if let Some(position_ms) = resume_at_ms {
            let _ = self.seek(position_ms);
        }
    }

    fn source_ready(&mut self, id: SourceLoadId, result: Result<PreparedSource, PipelineError>) {
        if self
            .start_load
            .as_ref()
            .is_some_and(|load| load.load.id == id)
        {
            let Some(StartLoad { request, .. }) = self.start_load.take() else {
                return;
            };
            match result {
                Ok(prepared) => self.open_start(request, prepared),
                Err(error) => {
                    let device_switch = request.selection.is_some();
                    let _ = self.fail_pipeline(error, device_switch, request.started_by);
                }
            }
        } else if self
            .next_load
            .as_ref()
            .is_some_and(|next| next.load.id == id)
        {
            self.next_ready(result);
        } else if self
            .seek_load
            .as_ref()
            .is_some_and(|seek| seek.load.id == id)
        {
            self.seek_ready(result);
        }
    }

    fn fail_pipeline(
        &mut self,
        error: PipelineError,
        device_switch: bool,
        started_by: StartedBy,
    ) -> Result<(), CommandError> {
        // A device switch that cannot play is a failed output, not a file to skip.
        let failure = if device_switch {
            Failure::StopOutput
        } else {
            Failure::SkipItem
        };
        self.fail(
            failure,
            error.code(),
            CommandError::from(error.code()),
            started_by,
        )
    }

    // ----- failures -----

    /// Stops the transport on a failure. A skip moves on to the next item, and the listener is told.
    /// Returns the answer to the command that caused the start: the next item's start when the
    /// failure skipped to it, otherwise the error.
    fn fail(
        &mut self,
        failure: Failure,
        code: PlaybackFailureCode,
        error: CommandError,
        started_by: StartedBy,
    ) -> Result<(), CommandError> {
        error!("playback.failed code={code:?} failure={failure:?} started_by={started_by:?}");
        self.discard_transport();
        let skipping = failure == Failure::SkipItem && self.will_skip();
        self.failed = Some(Failed { code, skipping });
        self.send_state();
        if skipping {
            self.occur_track_skipped();
        }
        if failure == Failure::SkipItem
            && let Some(entry) = self.next_after_item_failure()
        {
            return self.start_entry(entry, StartedBy::Auto, false);
        }
        Err(error)
    }

    fn fail_output(&mut self, code: PlaybackFailureCode) {
        let _ = self.fail(
            Failure::StopOutput,
            code,
            CommandError::from(code),
            StartedBy::Jump,
        );
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
    fn occur_track_skipped(&self) {
        let title = self
            .queue
            .current()
            .and_then(|entry| self.library_track(entry.track_id).ok().flatten())
            .map(|track| track.track.core.title);
        messages::send(&self.messages, BackendMessage::TrackSkipped { title });
    }

    fn decode_failed(&mut self, pipeline: PipelineId, error: PipelineError) {
        if self
            .starting
            .as_ref()
            .is_some_and(|starting| starting.track.pipeline.id == pipeline)
        {
            let Some(Starting { request, track }) = self.starting.take() else {
                return;
            };
            track.pipeline.cancel();
            let device_switch = request.selection.is_some();
            let _ = self.fail_pipeline(error, device_switch, request.started_by);
        } else if self
            .current
            .as_ref()
            .is_some_and(|current| current.pipeline.id == pipeline)
        {
            let _ = self.fail_pipeline(error, false, StartedBy::Auto);
        } else if self
            .seek
            .as_ref()
            .is_some_and(|seek| seek.pipeline.id == pipeline)
        {
            // The playing track keeps playing; the failed seek is only logged.
            if let Some(seek) = self.seek.take() {
                seek.pipeline.cancel();
            }
        } else if self
            .next
            .as_ref()
            .is_some_and(|next| next.pipeline.id == pipeline)
        {
            self.next_failed_for = self.next.as_ref().map(|next| next.entry.id);
            self.drop_next();
        }
    }

    fn stream_failed(&mut self, stream: OutputStreamId, kind: StreamFailureKind) {
        if !self
            .output
            .as_ref()
            .is_some_and(|output| output.id == stream)
        {
            return;
        }
        match stream_signal_action(&self.output_selection, kind) {
            StreamSignalAction::RefreshDefaultDevice => {
                info!("playback.stream_interrupted stream_id={}", stream.0);
                self.cancel_seek();
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
        let Some(output) = self.output.as_mut() else {
            return false;
        };
        output.config.device_id = identity.id;
        output.config.device_name = identity.name;
        self.send_state();
        true
    }

    /// A control call failed on the stream: the stream is stopped with the queue intact.
    fn control_failure(&mut self, error: OutputError) -> CommandError {
        let code = output_failure_code(error);
        self.fail_output(code);
        CommandError::from(code)
    }

    // ----- playing on -----

    /// Takes the loaded track's end: the prefetched track if it is chained, otherwise the next
    /// item through the ordinary start. The stream position is what says the track is over.
    fn finish_if_due(&mut self) {
        let now = self.output.as_ref().map(|output| output.stream.now());
        let due = match (self.current.as_ref(), now) {
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
        let _ = self.advance_after_track(false);
    }

    /// The track is over, because it played out or a seek went past its end: play the next one or
    /// stop.
    fn advance_after_track(&mut self, start_paused: bool) -> Result<(), CommandError> {
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
        let Some(current) = self.current.as_ref() else {
            return;
        };
        if current.paused
            || self.next.is_some()
            || self.next_load.is_some()
            || self.seek.is_some()
            || self.seek_load.is_some()
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
        if self.next_failed_for == Some(entry.id) {
            return;
        }
        let Some(plan) = self
            .output
            .as_ref()
            .map(|output| output.config.processing_plan)
        else {
            return;
        };
        let Ok(Some(playable)) = self.library_track(entry.track_id) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        // Its waveform is analyzed now, in the background, so skipping ahead finds it.
        self.waveforms.upcoming(&playable);
        let id = self.next_source_load_id();
        let file = playable.file.clone();
        let Ok(load) = SourceLoad::spawn(
            file,
            id,
            LoadPosition::Prefetch { plan },
            self.inbox.clone(),
        ) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        self.next_load = Some(NextLoad {
            load,
            entry,
            playable,
        });
    }

    /// The file of the next track is read: decode it into a queue the stream plays right after the
    /// playing track.
    fn next_ready(&mut self, result: Result<PreparedSource, PipelineError>) {
        let Some(NextLoad {
            entry, playable, ..
        }) = self.next_load.take()
        else {
            return;
        };
        let Ok(prepared) = result else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        let pipeline_id = self.next_pipeline_id();
        let id = self.next_playback_id();
        let Some(after) = self.current.as_ref().map(|current| current.pipeline.id) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        let Some(output) = self.output.as_mut() else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        let plan = output.config.processing_plan;
        let Ok((producer, consumer)) = make_queue(plan.output()) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        let Ok(converter) = PcmConverter::new(plan) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        let duration_ms = prepared.duration_ms;
        let Ok(pipeline) = start_decoding(
            &self.inbox,
            pipeline_id,
            prepared,
            producer,
            converter,
            plan,
        ) else {
            self.next_failed_for = Some(entry.id);
            return;
        };
        output.stream.queue_next(after, consumer, pipeline_id);
        let position = Position::from_start(output.sample_rate(), duration_ms);
        self.next = Some(Track {
            id,
            entry,
            playable,
            started_by: StartedBy::Auto,
            pipeline,
            position,
            completion_time: None,
            paused: false,
        });
    }

    /// The playing track has ended and the chained one is already playing: it becomes the current
    /// track. Returns false when there is no such track.
    fn adopt_next(&mut self) -> bool {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        let Some(next) = self.next.take() else {
            return false;
        };
        if Some(next.entry.id) != natural {
            self.next = Some(next);
            self.drop_next();
            return false;
        }
        let _ = self.queue.advance(AdvanceReason::Natural, &mut self.rng);
        if let Some(finished) = self.current.take() {
            finished.pipeline.cancel();
        }
        if let Some(output) = self.output.as_mut() {
            output.stream.adopt_next(next.pipeline.id);
        }
        self.waveforms.loaded(next.id, &next.playable);
        self.last_item = Some(queue_item(next.entry.id, &next.playable));
        self.current = Some(next);
        self.send_queue();
        self.send_state();
        self.send_position();
        true
    }

    /// Drops the prefetched track when something other than it plays next now.
    fn revalidate_prefetch(&mut self) {
        let natural = self.queue.peek_natural().map(|entry| entry.id);
        if self
            .next
            .as_ref()
            .is_some_and(|next| Some(next.entry.id) != natural)
        {
            self.drop_next();
        }
        if self
            .next_load
            .as_ref()
            .is_some_and(|load| Some(load.entry.id) != natural)
            && let Some(load) = self.next_load.take()
        {
            load.load.cancel();
        }
    }

    fn drop_next(&mut self) {
        if let Some(next) = self.next.take() {
            if let Some(output) = self.output.as_mut() {
                output.stream.clear_next();
            }
            next.pipeline.cancel();
        }
    }

    fn cancel_prefetch(&mut self) {
        self.drop_next();
        if let Some(load) = self.next_load.take() {
            load.load.cancel();
        }
    }

    /// The seek's file is read: start decoding the new position. A seek that cannot start is logged,
    /// and the playing track keeps playing.
    fn seek_ready(&mut self, result: Result<PreparedSource, PipelineError>) {
        let Some(SeekLoad { duration_ms, .. }) = self.seek_load.take() else {
            return;
        };
        match self.pending_seek(result, duration_ms) {
            Ok(seek) => self.seek = Some(seek),
            Err(error) => error!("playback.seek_failed error={error:?}"),
        }
    }

    /// The new pipeline of a seek: the stream output of it, and the position it starts from.
    fn pending_seek(
        &mut self,
        result: Result<PreparedSource, PipelineError>,
        duration_ms: u64,
    ) -> Result<PendingSeek, CommandError> {
        let prepared = result.map_err(|error| match error {
            PipelineError::SeekFailed => CommandError::SeekFailed,
            other => CommandError::from(other.code()),
        })?;
        let pipeline_id = self.next_pipeline_id();
        let plan = self
            .output
            .as_ref()
            .map(|output| output.config.processing_plan)
            .ok_or(CommandError::InvalidPlaybackState)?;
        let (producer, queue) = make_queue(plan.output())
            .map_err(|error| CommandError::from(output_failure_code(error)))?;
        let converter = PcmConverter::new(plan)
            .map_err(|_| CommandError::from(PlaybackFailureCode::SampleRateConversionFailed))?;
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
        )
        .map_err(|error| CommandError::from(error.code()))?;
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
        let Some(seek) = self.seek.take() else {
            return;
        };
        let (Some(output), Some(current)) = (self.output.as_mut(), self.current.as_mut()) else {
            seek.pipeline.cancel();
            return;
        };
        output.stream.switch_queue(seek.queue, seek.pipeline.id);
        let old = std::mem::replace(&mut current.pipeline, seek.pipeline);
        old.cancel();
        current.position.sample_rate = output.sample_rate();
        current.position.duration_ms = Some(seek.duration_ms);
        current.position.frame = seek.base_frame;
        current.position.base_frame = seek.base_frame;
        current.position.remaining_frames = Some(seek.remaining_frames);
        current.position.last_send = Instant::now();
        current.completion_time = None;
        self.seek_count = self.seek_count.saturating_add(1);
        self.send_state();
        self.send_position();
    }

    fn cancel_seek(&mut self) {
        if let Some(load) = self.seek_load.take() {
            load.load.cancel();
        }
        if let Some(seek) = self.seek.take() {
            seek.pipeline.cancel();
        }
    }

    /// The position and the end of the track, sent every tick.
    fn update_position(&mut self) {
        let send = match (self.current.as_mut(), self.output.as_mut()) {
            (Some(current), Some(output)) if !current.paused => {
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
        if let Some(current) = self.current.as_ref()
            && self.loaded_can_go_previous(current) != self.sent_can_go_previous()
        {
            self.send_state();
        }
    }

    /// Lets go of everything in flight. The output stream is closed.
    fn discard_transport(&mut self) {
        self.meter.set_running(false);
        if let Some(StartLoad { load, .. }) = self.start_load.take() {
            load.cancel();
        }
        if let Some(Starting { track, .. }) = self.starting.take() {
            track.pipeline.cancel();
        }
        self.cancel_seek();
        self.cancel_prefetch();
        if let Some(current) = self.current.take() {
            current.pipeline.cancel();
        }
        self.output = None;
    }

    // ----- queue -----

    /// Publishes the queue and the transport after a change. Nothing is sent when nothing changed.
    fn queue_changed(&mut self, changed: bool) {
        if changed {
            self.send_queue();
            self.send_state();
        }
    }

    fn edit_queue(
        &mut self,
        edit: impl FnOnce(&mut Queue) -> Result<bool, QueueError>,
    ) -> Result<bool, CommandError> {
        if self.start_load.is_some() || self.starting.is_some() {
            return Err(CommandError::QueueBusy);
        }
        edit(&mut self.queue)
            .inspect_err(|cause| log::warn!("playback.queue.edit_failed cause={cause}"))
            .map_err(|_| CommandError::QueueItemNotFound)
    }

    // ----- library -----

    /// The track of `track_id`, read from the library now. `None` when the library no longer has it.
    fn library_track(&self, track_id: TrackId) -> Result<Option<PlayableTrack>, CommandError> {
        let library = self
            .library
            .as_ref()
            .ok_or(CommandError::LibraryUnavailable)?;
        Ok(library.playable_tracks(&[track_id])?.pop().flatten())
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
        let mut value = QueueState::of(&self.queue, self.library.as_deref());
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
        if let (Some(current), Some(output)) = (self.current.as_mut(), self.output.as_mut())
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
        let Some(current) = self.current.as_ref() else {
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
        if let Some(failed) = &self.failed {
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
        if let Some(item) = self.loading_item() {
            base.can_go_previous = self.queue.can_go_previous();
            base.can_go_next = self.queue.can_go_next();
            return PlayerState::Loading { base, item };
        }
        match (self.current.as_ref(), self.output.as_ref()) {
            (Some(current), Some(output)) => {
                base.can_go_previous = self.loaded_can_go_previous(current);
                base.can_go_next = self.queue.can_go_next();
                let session = render_session(current, output, self.seek_count);
                if current.paused {
                    PlayerState::Paused { base, session }
                } else {
                    PlayerState::Playing { base, session }
                }
            }
            _ => PlayerState::Stopped {
                base,
                item: self.last_item.clone(),
            },
        }
    }

    /// The track of the start in progress: its file is being read, or its first samples are decoding.
    fn loading_item(&self) -> Option<QueueItem> {
        if let Some(load) = self.start_load.as_ref() {
            return Some(queue_item(load.request.entry.id, &load.request.playable));
        }
        self.starting
            .as_ref()
            .map(|starting| queue_item(starting.request.entry.id, &starting.request.playable))
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
        (self.on_preferences)(&self.preferences());
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
        StreamFailureKind::RuntimeFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::OutputStreamRuntimeFailed)
        }
        StreamFailureKind::CompletionTimingFailed => {
            StreamSignalAction::Fail(PlaybackFailureCode::CompletionTimingFailed)
        }
    }
}

fn resolution_error(error: DeviceResolutionError) -> CommandError {
    match error {
        DeviceResolutionError::InvalidDeviceId => CommandError::TaskFailed,
        DeviceResolutionError::DeviceUnavailable | DeviceResolutionError::NoDefaultOutputDevice => {
            CommandError::from(PlaybackFailureCode::OutputDeviceUnavailable)
        }
    }
}

pub(super) fn output_failure_code(error: OutputError) -> PlaybackFailureCode {
    match error {
        OutputError::NoOutputDevice => PlaybackFailureCode::NoOutputDevice,
        OutputError::UnsupportedConfiguration
        | OutputError::ConfigurationQueryFailed
        | OutputError::StreamConfigurationUnsupported => {
            PlaybackFailureCode::UnsupportedOutputConfiguration
        }
        OutputError::StreamBuildFailed => PlaybackFailureCode::OutputStreamBuildFailed,
        OutputError::StreamStartFailed => PlaybackFailureCode::OutputStreamStartFailed,
        OutputError::StreamPauseFailed => PlaybackFailureCode::OutputStreamPauseFailed,
        OutputError::StreamResumeFailed => PlaybackFailureCode::OutputStreamResumeFailed,
        OutputError::DeviceUnavailable => PlaybackFailureCode::OutputDeviceUnavailable,
    }
}
