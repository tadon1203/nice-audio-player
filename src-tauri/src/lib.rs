use std::{path::PathBuf, sync::Arc};

use backend::app::BackendApp;
use tauri::Manager;

mod artwork;
mod commands;
mod errors;
mod events;

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
        .invoke_handler(tauri::generate_handler![
            commands::playback::get_playback_state,
            commands::playback::get_playback_queue,
            commands::playback::pause_playback,
            commands::playback::resume_playback,
            commands::playback::previous_playback,
            commands::playback::next_playback,
            commands::playback::seek_playback,
            commands::playback::set_playback_volume,
            commands::playback::set_playback_muted,
            commands::playback::list_audio_output_devices,
            commands::library::get_library_status,
            commands::library::get_library_scan_state,
            commands::library::list_library_roots,
            commands::library::register_library_root,
            commands::library::set_library_root_enabled,
            commands::library::remove_library_root,
            commands::library::start_library_scan,
            commands::library::cancel_library_scan,
            commands::library::list_library_tracks,
            commands::library::list_library_albums,
            commands::library::list_library_album_artists,
            commands::library::get_library_album_artist,
            commands::library::list_library_artist_albums,
            commands::library::get_library_album_details,
            commands::library::list_library_album_tracks,
            commands::library::get_library_track_for_path,
            commands::library::start_library_track,
            commands::library::start_library_album
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            handle.state::<AppState>().backend.shutdown();
        }
    });
}
