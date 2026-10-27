# Context

This is the language of Nice Audio Player. Use these terms in code, docs, and tickets. Do not use synonyms. The rules for names are in [GLOSSARY-FORMAT.md](./.claude/skills/domain-modeling/GLOSSARY-FORMAT.md).

## Structure

- **Renderer**: the part of the app that draws the UI in the window. It composes views and caches Backend state. It holds no second source of truth.
- **Host**: the part of the app that connects the Backend to the window and to the operating system. It registers commands, sends the Backend's messages to the window, and serves artwork. It holds no domain rules.
- **Backend**: the part of the app that owns the domain and the persistent state. It does not know about Tauri.
- **Area**: one part of the domain: the Player, the Library, lyrics, the Appearance, or the meters. The Backend and the Renderer have the same Areas. A Renderer Area holds the cached state and logic of its Area. It never depends on another Renderer Area.
- **App**: the part of the Renderer that holds state across several Areas, such as Now Playing, the queue panel, and the workspace scroll. It sits between the product compositions and the Areas. _Avoid_: shell.
- **Backend state**: a value that the Backend owns and the Renderer mirrors. Examples: the Player state, the Queue state, the Library state, the Waveform, and the Appearance. The Renderer always gets the whole value, and only by push. A command never answers with it.
- **Command**: a request from the Renderer that changes Backend state. It answers at once, only whether the Backend accepted it or refused it with an Error code. A failure after the Backend accepted it arrives as Backend state. _Avoid_: action.
- **Query**: a request from the Renderer that reads data, such as a list page or lyrics. It answers with the data or with an Error code. It changes nothing.
- **Error code**: the name of one reason that the Backend refuses a Command or a Query, such as a missing item or a duplicate Library directory. It is a closed set. The Renderer chooses the text for the user from the Error code. The Backend sends no text. _Avoid_: error message.
- **Backend event**: a fact about one moment. The Backend reports it once, such as a skipped track. The Renderer shows it. The Renderer does not build state from it. _Avoid_: occurrence.
- **Measurement stream**: the frequent measurements that the Backend sends while audio plays: the playing position and the Meter frames. _Avoid_: Stream (an Output stream is a different thing).

## Library

- **Library**: the indexed set of tracks from the Library directories.
- **Library directory**: a music directory that the user added to the Library. The user can disable it without removing it.
- **Library state**: whether the Library is available, its Library version, its Library directories, and its Library scan. It is one Backend state.
- **Library scan**: discovering, inspecting, and indexing files in batches.
- **Album Artist**: the artist that an album is filed under. In code it is called Artist. The app files nothing under a track's own artist.
- **Album**: the tracks that share an Album Artist, a title, and a directory. A disc directory counts as the directory above it. Two printings of one album in two directories are two albums.
- **Compilation**: tracks that share a directory and an album title, but not an artist. They are one album, filed under Various Artists.
- **Missing track**: a track whose file is gone. A new file with the same content is that track again. It is relinked and keeps the same `track_id`.
- **Track location**: where the file of a track is: a Library directory, and a path below it.
- **Playback selection**: the playable track ids of a Playback context, in playing order, and the position to start at.
- **Letter index**: a list's names, grouped by first character, in the list's own order. It supports the big letter that shows during scrolling, and the jump to a letter.
- **Library version**: a number that changes after each change that can alter a list. Examples: a directory is added, enabled, disabled, or removed; Missing tracks are deleted; an album rebuild runs. A directory scan ends with an album rebuild. A list page carries the version it was read at. A list starts over when its pages disagree. _Avoid_: revision.

## Playback

- **Player**: the object that plays the Queue. It exists in the Backend and in the Renderer. Its state is the Player state and the Queue state.
- **Player state**: what the Player does now: stopped, loading a Playback, playing, paused, or failed. _Avoid_: Playback state.
- **Playback context**: the list that the user chose a track from: an album, or the Tracks list as filtered and sorted. It is the source of the queue. It is not the queue itself.
- **Queue**: the items to play, held as track ids. Its **arranged order** is the one source of truth. Shuffle is a separate **play order** over it.
- **Queue version**: a number that changes after each change of the Queue. A window of upcoming items carries the Queue version that it was cut from. _Avoid_: revision.
- **Playback**: one queue item that plays. Each track that loads gets a new playback id. A seek or an output device switch keeps the same Playback.
- **Output stream**: the device stream that a playback opens. One Output stream can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them.
- **Playback clock**: the only source of the playing position. The Backend reports it while a track plays.
- **Waveform**: the RMS level of each bucket of the loaded Playback. It is keyed by its playback id.
- **Lyrics**: the text of a track, read from the tags of the audio file or from an `.lrc` file next to it.

## Meters

- **Spectrum**: the level of the audio that plays, in 30 one-third-octave bands. Left and right are summed.
- **Level meter**: the left and right channel levels of the audio that plays. Each channel has a peak (with a held peak) and an RMS.
- **Meter frame**: one measurement of the Spectrum and the Level meter. It is taken at one moment of the output.
- **Level bar**: one drawn level of the Spectrum (one band) or of the Level meter (the RMS of one channel).
- **Held peak**: the thin line above a Level bar. It marks the highest recent level.
- **Peak hold time**: how long a Held peak stays in place before it falls.
- **Clip warning**: the word "Clip". It shows on a Level meter channel after its signal clips.

## UI (see [DESIGN.md](./DESIGN.md))

- **Player bar**: the persistent playback bar at the bottom of the workspace.
- **Now Playing**: the Player bar extended upward, as a layer over the current location. It is not a page.
- **Artwork**: the music as an object. It shows as its cover image.
- **Artwork background**: the Artwork, blurred. It lights a surface.
- **Blurred surface**: the semi-transparent, blurred surface of floating UI, such as menus, tooltips, dialogs, and task panels. It replaces the Artwork background. In forced-colors mode, it is opaque.
- **Album timeline**: a band that lays out an album's tracks as sections, in proportion to their duration. It also shows the playing position.
- **Track number**: the position and order of a track, on the left, in tabular figures. It is also the button of its row.
- **Signal path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length shows whether the app changed the audio.
- **Reduced motion**: a setting that stops motion that starts on its own.
- **Linear motion**: motion that is proportional to time or to work done. It runs at constant speed.
- **Appearance**: the user's display settings: the Artwork background and Reduced motion. _Avoid_: Settings, as the name of this data. Each Backend area owns its own settings. The Settings screen is only where the user changes them.
