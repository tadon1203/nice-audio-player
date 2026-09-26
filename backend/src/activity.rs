use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{
        mpsc::{Receiver, SyncSender},
        Arc, Mutex,
    },
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
    changed: SyncSender<()>,
}

pub struct ApplicationActivityService {
    handle: ApplicationActivityHandle,
    receiver: Mutex<Option<Receiver<()>>>,
}

impl ApplicationActivityService {
    pub fn new() -> Self {
        let (changed, receiver) = std::sync::mpsc::sync_channel(1);
        Self {
            handle: ApplicationActivityHandle {
                entries: Arc::new(Mutex::new(BTreeMap::new())),
                changed,
            },
            receiver: Mutex::new(Some(receiver)),
        }
    }

    pub fn handle(&self) -> ApplicationActivityHandle {
        self.handle.clone()
    }

    pub fn take_changed_receiver(&self) -> Option<Receiver<()>> {
        self.receiver.lock().expect("activity receiver lock").take()
    }
}

impl Default for ApplicationActivityService {
    fn default() -> Self {
        Self::new()
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
            let _ = self.changed.try_send(());
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
            let _ = self.changed.try_send(());
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
        let service = ApplicationActivityService::new();
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
    fn identical_updates_are_coalesced() {
        let service = ApplicationActivityService::new();
        let handle = service.handle();
        let receiver = service.take_changed_receiver().expect("activity receiver");
        handle.set(activity("library-sync", ApplicationActivityState::Running));
        receiver.try_recv().expect("first activity change");
        handle.set(activity("library-sync", ApplicationActivityState::Running));
        assert!(receiver.try_recv().is_err());
    }
}
