//! A fake output for tests: no device, no callback. Tests play the part of the device by setting
//! how far the "speakers" got and by sending the events a real stream would.

use parking_lot::Mutex;
use std::sync::Arc;

use cpal::StreamInstant;

use super::output::{
    AudioOutputDeviceIdentity, AudioOutputSelection, DeviceResolutionError, OutputError,
    OutputEvent, OutputEvents, OutputLinks, OutputStream, OutputStreamFactory, PcmConsumer,
    PipelineId, PreparedOutput, PreparedOutputConfig, StreamFailureKind, make_queue,
};
use super::pcm::PcmSpec;
use super::processing::OutputProcessingPlan;

struct StreamState {
    running: bool,
    played_frames: u64,
    now: StreamInstant,
    events: OutputEvents,
    fail_start: Option<OutputError>,
    fail_pause: Option<OutputError>,
    /// The pipeline the stream plays.
    pipeline: PipelineId,
    /// How many times a seek handed the stream a new queue.
    queue_switches: usize,
    /// The pipeline whose queue was chained to play after the current one, and the queue.
    next: Option<(PipelineId, PcmConsumer)>,
    /// How many times the stream moved on to a chained queue.
    adoptions: usize,
    /// Keeps the queue alive like the real callback would.
    consumer: PcmConsumer,
}

struct Shared {
    devices: Vec<AudioOutputDeviceIdentity>,
    fail_open: Option<OutputError>,
    fail_next_start: Option<OutputError>,
    streams: Vec<Arc<Mutex<StreamState>>>,
    selections: Vec<AudioOutputSelection>,
}

/// The test's handle on the fake device. Clone it freely; every clone sees the same device.
#[derive(Clone)]
pub(crate) struct FakeOutput(Arc<Mutex<Shared>>);

impl FakeOutput {
    pub(crate) fn new() -> Self {
        let device = |id: &str, name: &str| AudioOutputDeviceIdentity {
            id: id.into(),
            name: name.into(),
        };
        Self(Arc::new(Mutex::new(Shared {
            devices: vec![
                device("fake-default", "Fake speakers"),
                device("fake-other", "Other fake speakers"),
            ],
            fail_open: None,
            fail_next_start: None,
            streams: Vec::new(),
            selections: Vec::new(),
        })))
    }

    fn shared(&self) -> parking_lot::MutexGuard<'_, Shared> {
        self.0.lock()
    }

    fn latest(&self) -> Arc<Mutex<StreamState>> {
        Arc::clone(
            self.shared()
                .streams
                .last()
                .expect("a stream has been prepared"),
        )
    }

    /// How many streams were opened. A session opens one, however often it seeks.
    pub(crate) fn streams_opened(&self) -> usize {
        self.shared().streams.len()
    }

    /// How many times the newest stream was handed a new queue.
    pub(crate) fn queue_switches(&self) -> usize {
        self.latest().lock().queue_switches
    }

    /// The pipeline chained to play after the current one on the newest stream, if any.
    pub(crate) fn chained_pipeline(&self) -> Option<PipelineId> {
        self.latest()
            .lock()
            .next
            .as_ref()
            .map(|(pipeline, _)| *pipeline)
    }

    /// How many times the newest stream moved on to a chained queue.
    pub(crate) fn adoptions(&self) -> usize {
        self.latest().lock().adoptions
    }

    /// The selections new sessions were prepared for, in order.
    pub(crate) fn opened_selections(&self) -> Vec<AudioOutputSelection> {
        self.shared().selections.clone()
    }

    /// Whether the newest stream is started and not paused.
    pub(crate) fn is_running(&self) -> bool {
        self.latest().lock().running
    }

    /// How far the speakers got on the newest stream.
    pub(crate) fn set_played_frames(&self, frames: u64) {
        self.latest().lock().played_frames = frames;
    }

    pub(crate) fn fail_next_open(&self, error: OutputError) {
        self.shared().fail_open = Some(error);
    }

    /// The next stream's `start` fails.
    pub(crate) fn fail_next_start(&self, error: OutputError) {
        self.shared().fail_next_start = Some(error);
    }

    /// The newest stream's next `pause` fails.
    pub(crate) fn fail_next_pause(&self, error: OutputError) {
        self.latest().lock().fail_pause = Some(error);
    }

    /// The newest stream hands its last frames to the device, due at the stream's current time.
    pub(crate) fn finish_playback(&self) {
        let stream = self.latest();
        let (events, now, pipeline) = {
            let state = stream.lock();
            (Arc::clone(&state.events), state.now, state.pipeline)
        };
        events(OutputEvent::FinalFrames {
            pipeline,
            end_time: now,
        });
    }

    pub(crate) fn fail_stream(&self, kind: StreamFailureKind) {
        let events = Arc::clone(&self.latest().lock().events);
        events(OutputEvent::Failed(kind));
    }
}

