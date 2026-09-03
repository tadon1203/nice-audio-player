fn main() {
    if let Err(error) = nice_audio_player_backend::app::run() {
        eprintln!("backend stopped: {error}");
        std::process::exit(1);
    }
}
