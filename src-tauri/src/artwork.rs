use std::path::{Path, PathBuf};

use tauri::Manager;

/// The data directory the artwork store lives in, decided once at startup.
pub struct ArtworkDir(pub PathBuf);

#[derive(Debug, PartialEq, Eq)]
enum Request {
    /// The original image as stored.
    Full {
        path: PathBuf,
        mime_type: &'static str,
    },
    /// The 512px thumbnail, with the original to fall back to until one exists.
    Thumb {
        path: PathBuf,
        originals: [(PathBuf, &'static str); 2],
    },
}

fn is_lower_hex(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn artwork_request(uri_path: &str) -> Option<Request> {
    let relative_path = uri_path.strip_prefix('/')?;
    let mut components = relative_path.split('/');
    if components.next()? != "artwork" {
        return None;
    }
    let prefix = components.next()?;
    let file_name = components.next()?;
    if components.next().is_some() || prefix.len() != 2 || !is_lower_hex(prefix) {
        return None;
    }
    let location = |name: String| PathBuf::from("artwork").join(prefix).join(name);
    let canonical = |hash: &str| hash.len() == 64 && is_lower_hex(hash) && hash.starts_with(prefix);

    if let Some(hash) = file_name.strip_suffix(".thumb.jpg") {
        return canonical(hash).then(|| Request::Thumb {
            path: location(file_name.to_owned()),
            originals: [
                (location(format!("{hash}.jpg")), "image/jpeg"),
                (location(format!("{hash}.png")), "image/png"),
            ],
        });
    }
    let (hash, mime_type) = if let Some(hash) = file_name.strip_suffix(".jpg") {
        (hash, "image/jpeg")
    } else {
        (file_name.strip_suffix(".png")?, "image/png")
    };
    canonical(hash).then(|| Request::Full {
        path: location(file_name.to_owned()),
        mime_type,
    })
}

/// Files are content-addressed, so a stored one never changes. A thumbnail's fallback to the
/// original is temporary, and must not be remembered.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";
const TEMPORARY: &str = "no-cache";

fn artwork_response(
    status: tauri::http::StatusCode,
    mime_type: &'static str,
    cache_control: &'static str,
    body: Vec<u8>,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, mime_type)
        .header(tauri::http::header::CACHE_CONTROL, cache_control)
        .header(tauri::http::header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body)
        .expect("valid artwork response")
}

fn not_found() -> tauri::http::Response<Vec<u8>> {
    artwork_response(
        tauri::http::StatusCode::NOT_FOUND,
        "text/plain",
        TEMPORARY,
        Vec::new(),
    )
}

fn read_artwork(data_dir: &Path, request: Request) -> tauri::http::Response<Vec<u8>> {
    let ok = |mime_type, cache_control, body| {
        artwork_response(tauri::http::StatusCode::OK, mime_type, cache_control, body)
    };
    match request {
        Request::Full { path, mime_type } => match std::fs::read(data_dir.join(path)) {
            Ok(body) => {
                log::debug!("artwork.served kind=full");
                ok(mime_type, IMMUTABLE, body)
            }
            Err(_) => not_found(),
        },
        Request::Thumb { path, originals } => {
            if let Ok(body) = std::fs::read(data_dir.join(path)) {
                log::debug!("artwork.served kind=thumb");
                return ok("image/jpeg", IMMUTABLE, body);
            }
            for (original, mime_type) in originals {
                if let Ok(body) = std::fs::read(data_dir.join(original)) {
                    log::debug!("artwork.served kind=thumb-fallback");
                    return ok(mime_type, TEMPORARY, body);
                }
            }
            not_found()
        }
    }
}

/// Reads on the async runtime's blocking pool, never on the thread that dispatched the request.
pub fn serve_artwork(
    app_handle: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let data_dir = app_handle
        .try_state::<ArtworkDir>()
        .map(|dir| dir.0.clone());
    let parsed = (request.method() == tauri::http::Method::GET && request.uri().query().is_none())
        .then(|| artwork_request(request.uri().path()))
        .flatten();
    let (Some(data_dir), Some(parsed)) = (data_dir, parsed) else {
        responder.respond(not_found());
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(read_artwork(&data_dir, parsed))
    });
}

#[cfg(test)]
mod tests {
    use super::{artwork_request, read_artwork, Request};
    use std::path::PathBuf;

    fn header<'a>(response: &'a tauri::http::Response<Vec<u8>>, name: &str) -> &'a str {
        response.headers()[name].to_str().unwrap()
    }

    #[test]
    fn stored_files_are_cacheable_for_good_and_a_fallback_is_not() {
        let dir = std::env::temp_dir().join(format!("nap-serve-{}", std::process::id()));
        let hash = "ab".repeat(32);
        std::fs::create_dir_all(dir.join("artwork/ab")).unwrap();
        std::fs::write(dir.join(format!("artwork/ab/{hash}.png")), b"original").unwrap();
        let thumb = |dir: &std::path::Path| {
            read_artwork(
                dir,
                artwork_request(&format!("/artwork/ab/{hash}.thumb.jpg")).unwrap(),
            )
        };

        let fallback = thumb(&dir);
        assert_eq!(fallback.body(), b"original");
        assert_eq!(header(&fallback, "content-type"), "image/png");
        assert_eq!(header(&fallback, "cache-control"), "no-cache");

        std::fs::write(dir.join(format!("artwork/ab/{hash}.thumb.jpg")), b"thumb").unwrap();
        let served = thumb(&dir);
        assert_eq!(served.body(), b"thumb");
        assert_eq!(header(&served, "content-type"), "image/jpeg");
        assert_eq!(
            header(&served, "cache-control"),
            "public, max-age=31536000, immutable"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn artwork_paths_accept_canonical_content_addresses() {
        let hash = "ab".repeat(32);
        let direct = format!("/artwork/ab/{hash}.jpg");

        assert_eq!(
            artwork_request(&direct),
            Some(Request::Full {
                path: PathBuf::from(format!("artwork/ab/{hash}.jpg")),
                mime_type: "image/jpeg"
            })
        );
        assert!(artwork_request(&format!("/asset/artwork/ab/{hash}.jpg")).is_none());
    }

    #[test]
    fn a_thumbnail_request_names_the_originals_it_falls_back_to() {
        let hash = "ab".repeat(32);
        let Some(Request::Thumb { path, originals }) =
            artwork_request(&format!("/artwork/ab/{hash}.thumb.jpg"))
        else {
            panic!("not a thumbnail request");
        };
        assert_eq!(path, PathBuf::from(format!("artwork/ab/{hash}.thumb.jpg")));
        assert_eq!(
            originals[0].0,
            PathBuf::from(format!("artwork/ab/{hash}.jpg"))
        );
        assert_eq!(
            originals[1].0,
            PathBuf::from(format!("artwork/ab/{hash}.png"))
        );
    }

    #[test]
    fn artwork_paths_reject_noncanonical_or_traversal_paths() {
        let hash = "ab".repeat(32);

        assert!(artwork_request("/artwork/../secret.png").is_none());
        assert!(artwork_request(&format!("/artwork/aa/{hash}.jpg")).is_none());
        assert!(artwork_request(&format!("/artwork/ab/{}.jpg", "AB".repeat(32))).is_none());
        assert!(artwork_request(&format!("/artwork/ab/{hash}.jpg/extra")).is_none());
        assert!(artwork_request(&format!("/artwork/ab/{hash}.thumb.png")).is_none());
        assert!(artwork_request(&format!("/artwork/ab/x{hash}.thumb.jpg")).is_none());
    }
}
