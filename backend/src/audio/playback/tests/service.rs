use super::*;
use crate::sync;

#[test]
fn shutdown_joins_the_worker_thread() {
    let service = start_service();
    service.shutdown();

    assert!(sync::lock(&service.worker).is_none());
}

#[test]
fn commands_after_shutdown_report_an_unavailable_worker() {
    let service = start_service();
    let handle = service.handle();
    service.shutdown();

    assert_eq!(handle.pause(), Err(PlaybackServiceError::WorkerUnavailable));
}
