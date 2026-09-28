use crate::events::{BackendEvent, Notifier, SharedEventSink};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApplicationActivityKind {
    LibrarySync,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApplicationActivityState {
    Running,
    AttentionRequired,
}

#[derive(Debug, Clone, Serialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationActivity {
    pub id: String,
    pub kind: ApplicationActivityKind,
    pub state: ApplicationActivityState,
}

#[derive(Clone)]
pub struct ApplicationActivityHandle {
    entries: Arc<Mutex<BTreeMap<String, ApplicationActivity>>>,
    changed: Notifier,
}

pub struct ApplicationActivityService {
    handle: ApplicationActivityHandle,
}

impl ApplicationActivityService {
    pub fn new(events: SharedEventSink) -> Self {
        Self {
            handle: ApplicationActivityHandle {
                entries: Arc::new(Mutex::new(BTreeMap::new())),
                changed: Notifier::new(events, BackendEvent::ActivitiesChanged),
            },
        }
    }

    pub fn handle(&self) -> ApplicationActivityHandle {
        self.handle.clone()
    }
}

impl ApplicationActivityHandle {
    pub fn snapshot(&self) -> Vec<ApplicationActivity> {
        self.entries
            .lock()
            .expect("activity entries lock")
            .values()
            .cloned()
            .collect()
    }

    pub fn set(&self, activity: ApplicationActivity) {
        let changed = {
            let mut entries = self.entries.lock().expect("activity entries lock");
            if entries.get(&activity.id) == Some(&activity) {
                false
            } else {
                entries.insert(activity.id.clone(), activity);
                true
            }
        };
        if changed {
            self.changed.notify();
        }
    }

    pub fn clear(&self, id: &str) {
        if self
            .entries
            .lock()
            .expect("activity entries lock")
            .remove(id)
            .is_some()
        {
            self.changed.notify();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity(id: &str, state: ApplicationActivityState) -> ApplicationActivity {
        ApplicationActivity {
            id: id.into(),
            kind: ApplicationActivityKind::LibrarySync,
            state,
        }
    }

    #[test]
    fn updates_and_clears_only_the_selected_id() {
        let service = ApplicationActivityService::new(crate::events::null_event_sink());
        let handle = service.handle();
        handle.set(activity("library-sync", ApplicationActivityState::Running));
        handle.set(activity(
            "other",
            ApplicationActivityState::AttentionRequired,
        ));
        handle.clear("library-sync");
        assert_eq!(
            handle.snapshot(),
            vec![activity(
                "other",
                ApplicationActivityState::AttentionRequired
            )]
        );
    }

    #[test]
    fn identical_updates_are_not_announced_twice() {
        let (recorder, sink) = crate::events::testing::RecordingEventSink::shared();
        let service = ApplicationActivityService::new(sink);
        let handle = service.handle();
        handle.set(activity("library-sync", ApplicationActivityState::Running));
        handle.set(activity("library-sync", ApplicationActivityState::Running));
        assert_eq!(recorder.events(), vec![BackendEvent::ActivitiesChanged]);
    }
}
