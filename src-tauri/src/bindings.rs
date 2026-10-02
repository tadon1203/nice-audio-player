use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use crate::{commands, events::AppEvent};

/// The single registry of IPC commands and shared types. Rust is authoritative;
/// `bindings.ts` is generated from it and must not be edited by hand.
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::playback::get_playback_state,
            commands::playback::get_playback_queue_window,
            commands::playback::get_playback_queue,
            commands::playback::start_playback,
            commands::playback::pause_playback,
            commands::playback::resume_playback,
            commands::playback::previous_playback,
            commands::playback::next_playback,
            commands::playback::seek_playback,
            commands::playback::set_playback_volume,
            commands::playback::set_playback_muted,
            commands::playback::list_audio_output_devices,
            commands::playback::set_playback_repeat_mode,
            commands::playback::set_playback_shuffle,
            commands::playback::set_audio_output_selection,
            commands::playback::remove_queue_item,
            commands::playback::move_queue_item,
            commands::playback::play_queue_item,
            commands::playback::enqueue_track,
            commands::playback::clear_queue,
            commands::playback::get_playback_waveform,
            commands::library::get_library_status,
            commands::library::reset_library_and_rescan,
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
            commands::library::get_library_track,
            commands::library::get_library_track_properties,
            commands::library::reveal_library_track,
            commands::library::get_artwork_accent,
            commands::lyrics::get_track_lyrics,
            commands::settings::get_settings,
            commands::settings::update_settings,
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
