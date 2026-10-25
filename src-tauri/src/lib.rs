use std::sync::Arc;

use backend::app::{BackendApp, CpalOutput};
use backend::messages::Notifier;
use session::Subscriber;
use tauri::Manager;

mod artwork;
mod bindings;
mod commands;
// `tauri_plugin_wdio` installs its own logger in the E2E build.
#[cfg(not(feature = "wdio"))]
mod logging;
mod os;
mod session;

pub use bindings::render_typescript as render_typescript_bindings;

#[derive(Clone)]
pub struct AppState {
    pub backend: Arc<BackendApp>,
    pub subscriber: Arc<Subscriber>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState").finish_non_exhaustive()
    }
}

pub fn run() {
    let builder = tauri::Builder::default();
    // First, so a second launch exits before it opens anything. Not in the E2E build, which must
    // not collide with a running app.
    #[cfg(not(feature = "wdio"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(cause) = window.unminimize() {
                log::debug!("host.window.unminimize_failed cause={cause}");
            }
            if let Err(cause) = window.show() {
                log::debug!("host.window.show_failed cause={cause}");
            }
            if let Err(cause) = window.set_focus() {
                log::debug!("host.window.focus_failed cause={cause}");
            }
        }
    }));
    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    // `tauri_plugin_wdio` installs its own logger, and a second one fails the build of the app.
    #[cfg(not(feature = "wdio"))]
    let builder = builder.plugin(logging::plugin());

    let app = builder
        .register_asynchronous_uri_scheme_protocol("nice-artwork", |context, request, responder| {
            artwork::serve_artwork(context.app_handle(), &request, responder);
        })
        // A reloaded page has lost its channel and cannot stop the frames; stop them here so
        // nothing keeps sending to nobody.
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                webview.state::<AppState>().backend.meter().stop();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // The app-level E2E suite (`tests-app/`) points the app at a throwaway directory.
            let data_dir = match std::env::var_os("NICE_AUDIO_PLAYER_DATA_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
            app.manage(artwork::ArtworkDir(data_dir.clone()));
            let (notifier, notifications) = Notifier::channel();
            let backend = BackendApp::initialize(data_dir, notifier, Box::new(CpalOutput))
                .inspect_err(|cause| log::warn!("host.backend.startup_failed cause={cause}"))
                .map_err(|_| std::io::Error::other("backend startup failed"))?;
            let backend = Arc::new(backend);
            let subscriber = Arc::new(Subscriber::default());
            app.manage(AppState {
                backend: Arc::clone(&backend),
                subscriber: Arc::clone(&subscriber),
            });
            session::start_dispatcher(backend, subscriber, notifications);
            Ok(())
        })
        .invoke_handler(bindings::builder().invoke_handler())
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            handle.state::<AppState>().backend.shutdown();
        }
    });
}
