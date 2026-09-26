use std::path::Path;

pub(crate) fn effective_track_title(title: Option<&str>, file_name: &str) -> String {
    if let Some(value) = title.filter(|value| !value.trim().is_empty()) {
        return value.to_owned();
    }
    Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name)
        .to_owned()
}
