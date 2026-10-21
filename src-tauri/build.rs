use std::env;

#[expect(
    clippy::print_stdout,
    reason = "cargo reads build script directives from stdout"
)]
fn main() {
    tauri_build::build();

    // tauri-build embeds the Common Controls v6 manifest in bins only. At opt-level 0 the unit-test
    // binary keeps the v6-only comctl32 imports (dead code is not removed), so it needs the same
    // dependency on the linker line.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
}
