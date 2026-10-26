use std::path::PathBuf;

use backend::{app::BackendApp, app::ServedArtwork};
use tauri::{
    Manager,
    http::{HeaderValue, Method, Response, StatusCode, header},
};

/// The data directory the artwork store lives in, decided once at startup.
pub(crate) struct ArtworkDir(pub PathBuf);

fn response(
    status: StatusCode,
    mime_type: &'static str,
    cache_control: &'static str,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    let mut response = Response::new(body);
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime_type));
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

fn not_found() -> Response<Vec<u8>> {
    response(StatusCode::NOT_FOUND, "text/plain", "no-cache", Vec::new())
}

fn found(served: ServedArtwork) -> Response<Vec<u8>> {
    response(
        StatusCode::OK,
        served.mime_type,
        "public, max-age=31536000, immutable",
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
