use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use crate::{commands, events::AppEvent};

/// The single registry of IPC commands and shared types. Rust is authoritative;
/// `bindings.ts` is generated from it and must not be edited by hand.
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
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
            commands::library::start_library_album,
        ])
        .typ::<AppEvent>()
        .error_handling(ErrorHandlingMode::Throw)
        .dangerously_cast_bigints_to_number()
        .disable_serde_phases()
        .semantic_types(
            specta_typescript::semantic::Configuration::default().enable_lossless_floats(),
        )
}

/// Renders the TypeScript contract for every registered command and shared type.
pub fn render_typescript() -> Result<String, specta_typescript::Error> {
    let scratch = std::env::temp_dir().join(format!(
        "nice-audio-player-bindings-{}.ts",
        std::process::id()
    ));
    let result = builder()
        .export(specta_typescript::Typescript::default(), &scratch)
        .and_then(|()| Ok(std::fs::read_to_string(&scratch)?));
    let _ = std::fs::remove_file(&scratch);
    result
}
