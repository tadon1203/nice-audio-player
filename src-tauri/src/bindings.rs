use backend::cleanup::remove_file_best_effort;
use backend::messages::BackendMessage;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

use crate::commands;

/// The single registry of IPC commands and shared types. Rust is authoritative;
/// `bindings.ts` is generated from it and must not be edited by hand.
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::playback::get_playback_queue_window,
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
            commands::playback::restore_previous_queue,
            commands::library::get_library_status,
            commands::library::reset_library_and_rescan,
            commands::library::list_library_roots,
            commands::library::register_library_root,
            commands::library::set_library_root_enabled,
            commands::library::remove_library_root,
            commands::library::delete_missing_library_tracks,
            commands::library::open_log_directory,
            commands::library::start_library_scan,
            commands::library::cancel_library_scan,
            commands::library::list_library_tracks,
            commands::library::list_library_albums,
            commands::library::list_library_album_artists,
            commands::library::list_library_track_index,
            commands::library::list_library_album_index,
            commands::library::list_library_album_artist_index,
            commands::library::get_library_artist,
            commands::library::list_library_artist_albums,
            commands::library::get_library_album,
            commands::library::list_library_album_tracks,
            commands::library::get_library_track_properties,
            commands::library::reveal_library_track,
            commands::library::get_artwork_accent,
            commands::lyrics::get_track_lyrics,
            commands::meter::subscribe_meter_frames,
            commands::meter::unsubscribe_meter_frames,
            commands::session::connect,
            commands::appearance::update_appearance,
        ])
        .typ::<BackendMessage>()
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
    remove_file_best_effort(&scratch);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn committed_bindings_are_current() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/native/bindings.ts");
        let generated = render_typescript()
            .expect("render TypeScript bindings")
            .replace("\r\n", "\n");
        let committed = std::fs::read_to_string(&path)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        assert!(
            committed == generated,
            "src/lib/native/bindings.ts is stale; run `pnpm bindings`"
        );
    }
}
