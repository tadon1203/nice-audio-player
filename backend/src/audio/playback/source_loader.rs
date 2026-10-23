//! Loads a track's compressed source off the worker thread and reports it as an event.

use std::thread::{self, JoinHandle};

use super::input::{Inbox, SourceLoadId, WorkerEvent};
use crate::audio::compressed_source::{CompressedSourceError, prepare_compressed_source};
use crate::errors::contain;
use crate::media::validation::ValidatedAudioFile;
use crate::threads::Cancellation;

pub(crate) struct SourceLoad {
    id: SourceLoadId,
    cancellation: Cancellation,
    join_handle: JoinHandle<()>,
}

impl SourceLoad {
    pub(crate) fn id(&self) -> SourceLoadId {
        self.id
    }

    /// Starts loading `file`; the result arrives as `WorkerEvent::SourceLoaded` for `id`.
    pub(crate) fn spawn(
        file: ValidatedAudioFile,
        id: SourceLoadId,
        inbox: Inbox,
    ) -> Result<Self, ()> {
        let cancellation = Cancellation::default();
        let worker_cancellation = cancellation.clone();
        let join_handle = thread::Builder::new()
            .name("audio-source-load".into())
            .spawn(move || {
                let result = contain("playback.source_loader", || {
                    prepare_compressed_source(&file, &worker_cancellation)
                })
                .unwrap_or(Err(CompressedSourceError::OpenFailed));
                inbox.event(WorkerEvent::SourceLoaded { id, result });
            })
            .inspect_err(|cause| log::warn!("playback.source_loader.thread_failed cause={cause}"))
            .map_err(|_| ())?;
        Ok(Self {
            id,
            cancellation,
            join_handle,
        })
    }

    /// Waits for a load that has already reported.
    pub(crate) fn join(self) {
        // A panic payload has no `Display`, so the join result is checked with `is_err`.
        if self.join_handle.join().is_err() {
            log::debug!("playback.source_loader.join_panicked");
        }
    }

    /// Abandons the load without waiting for it: a stalled network path must not block the
    /// worker. The thread stops on its own, and its result is ignored by id.
    pub(crate) fn cancel(self) {
        self.cancellation.cancel();
    }
}
