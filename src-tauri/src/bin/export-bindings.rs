//! Writes `src/lib/native/bindings.ts`. `committed_bindings_are_current` (a test) checks it.

use std::{fs, path::Path, process::ExitCode};

fn main() -> ExitCode {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/native/bindings.ts");
    let generated = match nice_audio_player_lib::render_typescript_bindings() {
        Ok(generated) => generated.replace("\r\n", "\n"),
        Err(error) => {
            eprintln!("failed to render TypeScript bindings: {error}");
            return ExitCode::FAILURE;
        }
    };

    if let Err(error) = fs::write(&path, generated) {
        eprintln!("failed to write {}: {error}", path.display());
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
