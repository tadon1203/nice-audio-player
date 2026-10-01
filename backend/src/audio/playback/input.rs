//! What the worker thread receives. Commands from callers and events from the decode, source-load
//! and output threads arrive through one channel, so the worker sleeps until something happens.

use std::fmt;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;

use cpal::StreamInstant;

use super::service::PlaybackCommand;
use crate::audio::compressed_source::{CompressedAudioSource, CompressedSourceError};
use crate::audio::output::{
    OutputEvent, OutputEvents, OutputStreamId, PipelineId, StreamFailureKind,
};

/// Identifies one playback session. Only `PlaybackIds::next` makes one.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct PlaybackId(u64);

impl fmt::Display for PlaybackId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Counts the playbacks. A playback is one queue item being played; a seek or an output device
/// switch keeps it.
#[derive(Debug, Default)]
pub(super) struct PlaybackIds(u64);

impl PlaybackIds {
    pub(super) fn next(&mut self) -> PlaybackId {
        self.0 = self.0.wrapping_add(1);
        PlaybackId(self.0)
    }
}

/// Identifies one source load, so a late result from a superseded load is told apart.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SourceLoadId(u64);

#[derive(Debug, Default)]
pub(super) struct SourceLoadIds(u64);

impl SourceLoadIds {
    pub(super) fn next(&mut self) -> SourceLoadId {
        self.0 = self.0.wrapping_add(1);
        SourceLoadId(self.0)
    }
}

pub(super) enum WorkerEvent {
    SourceLoaded {
        id: SourceLoadId,
        result: Result<CompressedAudioSource, CompressedSourceError>,
    },
    PrebufferReady {
        pipeline: PipelineId,
    },
    DecodeFailed {
        pipeline: PipelineId,
    },
    ConversionFailed {
        pipeline: PipelineId,
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

pub(super) enum WorkerInput {
    Command(PlaybackCommand),
    Event(WorkerEvent),
    Shutdown,
}

/// The sending side of the worker's channel.
#[derive(Clone)]
pub(super) struct Inbox(Sender<WorkerInput>);

impl Inbox {
    pub(super) fn channel() -> (Self, Receiver<WorkerInput>) {
        let (sender, receiver) = mpsc::channel();
        (Self(sender), receiver)
    }

    /// Returns whether the worker was still there to take it.
    pub(super) fn send(&self, input: WorkerInput) -> bool {
        self.0.send(input).is_ok()
    }

    pub(super) fn event(&self, event: WorkerEvent) {
        let _ = self.0.send(WorkerInput::Event(event));
    }

    /// An output stream's way to report to the worker.
    pub(super) fn output_events(&self, stream: OutputStreamId) -> OutputEvents {
        let inbox = self.clone();
        Arc::new(move |event| {
            inbox.event(match event {
                OutputEvent::FinalFrames { pipeline, end_time } => {
                    WorkerEvent::FinalFrames { pipeline, end_time }
                }
                OutputEvent::Failed(kind) => WorkerEvent::StreamFailed { stream, kind },
            });
        })
    }
}
