#![allow(dead_code)]
use super::models::LibraryScanState;
use std::collections::HashSet;

/// Internal outcome information used by the runtime. Public scan state remains in models.
#[derive(Debug, Clone)]
pub(crate) struct ScanReport {
    pub outcome: LibraryScanState,
    pub successful_root_ids: HashSet<i64>,
    pub failed_root_ids: HashSet<i64>,
    pub unavailable_root_ids: HashSet<i64>,
}