impl OutputStreamFactory for FakeOutput {
    fn resolve(
        &self,
        selection: &AudioOutputSelection,
    ) -> Result<AudioOutputDeviceIdentity, DeviceResolutionError> {
        let shared = self.shared();
        match selection {
            AudioOutputSelection::SystemDefault => shared
                .devices
                .first()
                .cloned()
                .ok_or(DeviceResolutionError::NoDefaultOutputDevice),
            AudioOutputSelection::Device { device_id } if device_id.is_empty() => {
                Err(DeviceResolutionError::InvalidDeviceId)
            }
            AudioOutputSelection::Device { device_id } => shared
                .devices
                .iter()
                .find(|device| &device.id == device_id)
                .cloned()
                .ok_or(DeviceResolutionError::DeviceUnavailable),
        }
    }

    fn open(
        &self,
        selection: &AudioOutputSelection,
        spec: PcmSpec,
        first: PipelineId,
        links: OutputLinks,
    ) -> Result<PreparedOutput, OutputError> {
        if let Some(error) = self.shared().fail_open.take() {
            return Err(error);
        }
        let device = self.resolve(selection)?;
        self.shared().selections.push(selection.clone());
        let plan = OutputProcessingPlan::new(spec, spec)
            .inspect_err(|cause| log::warn!("audio.fake_output.plan_failed cause={cause}"))
            .map_err(|_| OutputError::UnsupportedConfiguration)?;
        let config = PreparedOutputConfig {
            device_id: device.id,
            device_name: device.name,
            processing_plan: plan,
        };
        let (producer, consumer) = make_queue(spec)?;
        let start_error = self.shared().fail_next_start.take();
        let state = Arc::new(Mutex::new(StreamState {
            running: false,
            played_frames: 0,
            now: StreamInstant::new(1, 0),
            events: links.events,
            fail_start: start_error,
            fail_pause: None,
            pipeline: first,
            queue_switches: 0,
            next: None,
            adoptions: 0,
            consumer,
        }));
        self.shared().streams.push(Arc::clone(&state));
        Ok(PreparedOutput {
            stream: Box::new(FakeStream {
                state,
                last_position: 0,
            }),
            producer,
            config,
        })
    }
}

struct FakeStream {
    state: Arc<Mutex<StreamState>>,
    last_position: u64,
}

impl FakeStream {
    fn state(&self) -> parking_lot::MutexGuard<'_, StreamState> {
        self.state.lock()
    }
}

impl OutputStream for FakeStream {
    fn start(&self) -> Result<(), OutputError> {
        let mut state = self.state();
        if let Some(error) = state.fail_start.take() {
            return Err(error);
        }
        state.running = true;
        Ok(())
    }

    fn pause(&self) -> Result<(), OutputError> {
        let mut state = self.state();
        if let Some(error) = state.fail_pause.take() {
            return Err(error);
        }
        state.running = false;
        Ok(())
    }

    fn now(&self) -> StreamInstant {
        self.state().now
    }

    fn played_frame_position(&mut self, _sample_rate: u32, max_frame_count: Option<u64>) -> u64 {
        let played = self.state().played_frames;
        let played = max_frame_count.map_or(played, |max| played.min(max));
        self.last_position = self.last_position.max(played);
        self.last_position
    }

    fn clear_timing_anchor(&mut self) {}

    fn switch_queue(&mut self, consumer: PcmConsumer, pipeline: PipelineId) {
        self.last_position = 0;
        let mut state = self.state();
        state.consumer = consumer;
        state.pipeline = pipeline;
        state.played_frames = 0;
        state.queue_switches += 1;
        state.next = None;
    }

    fn queue_next(&mut self, _after: PipelineId, consumer: PcmConsumer, pipeline: PipelineId) {
        self.state().next = Some((pipeline, consumer));
    }

    fn clear_next(&mut self) {
        self.state().next = None;
    }

    fn adopt_next(&mut self, pipeline: PipelineId) {
        self.last_position = 0;
        let mut state = self.state();
        if let Some((_, consumer)) = state.next.take() {
            state.consumer = consumer;
        }
        state.pipeline = pipeline;
        state.played_frames = 0;
        state.adoptions += 1;
    }
}
