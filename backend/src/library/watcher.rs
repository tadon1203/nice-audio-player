use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;

pub(crate) fn attach(
    root: &Path,
    on_event: impl Fn() + Send + 'static,
) -> notify::Result<RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let Ok(event) = result else {
            on_event();
            return;
        };
        if !matches!(event.kind, EventKind::Access(_)) {
            on_event();
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(watcher)
}
