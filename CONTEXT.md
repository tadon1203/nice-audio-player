# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets. Do not invent synonyms. Behavior is in [requirements.md](./docs/requirements.md). Reasons are in [docs/adr/](./docs/adr/).

## Structure

- **Backend**: the part of the app that owns the domain and the persistent state. It knows nothing about Tauri.
- **Host**: the part of the app that connects the Backend to the window and the operating system. It registers commands, forwards events, and serves artwork. It holds no domain rules.

## Library

- **Library**: the indexed set of tracks from the registered music folders.
- **Album Artist**: the artist an album is filed under.
- **Scan**: discovering, inspecting, and indexing files in batches.
- **Missing**: a track whose file is gone. A new file with the same content is that track again (relinked, same `track_id`).
- **Compilation**: tracks that share a directory and an album title, but not an artist. They are one album, filed under Various Artists.
- **Edition**: the printing of an album. It is the folder that holds the tracks. A disc folder counts as the folder above it. An album is its Album Artist, title and Edition.
- **Scroll index**: a list's names grouped by first character, counted in the list's own order. It backs the big letter shown while scrolling and the jump to a letter.

## Playback

- **Playback context**: where the user picked a track from (an album, or the Tracks list as filtered and sorted). It becomes the queue.
- **Playback**: one queue item being played, identified by its playback id. A seek or an output device switch keeps the same Playback.
- **Playback id**: identifies one loaded Playback. Every track that loads gets a new one.
- **Queue**: the items to play, held as track ids. Its **arranged order** is the one source of truth. Shuffle is a separate **play order** over it.
- **PlaybackItem**: a queue entry's id plus the one track-metadata type (`PlayableTrack`), which carries the library `track_id`.
- **Output stream**: the device stream that playback opens. It can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them.
- **Pipeline**: a decode thread and the sample queue it fills for the output stream.
- **Position event**: the playing position (playback id, position, seek revision), sent by the backend while a track plays.
- **Playback clock**: the single source of the playing position. See [ADR 0004](./docs/adr/0004-time-is-drawn-by-the-compositor-not-a-frame-loop.md).
- **Waveform**: the RMS and peak levels of the loaded Playback, keyed by its playback id.
- **Spectrum**: the level of the audio being played, in 30 one-third-octave bands, with left and right summed.
- **Level meter**: the left and right channel levels of the audio being played. Each channel has a peak (with a held peak) and an RMS.
- **Meter frame**: one measurement of the Spectrum and the Level meter, taken at one moment of the output.
- **Bar**: one drawn level of the Spectrum (a band) or the Level meter (a channel's RMS).
- **Cap**: the thin line above a Bar that marks its held peak.
- **Hold**: how long a Cap stays in place before it falls, and how long "Clip" stays shown.
- **Now Playing**: the dock extended upward, as a layer over the current location. It is not a page.
- **Dock**: the persistent playback bar at the bottom of the workspace.

## UI (see [DESIGN.md](./DESIGN.md))

- **Sleeve**: the music as an object, shown as its artwork.
- **Light**: the artwork, blurred, that lights a surface.
- **Acrylic**: the surface of floating UI. It is used instead of Light.
- **Strip**: time drawn horizontally.
- **Gutter**: position and order on the left, in tabular figures. It is also the button of its row.
- **Path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length shows whether the app altered the audio.
- **Calm motion**: a setting that stops motion that starts on its own.
- **Progress motion**: motion proportional to time or to work done. It runs at constant speed.
