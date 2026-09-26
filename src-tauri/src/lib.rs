use std::{path::PathBuf, sync::Arc};

use backend::app::BackendApp;
use tauri::Manager;

mod artwork;
mod bindings;
mod commands;
mod errors;
mod events;

pub use bindings::render_typescript as render_typescript_bindings;

#[derive(Clone)]
pub struct AppState {
    pub backend: Arc<BackendApp>,
}

pub fn run() {
    let app = tauri::Builder::default()
        .register_uri_scheme_protocol("nice-artwork", |context, request| {
            artwork::serve_artwork(context.app_handle(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let data_dir = match std::env::var_os("NICE_AUDIO_PLAYER_TEST_DATA_DIR") {
                Some(path) => PathBuf::from(path),
                None => app.path().app_data_dir()?,
            };
            let backend = tauri::async_runtime::block_on(BackendApp::initialize(data_dir))
                .map_err(|_| std::io::Error::other("backend startup failed"))?;
            let backend = Arc::new(backend);
            app.manage(AppState {
                backend: Arc::clone(&backend),
            });
            events::forward_events(app.handle(), &backend);
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
