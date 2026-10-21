use std::path::PathBuf;

use backend::{
    app::BackendApp,
    dto::{ArtworkCache, ServedArtwork},
};
use tauri::{
    Manager,
    http::{Method, Response, StatusCode, header},
};

/// The data directory the artwork store lives in, decided once at startup.
pub(crate) struct ArtworkDir(pub PathBuf);

fn response(
    status: StatusCode,
    mime_type: &'static str,
    cache_control: &'static str,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime_type)
        .header(header::CACHE_CONTROL, cache_control)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .expect("valid artwork response")
}

fn not_found() -> Response<Vec<u8>> {
    response(StatusCode::NOT_FOUND, "text/plain", "no-cache", Vec::new())
}

fn found(served: ServedArtwork) -> Response<Vec<u8>> {
    let cache_control = match served.cache {
        ArtworkCache::Immutable => "public, max-age=31536000, immutable",
        ArtworkCache::Temporary => "no-cache",
    };
    response(
        StatusCode::OK,
        served.mime_type,
        cache_control,
        served.bytes,
    )
}

/// Reads on the async runtime's blocking pool, never on the thread that dispatched the request.
pub(crate) fn serve_artwork(
    app_handle: &tauri::AppHandle,
    request: &tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let data_dir = app_handle
        .try_state::<ArtworkDir>()
        .map(|dir| dir.0.clone());
    let relative = (request.method() == Method::GET && request.uri().query().is_none())
        .then(|| request.uri().path().strip_prefix('/').map(str::to_owned))
        .flatten();
    let (Some(data_dir), Some(relative)) = (data_dir, relative) else {
        responder.respond(not_found());
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        responder
            .respond(BackendApp::serve_artwork(&data_dir, &relative).map_or_else(not_found, found));
    });
}
