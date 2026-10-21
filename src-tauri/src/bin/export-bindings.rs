//! Writes `src/lib/native/bindings.ts`. `committed_bindings_are_current` (a test) checks it.

use std::{error::Error, fs, path::Path};

/// A failure is returned, and the standard `Termination` prints it and sets the exit code.
fn main() -> Result<(), Box<dyn Error>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/native/bindings.ts");
    let generated = nice_audio_player_lib::render_typescript_bindings()?.replace("\r\n", "\n");
    fs::write(&path, generated)?;
    Ok(())
}
