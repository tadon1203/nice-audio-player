use backend::messages::BackendMessage;
use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};

use crate::commands;

/// The single registry of IPC commands and shared types. Rust is authoritative;
/// `bindings.ts` is generated from it and must not be edited by hand.
pub(crate) fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::playback::player_queue_window,
            commands::playback::player_play,
            commands::playback::player_pause,
            commands::playback::player_resume,
            commands::playback::player_previous,
            commands::playback::player_next,
            commands::playback::player_seek,
            commands::playback::player_set_volume,
            commands::playback::player_set_muted,
            commands::playback::player_list_output_devices,
            commands::playback::player_set_repeat_mode,
            commands::playback::player_set_shuffle,
            commands::playback::player_set_output_selection,
            commands::playback::player_remove_queue_item,
            commands::playback::player_move_queue_item,
            commands::playback::player_play_queue_item,
            commands::playback::player_enqueue_track,
            commands::playback::player_clear_queue,
            commands::playback::player_restore_previous_queue,
            commands::library::library_status,
            commands::library::library_reset,
            commands::library::library_list_directories,
            commands::library::library_add_directory,
            commands::library::library_set_directory_enabled,
            commands::library::library_remove_directory,
            commands::library::library_delete_missing_tracks,
            commands::library::app_open_log_directory,
            commands::library::library_start_scan,
            commands::library::library_cancel_scan,
            commands::library::library_list_tracks,
            commands::library::library_list_albums,
            commands::library::library_list_artists,
            commands::library::library_track_index,
            commands::library::library_album_index,
            commands::library::library_artist_index,
            commands::library::library_artist,
            commands::library::library_list_artist_albums,
            commands::library::library_album,
            commands::library::library_list_album_tracks,
            commands::library::library_track_properties,
            commands::library::library_reveal_track,
            commands::library::library_artwork_accent,
            commands::lyrics::lyrics_track,
            commands::meter::meter_start,
            commands::meter::meter_stop,
            commands::session::app_connect,
            commands::appearance::appearance_update,
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
    if let Err(cause) = std::fs::remove_file(&scratch)
        && cause.kind() != std::io::ErrorKind::NotFound
    {
        log::debug!("cleanup.remove_file_failed cause={cause}");
    }
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
