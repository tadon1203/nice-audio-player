//! Writes `src/lib/native/bindings.ts`. `committed_bindings_are_current` (a test) checks it.

use std::{fs, path::Path};

use anyhow::Context;

/// A failure is returned, and the standard `Termination` prints it and sets the exit code.
fn main() -> anyhow::Result<()> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/native/bindings.ts");
    let generated = nice_audio_player_lib::render_typescript_bindings()
        .context("could not render the TypeScript bindings")?;
    fs::write(&path, generated).with_context(|| format!("could not write {}", path.display()))
}
