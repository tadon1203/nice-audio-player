/// Logs `context` and the cause at `warn`, then returns `code`.
pub fn logged<E: std::fmt::Display, C>(code: C, context: &'static str) -> impl FnOnce(E) -> C {
    move |cause| {
        log::warn!("{context} cause={cause}");
        code
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, Once};

    use super::logged;

    static RECORDS: Mutex<Vec<String>> = Mutex::new(Vec::new());
    static INSTALL: Once = Once::new();

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _metadata: &log::Metadata) -> bool {
            true
        }

        fn log(&self, record: &log::Record) {
            crate::sync::lock(&RECORDS).push(format!("{} {}", record.level(), record.args()));
        }

        fn flush(&self) {}
    }

    #[derive(Debug, PartialEq, Eq)]
    enum Code {
        Failed,
    }

    #[test]
    fn logged_returns_the_code_and_logs_the_context_with_the_cause() {
        INSTALL.call_once(|| {
            let _ = log::set_logger(&Capture);
            log::set_max_level(log::LevelFilter::Warn);
        });

        let code = logged(Code::Failed, "diagnostics.test.reads")("disk gone");

        assert_eq!(code, Code::Failed);
        assert!(
            crate::sync::lock(&RECORDS)
                .iter()
                .any(|line| line == "WARN diagnostics.test.reads cause=disk gone"),
            "the warn line must carry the context and the cause"
        );
    }
}
