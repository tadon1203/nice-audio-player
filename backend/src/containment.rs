//! Keeps one bad file from taking the app down: per-file work runs through [`contain`], so a
//! panic in a parser or decoder becomes a failure of that file alone.

use std::any::Any;
use std::panic::{AssertUnwindSafe, catch_unwind};

/// Runs `work`; `None` when it panicked. `what` names the work in the log, and the log
/// also carries the panic message.
pub(crate) fn contain<T>(what: &str, work: impl FnOnce() -> T) -> Option<T> {
    match catch_unwind(AssertUnwindSafe(work)) {
        Ok(value) => Some(value),
        Err(payload) => {
            log::error!(
                "containment.panicked what={what} message={}",
                panic_message(payload.as_ref())
            );
            None
        }
    }
}

/// Reads the message of a panic payload. A panic with a format string carries a `String`,
/// and a panic with a literal carries a `&str`.
fn panic_message(payload: &(dyn Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("non-string panic payload")
}

#[cfg(test)]
mod tests {
    use super::{contain, panic_message};
    use std::panic::catch_unwind;

    #[test]
    fn a_panic_becomes_none() {
        assert_eq!(contain("test", || 7), Some(7));
        assert_eq!(contain("test", || -> u8 { panic!("bad file") }), None);
    }

    #[test]
    fn the_panic_message_is_read_from_both_payload_types() {
        let literal = catch_unwind(|| panic!("bad file")).unwrap_err();
        assert_eq!(panic_message(literal.as_ref()), "bad file");

        let formatted = catch_unwind(|| panic!("bad {}", "file")).unwrap_err();
        assert_eq!(panic_message(formatted.as_ref()), "bad file");

        let other = catch_unwind(|| std::panic::panic_any(7u8)).unwrap_err();
        assert_eq!(panic_message(other.as_ref()), "non-string panic payload");
    }
}
