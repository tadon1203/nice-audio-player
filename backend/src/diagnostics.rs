/// Logs `context` and the cause at `warn`, then returns `code`.
pub fn logged<E: std::fmt::Display, C>(code: C, context: &'static str) -> impl FnOnce(E) -> C {
    move |cause| {
        log::warn!("{context} cause={cause}");
        code
    }
}

/// Logs `context` and the error at `debug` when `result` is `Err`; returns nothing.
pub fn log_failed<T, E: std::fmt::Display>(result: Result<T, E>, context: &'static str) {
    if let Err(cause) = result {
        log::debug!("{context} cause={cause}");
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, Once};

    use super::{log_failed, logged};

    static RECORDS: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static INSTALL: Once = Once::new();

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _metadata: &log::Metadata<'_>) -> bool {
            true
        }

        fn log(&self, record: &log::Record<'_>) {
            crate::sync::lock(&RECORDS).push(format!("{} {}", record.level(), record.args()));
        }

        fn flush(&self) {}
    }

    fn install() {
        INSTALL.call_once(|| {
            log::set_logger(&Capture).expect("the test logger is the only one installed");
            log::set_max_level(log::LevelFilter::Debug);
        });
    }

    fn has_line(line: &str) -> bool {
        crate::sync::lock(&RECORDS)
            .iter()
            .any(|record| record == line)
    }

    #[derive(Debug, PartialEq, Eq)]
    enum Code {
        Failed,
    }

    #[test]
    fn logged_returns_the_code_and_logs_the_context_with_the_cause() {
        install();

        let code = logged(Code::Failed, "diagnostics.test.reads")("disk gone");

        assert_eq!(code, Code::Failed);
        assert!(
            has_line("WARN diagnostics.test.reads cause=disk gone"),
            "the warn line must carry the context and the cause"
        );
    }

    #[test]
    fn log_failed_logs_an_error_at_debug() {
        install();

        log_failed(Err::<(), _>("disk gone"), "diagnostics.test.failed");

        assert!(
            has_line("DEBUG diagnostics.test.failed cause=disk gone"),
            "the debug line must carry the context and the cause"
        );
    }

    #[test]
    fn log_failed_is_silent_on_ok() {
        install();

        log_failed(Ok::<(), &str>(()), "diagnostics.test.succeeded");

        assert!(
            !crate::sync::lock(&RECORDS)
                .iter()
                .any(|record| record.contains("diagnostics.test.succeeded")),
            "an Ok result logs nothing"
        );
    }
}
