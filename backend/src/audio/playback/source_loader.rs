//! Loads a track's compressed source off the worker thread and reports it as an event.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::thread::{self, JoinHandle};

use log::error;

use super::input::{Inbox, SourceLoadId, WorkerEvent};
use crate::audio::cancellation::Cancellation;
use crate::audio::compressed_source::{prepare_compressed_source, CompressedSourceError};
use crate::media::validation::ValidatedAudioFile;

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
                let result = catch_unwind(AssertUnwindSafe(|| {
                    prepare_compressed_source(&file, &worker_cancellation)
                }))
                .unwrap_or_else(|_| {
                    error!("playback.source_loader_panicked");
                    Err(CompressedSourceError::ReadFailed)
                });
                inbox.event(WorkerEvent::SourceLoaded { id, result });
            })
            .map_err(|_| ())?;
        Ok(Self {
            id,
            cancellation,
            join_handle,
        })
    }

    /// Waits for a load that has already reported.
    pub(crate) fn join(self) {
        let _ = self.join_handle.join();
    }

    /// Abandons the load without waiting for it: a stalled network path must not block the
    /// worker. The thread stops on its own, and its result is ignored by id.
    pub(crate) fn cancel(self) {
        self.cancellation.cancel();
    }
}
