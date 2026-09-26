//! Writes or verifies `src/shared/ipc/bindings.ts`.
//!
//! `export-bindings` regenerates the file; `export-bindings --check` fails when it is stale.

use std::{fs, path::Path, process::ExitCode};

fn main() -> ExitCode {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/shared/ipc/bindings.ts");
    let generated = match nice_audio_player_lib::render_typescript_bindings() {
        Ok(generated) => generated.replace("\r\n", "\n"),
        Err(error) => {
            eprintln!("failed to render TypeScript bindings: {error}");
            return ExitCode::FAILURE;
        }
    };

    if std::env::args().any(|argument| argument == "--check") {
        let current = fs::read_to_string(&path)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        if current == generated {
            return ExitCode::SUCCESS;
        }
        eprintln!("src/shared/ipc/bindings.ts is stale; run `pnpm bindings`");
        return ExitCode::FAILURE;
    }

    if let Err(error) = fs::write(&path, generated) {
        eprintln!("failed to write {}: {error}", path.display());
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
