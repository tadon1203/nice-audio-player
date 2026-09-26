use std::path::PathBuf;

use tauri::Manager;

fn artwork_path(uri_path: &str) -> Option<(PathBuf, &'static str)> {
    let relative_path = uri_path.strip_prefix('/')?;
    let mut components = relative_path.split('/');
    if components.next()? != "artwork" {
        return None;
    }
    let prefix = components.next()?;
    let file_name = components.next()?;
    if components.next().is_some()
        || prefix.len() != 2
        || !prefix
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return None;
    }

    let (hash, mime_type) = if let Some(hash) = file_name.strip_suffix(".jpg") {
        (hash, "image/jpeg")
    } else {
        let hash = file_name.strip_suffix(".png")?;
        (hash, "image/png")
    };
    if hash.len() != 64
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        || !hash.starts_with(prefix)
    {
        return None;
    }

    Some((
        PathBuf::from("artwork").join(prefix).join(file_name),
        mime_type,
    ))
}

fn artwork_response(
    status: tauri::http::StatusCode,
    mime_type: &'static str,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, mime_type)
        .header(tauri::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .expect("valid artwork response")
}

pub fn serve_artwork(
    app_handle: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET || request.uri().query().is_some() {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    }
    let Some((relative_path, mime_type)) = artwork_path(request.uri().path()) else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    let Ok(data_dir) = app_handle.path().app_data_dir() else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    let Ok(body) = std::fs::read(data_dir.join(relative_path)) else {
        return artwork_response(tauri::http::StatusCode::NOT_FOUND, "text/plain", Vec::new());
    };
    artwork_response(tauri::http::StatusCode::OK, mime_type, body)
}

#[cfg(test)]
mod tests {
    use super::artwork_path;

    #[test]
    fn artwork_paths_accept_canonical_content_addresses() {
        let hash = "ab".repeat(32);
        let direct = format!("/artwork/ab/{hash}.jpg");

        assert_eq!(artwork_path(&direct).unwrap().1, "image/jpeg");
        assert!(artwork_path(&format!("/asset/artwork/ab/{hash}.jpg")).is_none());
    }

    #[test]
    fn artwork_paths_reject_noncanonical_or_traversal_paths() {
        let hash = "ab".repeat(32);

        assert!(artwork_path("/artwork/../secret.png").is_none());
        assert!(artwork_path(&format!("/artwork/aa/{hash}.jpg")).is_none());
        assert!(artwork_path(&format!("/artwork/ab/{}.jpg", "AB".repeat(32))).is_none());
        assert!(artwork_path(&format!("/artwork/ab/{hash}.jpg/extra")).is_none());
    }
}
