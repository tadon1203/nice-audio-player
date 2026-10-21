use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

/// A shared flag that tells background work (source loading, decoding) to stop.
#[derive(Clone, Default)]
pub(crate) struct Cancellation {
    cancelled: Arc<AtomicBool>,
}

impl Cancellation {
    pub(crate) fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}
