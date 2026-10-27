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

mod commands;
mod lifecycle;
mod prefetch;
pub(super) mod published;
mod seek;
mod state;
mod types;

use crate::ids::{PlaybackId, QueueItemId, TrackId};
use crate::library::Library;
use crate::library::read::playback::PlayableTrack;
use crate::messages;
use crate::messages::BackendMessage;
use crate::player::PlayerPreferences;
use crate::player::audio::output::{
    AudioOutputSelection, OutputEvent, OutputStreamFactory, OutputStreamId, PipelineId,
    StreamCallbacks,
};
use crate::player::audio::pipeline::{LoadEvent, LoadEventSink, SourceLoadId};
use crate::player::audio::waveform::Waveforms;
use crate::player::errors::Result;
use crate::player::meter::Meter;
use crate::player::playback::queue::{Queue, QueueEntry, RepeatMode};
use crate::player::playback::transport::{Output, Track};
use crate::player::playback::volume::{NormalizedVolume, VolumeState};
use crate::player::types::AtomicEffectiveGain;
use crate::player::worker::published::{
    CurrentPlayback, PlaybackPosition, PlaybackProcessingInfo, PlayerControls, PlayerState,
    QueueItem, QueueState, QueueWindow, StartedBy,
};
use crate::settings::SettingsStore;
use log::error;
use rand::{SeedableRng, rngs::StdRng};
use state::{Seek, WorkerState};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};
use types::{LastSentState, StartRequest, WorkerContext};

pub(super) use types::{PlayerCommand, WorkerInput, send};

/// How often a playing track is looked at when nothing else arrives.
const TICK: Duration = Duration::from_millis(100);

/// How often the position is sent while a track plays.
const POSITION_UPDATE_INTERVAL: Duration = Duration::from_secs(1);

/// "Previous" restarts the track instead of leaving it once it has played this long.
const PREVIOUS_RESTART_THRESHOLD_MS: u64 = 3_000;

pub(super) struct PlayerWorker {
    /// What the worker is doing with the stream and the track.
    state: WorkerState,
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
    /// The services that the worker shares with its owner.
    ctx: WorkerContext,
    sent: LastSentState,
    inbox: Sender<WorkerInput>,
    playback_id: PlaybackId,
    source_load_id: u64,
    pipeline_id: u64,
    stream_id: u64,
    last_tick: Instant,
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
            state: WorkerState::Idle { failed: None },
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
            ctx: WorkerContext {
                library,
                waveforms,
                settings,
                messages,
                output_stream_factory,
            },
            sent: LastSentState::default(),
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
                if !self.handle_command(command) {
                    return false;
                }
                self.revalidate_prefetch();
            }
            WorkerInput::Load(event) => self.handle_load(event),
            WorkerInput::Output(event) => self.handle_output(event),
        }
        true
    }

    fn shutdown(&mut self) {
        self.discard_state();
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

    /// The sink that the loads and the decode threads report to. Their events arrive as inputs.
    fn load_events(&self) -> LoadEventSink {
        let inbox = self.inbox.clone();
        Arc::new(move |event| send(&inbox, WorkerInput::Load(event)))
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

    /// Switches the output device. While a track is loaded, playback restarts on the new device at
    /// the same position and keeps its paused state and queue.
    pub(super) fn set_output_selection(&mut self, selection: AudioOutputSelection) {
        let WorkerState::Loaded { current, seek, .. } = &self.state else {
            self.set_idle_output_selection(selection);
            return;
        };
        if !matches!(seek, Seek::None) || selection == self.output_selection {
            return;
        }
        if let Err(error) = self.ctx.output_stream_factory.resolve(&selection) {
            self.fail_output(error.code());
            return;
        }
        let request = StartRequest {
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
            && let Err(error) = self.ctx.output_stream_factory.resolve(&selection)
        {
            self.fail_output(error.code());
            return;
        }
        let unchanged = self.output_selection == selection;
        self.output_selection = selection;
        if !unchanged {
            self.preferences_changed();
        }
        self.state = WorkerState::Idle { failed: None };
        self.send_state();
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
            &self.ctx.library,
        )
    }

    /// Publishes the queue and the transport after a change. Nothing is sent when nothing changed.
    fn queue_changed(&mut self, changed: bool) {
        if changed {
            self.send_queue();
            self.send_state();
        }
    }

    /// The track of `track_id`, read from the library now. `None` when the library no longer has it.
    fn library_track(&self, track_id: TrackId) -> Result<Option<PlayableTrack>> {
        Ok(self
            .ctx
            .library
            .playable_tracks(&[track_id])?
            .pop()
            .flatten())
    }

    /// The queue entry as a row for the transport, read from the library now.
    fn queue_item_of(&self, entry: &QueueEntry) -> Option<QueueItem> {
        self.library_track(entry.track_id)
            .ok()
            .flatten()
            .map(|playable| queue_item(entry.id, &playable))
    }

    /// Sends the queue when it differs from the one last sent. Each change moves the queue version on
    /// by one, and the version is part of the state.
    fn send_queue(&mut self) {
        let mut value = QueueState::of(&self.queue, &self.ctx.library);
        value.version = self.queue_version;
        if self.sent.queue.as_ref() == Some(&value) {
            return;
        }
        self.queue_version += 1;
        value.version = self.queue_version;
        self.sent.queue = Some(value.clone());
        messages::send(&self.ctx.messages, BackendMessage::Queue(value));
    }

    /// Renders the transport and sends it when it differs from the one last sent. The position of
    /// the loaded track is read first, so the state carries it.
    fn send_state(&mut self) {
        if let WorkerState::Loaded {
            output, current, ..
        } = &mut self.state
            && !current.paused
        {
            current.position.sample(output.stream.as_mut());
        }
        let value = self.render();
        if self.sent.player.as_ref() == Some(&value) {
            return;
        }
        self.sent.player = Some(value.clone());
        messages::send(&self.ctx.messages, BackendMessage::Player(Box::new(value)));
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
        messages::send(&self.ctx.messages, BackendMessage::Position(position));
    }

    fn render(&self) -> PlayerState {
        let mut base = PlayerControls::new(self.volume_state, self.output_selection.clone());
        if let WorkerState::Idle {
            failed: Some(failed),
        } = &self.state
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
        if let WorkerState::Loaded {
            output, current, ..
        } = &self.state
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
        self.ctx.settings.record_player(&self.preferences());
    }
}
