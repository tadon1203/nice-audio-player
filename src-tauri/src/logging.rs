//! The log plugin: a colored console and a plain log file.

use std::io::IsTerminal;

use tauri::{Runtime, plugin::TauriPlugin};
use tauri_plugin_log::{
    RotationStrategy, Target, TargetKind,
    fern::colors::{Color, ColoredLevelConfig},
};

/// Builds the log plugin. The colors are on the console only: the log file is read by tools and
/// by people after the fact, and escape codes would make it hard to read.
pub(crate) fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let console = Target::new(TargetKind::Stdout);
    // A pipe or a redirect is not a terminal, and `NO_COLOR` is the user's request for no color.
    let console = if std::io::stdout().is_terminal() && std::env::var_os("NO_COLOR").is_none() {
        let colors = ColoredLevelConfig::new()
            .error(Color::Red)
            .warn(Color::Yellow)
            .info(Color::Green)
            .debug(Color::Blue)
            .trace(Color::BrightBlack);
        console.format(move |out, message, record| {
            out.finish(format_args!(
                "[{}][\x1b[90m{}\x1b[0m] {}",
                colors.color(record.level()),
                record.target(),
                message,
            ));
        })
    } else {
        console
    };

    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(console)
        .target(Target::new(TargetKind::LogDir { file_name: None }))
        // The default keeps one 40 KB file: minutes of history. A failure is investigated after
        // the fact, so keep a few megabytes.
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .build()
}
