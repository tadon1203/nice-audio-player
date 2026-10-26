use std::sync::{Arc, mpsc};

use anyhow::Context;
use backend::app::{BackendApp, CpalOutput};
use delivery::Delivery;
use tauri::{Manager, Runtime};

mod artwork;
mod bindings;
mod commands;
mod delivery;
#[cfg(not(feature = "wdio"))]
mod logging;
mod os;

pub use bindings::render_typescript as render_typescript_bindings;

#[derive(Clone)]
pub struct AppState {
    pub backend: Arc<BackendApp>,
    pub delivery: Arc<Delivery>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState").finish_non_exhaustive()
    }
}

/// Adds the plugins that differ between the app build and the E2E build.
///
/// The app build installs a single-instance check first, so a second launch exits before it opens
/// anything. The E2E build must not collide with a running app.
/// `tauri_plugin_wdio` installs its own logger, and a second one fails the build of the app.
#[cfg(not(feature = "wdio"))]
fn configure_plugins<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main")
                && let Err(cause) = focus(&window)
            {
                log::debug!("host.window.focus_failed cause={cause:#}");
            }
        }))
        .plugin(logging::plugin())
}

/// Brings the window back from the taskbar and to the front.
#[cfg(not(feature = "wdio"))]
fn focus<R: Runtime>(window: &tauri::WebviewWindow<R>) -> anyhow::Result<()> {
    window
        .unminimize()
        .context("could not restore the window")?;
    window.show().context("could not show the window")?;
    window.set_focus().context("could not focus the window")
}

#[cfg(feature = "wdio")]
fn configure_plugins<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init())
}

pub fn run() -> anyhow::Result<()> {
    let app = configure_plugins(tauri::Builder::default())
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
            let (sender, messages) = mpsc::channel();
            let backend = BackendApp::new(data_dir, sender, Box::new(CpalOutput));
            let backend = Arc::new(backend);
            let delivery = Arc::new(Delivery::default());
            app.manage(AppState {
                backend: Arc::clone(&backend),
                delivery: Arc::clone(&delivery),
            });
            delivery::start_dispatcher(delivery, messages)?;
            Ok(())
        })
        .invoke_handler(bindings::builder().invoke_handler())
        .build(tauri::generate_context!())
        .context("could not build the Tauri application")?;

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            handle.state::<AppState>().backend.shutdown();
        }
    });
    Ok(())
}
