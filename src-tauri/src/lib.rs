use std::sync::Arc;

use backend::app::BackendApp;
use tauri::Manager;

mod artwork;
mod bindings;
mod commands;
mod events;

pub use bindings::render_typescript as render_typescript_bindings;

#[derive(Clone)]
pub struct AppState {
    pub backend: Arc<BackendApp>,
}

pub fn run() {
    let builder = tauri::Builder::default();
    // First, so a second launch exits before it opens anything. Not in the E2E build, which must
    // not collide with a running app.
    #[cfg(not(feature = "wdio"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    // `tauri_plugin_wdio` installs its own logger, and a second one fails the build of the app.
    #[cfg(not(feature = "wdio"))]
    let builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            // The default keeps one 40 KB file: minutes of history. A failure is investigated
            // after the fact, so keep a few megabytes.
            .max_file_size(1_000_000)
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
            .build(),
    );

    let app = builder
        .register_uri_scheme_protocol("nice-artwork", |context, request| {
            artwork::serve_artwork(context.app_handle(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // The app-level E2E suite (`tests-app/`) points the app at a throwaway directory.
            let data_dir = match std::env::var_os("NICE_AUDIO_PLAYER_DATA_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => app.path().app_data_dir()?,
            };
            let (sink, event_receiver) = events::event_channel();
            let backend = BackendApp::initialize(data_dir, sink)
                .map_err(|_| std::io::Error::other("backend startup failed"))?;
            let backend = Arc::new(backend);
            app.manage(AppState {
                backend: Arc::clone(&backend),
            });
            events::start_dispatcher(app.handle(), &backend, event_receiver);
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
