//! A source load: opens the next file on its own thread and reports it to the worker's inbox.

use std::thread::{self, JoinHandle};

use super::input::{Inbox, SourceLoadId, WorkerEvent};
use crate::audio::decode::{CompressedAudioSource, DecodeError};
use crate::errors::contain;
use crate::library::media::ValidatedAudioFile;
use crate::threads::Cancellation;

pub(super) struct SourceLoad {
    id: SourceLoadId,
    cancellation: Cancellation,
    join_handle: JoinHandle<()>,
}

impl SourceLoad {
    pub(super) fn id(&self) -> SourceLoadId {
        self.id
    }

    /// Starts loading `file`; the result arrives as `WorkerEvent::SourceLoaded` for `id`.
    pub(super) fn spawn(
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
                    CompressedAudioSource::open(&file, &worker_cancellation)
                })
                .unwrap_or(Err(DecodeError::FileOpenFailed));
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
    pub(super) fn join(self) {
        // A panic payload has no `Display`, so the join result is checked with `is_err`.
        if self.join_handle.join().is_err() {
            log::debug!("playback.source_loader.join_panicked");
        }
    }

    /// Abandons the load without waiting for it: a stalled network path must not block the
    /// worker. The thread stops on its own, and its result is ignored by id.
    pub(super) fn cancel(self) {
        self.cancellation.cancel();
    }
}
