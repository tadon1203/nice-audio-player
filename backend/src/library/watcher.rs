use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};

/// Watches `root` and calls `on_event` with the paths of every change (empty when the watcher
/// failed and cannot say what changed).
pub(crate) fn attach(
    root: &Path,
    on_event: impl Fn(Vec<PathBuf>) + Send + 'static,
) -> notify::Result<RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        let Ok(event) = result else {
            on_event(Vec::new());
            return;
        };
        if !matches!(event.kind, EventKind::Access(_)) {
            on_event(event.paths);
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    Ok(watcher)
}
