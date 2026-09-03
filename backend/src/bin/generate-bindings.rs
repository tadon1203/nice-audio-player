use nice_audio_player_backend::protocol::{
    event::BackendEvent, request::BackendRequest, response::BackendResponse,
};
use specta::Types;
use std::path::{Path, PathBuf};

fn generate(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let types = Types::default()
        .register::<BackendRequest>()
        .register::<BackendResponse>()
        .register::<BackendEvent>();
    let output =
        specta_typescript::Typescript::default().export(&types, specta_serde::PhasesFormat)?;
    std::fs::write(path, output)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/api/generated/protocol.ts");
    if std::env::args().any(|argument| argument == "--check") {
        let temporary = std::env::temp_dir().join("nice-audio-player-protocol.ts");
        generate(&temporary)?;
        let expected = std::fs::read(&output)?;
        let actual = std::fs::read(&temporary)?;
        std::fs::remove_file(temporary)?;
        if expected != actual {
            return Err(
                "generated protocol bindings are out of date; run pnpm generate:bindings".into(),
            );
        }
    } else {
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent)?;
        }
        generate(&output)?;
    }
    Ok(())
}
