# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets. Do not invent synonyms. The rules for names are in [GLOSSARY-FORMAT.md](./.claude/skills/domain-modeling/GLOSSARY-FORMAT.md).

## Structure

- **Renderer**: the part of the app that draws the UI in the window. It composes views and caches Backend state. It holds no second source of truth.
- **Host**: the part of the app that connects the Backend to the window and the operating system. It registers commands, delivers the Backend's messages to the window, and serves artwork. It holds no domain rules.
- **Backend**: the part of the app that owns the domain and the persistent state. It knows nothing about Tauri.
- **Area**: one part of the domain (the Player, the Library, lyrics, the Appearance, or the meters). The Backend and the Renderer are split into the same Areas. A Renderer Area holds that Area's cached state and logic, and never depends on another Renderer Area.
- **App**: the part of the Renderer that holds state spanning several Areas, such as Now Playing, the queue panel, and workspace scroll. It sits between the product compositions and the Areas. _Avoid_: shell.
- **Backend state**: a value that the Backend owns and the Renderer mirrors, such as the Player state, the Queue state, the Library state, the Waveform, and the Appearance. It always reaches the Renderer whole, and only by push. A command never answers with it.
- **Command**: a request from the Renderer that changes Backend state. It answers only whether it was accepted; its outcome arrives as Backend state. _Avoid_: action.
- **Query**: a request from the Renderer that reads data, such as a list page or lyrics. It answers with the data and changes nothing.
- **Backend event**: a fact about one moment that the Backend reports once, such as a skipped track. The Renderer shows it and builds no state from it. _Avoid_: occurrence.
- **Measurement stream**: the frequent measurements that the Backend sends while audio plays: the playing position and the Meter frames. _Avoid_: Stream (an Output stream is a different thing).

## Library

- **Library**: the indexed set of tracks from the Library directories.
- **Library directory**: a music directory the user added to the Library. It can be disabled without being removed.
- **Library state**: whether the Library is available, its Library version, its Library directories, and its Library scan, as one Backend state.
- **Library scan**: discovering, inspecting, and indexing files in batches.
- **Album Artist**: the artist an album is filed under. In code it is called Artist, because the app files nothing under a track's own artist.
- **Album**: the tracks that share an Album Artist, a title, and a directory. A disc directory counts as the directory above it. Two printings of one album in two directories are two albums.
- **Compilation**: tracks that share a directory and an album title, but not an artist. They are one album, filed under Various Artists.
- **Missing track**: a track whose file is gone. A new file with the same content is that track again (relinked, same `track_id`).
- **Letter index**: a list's names grouped by first character, counted in the list's own order. It backs the big letter shown while scrolling and the jump to a letter.
- **Library version**: a number that moves after every change that can alter a list: a directory added, enabled, disabled or removed, Missing tracks deleted, an album rebuild (which a directory scan ends with). A list page carries the version it was read at, and a list starts over when its pages disagree. _Avoid_: revision.

## Playback

- **Player**: the object that plays the Queue, in the Backend and in the Renderer. Its state is the Player state and the Queue state.
- **Player state**: what the Player is doing: stopped, loading a Playback, playing, paused, or failed. _Avoid_: Playback state.
- **Playback context**: the list the user picked a track from (an album, or the Tracks list as filtered and sorted). It is the source of the queue, not the queue itself.
- **Queue**: the items to play, held as track ids. Its **arranged order** is the one source of truth. Shuffle is a separate **play order** over it.
- **Queue version**: a number that moves after every change of the Queue. A window of upcoming items carries the Queue version it was cut from. _Avoid_: revision.
- **Playback**: one queue item being played. Every track that loads gets a new playback id. A seek or an output device switch keeps the same Playback.
- **Output stream**: the device stream that playback opens. It can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them.
- **Playback clock**: the single source of the playing position. The Backend reports it while a track plays.
- **Waveform**: the RMS level of each bucket of the loaded Playback, keyed by its playback id.

## Meters

- **Spectrum**: the level of the audio being played, in 30 one-third-octave bands, with left and right summed.
- **Level meter**: the left and right channel levels of the audio being played. Each channel has a peak (with a held peak) and an RMS.
- **Meter frame**: one measurement of the Spectrum and the Level meter, taken at one moment of the output.
- **Level bar**: one drawn level of the Spectrum (a band) or the Level meter (a channel's RMS).
- **Held peak**: the thin line above a Level bar that marks the highest recent level.
- **Peak hold time**: how long a Held peak stays in place before it falls.
- **Clip warning**: the word "Clip", shown on a Level meter channel after its signal clips.

## UI (see [DESIGN.md](./DESIGN.md))

- **Player bar**: the persistent playback bar at the bottom of the workspace.
- **Now Playing**: the Player bar extended upward, as a layer over the current location. It is not a page.
- **Artwork**: the music as an object, shown as its cover image.
- **Artwork background**: the Artwork, blurred, that lights a surface.
- **Blurred surface**: the semi-transparent, blurred surface of floating UI, such as menus, tooltips, dialogs, and task panels. It is used instead of the Artwork background. In forced-colors mode it is opaque.
- **Album timeline**: a band that lays out an album's tracks as sections in proportion to their duration. It also shows the playing position.
- **Track number**: position and order on the left, in tabular figures. It is also the button of its row.
- **Signal path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length shows whether the app altered the audio.
- **Reduced motion**: a setting that stops motion that starts on its own.
- **Linear motion**: motion proportional to time or to work done. It runs at constant speed.
- **Appearance**: the user's display settings: the Artwork background and Reduced motion. _Avoid_: Settings, as the name of this data (each Backend area owns its own settings; the Settings screen is only where the user changes them).
