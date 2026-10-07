# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets. Do not invent synonyms. The rules for names are in [GLOSSARY-FORMAT.md](./.claude/skills/domain-modeling/GLOSSARY-FORMAT.md).

## Structure

- **Renderer**: the part of the app that draws the UI in the window. It composes views and caches Backend state. It holds no second source of truth.
- **Renderer domain**: the part of the Renderer that serves one Backend area (the Library, Playback, lyrics, settings, or the meters). It holds that area's cached state and logic. It never depends on another Renderer domain.
- **Renderer shell**: the part of the Renderer that holds app state spanning several Renderer domains, such as Now Playing, the queue panel, and workspace scroll. It sits between the product compositions and the Renderer domains.
- **Backend**: the part of the app that owns the domain and the persistent state. It knows nothing about Tauri.
- **Host**: the part of the app that connects the Backend to the window and the operating system. It registers commands, forwards events, and serves artwork. It holds no domain rules.
- **Backend state**: a value that the Backend owns and the Renderer mirrors, such as the Playback, the Queue, the Library scan, the Waveform, and the Appearance. It always reaches the Renderer whole, with its revision.
- **Backend occurrence**: a fact about one moment that the Backend reports once, such as a skipped track. The Renderer shows it and builds no state from it.
- **Measurement stream**: the frequent measurements that the Backend sends while audio plays: the playing position and the Meter frames. _Avoid_: Stream (an Output stream is a different thing).

## Library

- **Library**: the indexed set of tracks from the registered music folders.
- **Album Artist**: the artist an album is filed under.
- **Library scan**: discovering, inspecting, and indexing files in batches.
- **Missing track**: a track whose file is gone. A new file with the same content is that track again (relinked, same `track_id`).
- **Compilation**: tracks that share a directory and an album title, but not an artist. They are one album, filed under Various Artists.
- **Album**: the tracks that share an Album Artist, a title, and a folder. A disc folder counts as the folder above it. Two printings of one album in two folders are two albums.
- **Scroll index**: a list's names grouped by first character, counted in the list's own order. It backs the big letter shown while scrolling and the jump to a letter.

## Playback

- **Playback context**: the list the user picked a track from (an album, or the Tracks list as filtered and sorted). It is the source of the queue, not the queue itself.
- **Playback**: one queue item being played. Every track that loads gets a new playback id. A seek or an output device switch keeps the same Playback.
- **Queue**: the items to play, held as track ids. Its **arranged order** is the one source of truth. Shuffle is a separate **play order** over it.
- **Output stream**: the device stream that playback opens. It can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them.
- **Playback clock**: the single source of the playing position. The Backend reports it while a track plays. See [ADR 0004](./docs/adr/0004-time-is-drawn-by-the-compositor-not-a-frame-loop.md).
- **Waveform**: the RMS and peak levels of the loaded Playback, keyed by its playback id.
- **Spectrum**: the level of the audio being played, in 30 one-third-octave bands, with left and right summed.
- **Level meter**: the left and right channel levels of the audio being played. Each channel has a peak (with a held peak) and an RMS.
- **Meter frame**: one measurement of the Spectrum and the Level meter, taken at one moment of the output.
- **Level bar**: one drawn level of the Spectrum (a band) or the Level meter (a channel's RMS).
- **Peak cap**: the thin line above a Level bar that marks its held peak.
- **Peak hold time**: how long a Peak cap stays in place before it falls.
- **Clip warning**: the word "Clip", shown on a Level meter channel after its signal clips.
- **Now Playing**: the dock extended upward, as a layer over the current location. It is not a page.
- **Dock**: the persistent playback bar at the bottom of the workspace.

## UI (see [DESIGN.md](./DESIGN.md))

- **Sleeve**: the music as an object, shown as its artwork.
- **Artwork glow**: the artwork, blurred, that lights a surface.
- **Acrylic**: the surface of floating UI. It is used instead of the Artwork glow.
- **Album strip**: a band that lays out an album's tracks as sections in proportion to their duration. It also shows the playing position.
- **Row index**: position and order on the left, in tabular figures. It is also the button of its row.
- **Signal path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length shows whether the app altered the audio.
- **Appearance**: the user's display settings: the Artwork glow and Calm motion. _Avoid_: Settings, as the name of this data (each Backend area owns its own settings; the Settings screen is only where the user changes them).
- **Calm motion**: a setting that stops motion that starts on its own.
- **Progress motion**: motion proportional to time or to work done. It runs at constant speed.
