//! Keeps one bad file from taking the app down: per-file work runs through [`contain`], so a
//! panic in a parser or decoder becomes a failure of that file alone.

use std::panic::{catch_unwind, AssertUnwindSafe};

/// Runs `work`; `None` when it panicked. `what` names the work in the log.
pub(crate) fn contain<T>(what: &str, work: impl FnOnce() -> T) -> Option<T> {
    match catch_unwind(AssertUnwindSafe(work)) {
        Ok(value) => Some(value),
        Err(_) => {
            log::error!("containment.panicked what={what}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::contain;

    #[test]
    fn a_panic_becomes_none() {
        assert_eq!(contain("test", || 7), Some(7));
        assert_eq!(contain("test", || -> u8 { panic!("bad file") }), None);
    }
}
