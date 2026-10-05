# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets. Do not invent synonyms.

## Library

- **Library**: the indexed set of tracks from the registered music folders.
- **Album Artist**: the artist an album is filed under. Library views are Albums, Album Artists, and Tracks. An Album Artist opens into its Albums.
- **Scan**: discovering, inspecting, and indexing files in batches. A cancelled or failed scan never leaves a half-written batch.
- **Missing**: a track whose file is gone. The app shows it as missing and never deletes it automatically. The user may delete Missing tracks after confirmation. A new file with the same content as a Missing track is that track again (relinked, same `track_id`).
- **Compilation**: tracks that share a directory and an album title, but not an artist. They are one album, filed under Various Artists, even when no Album Artist is tagged.
- **Edition**: the printing of an album. It is the folder that holds the tracks. A disc folder counts as the folder above it. An album is its Album Artist, title and Edition. An original and a remaster with the same title and artist are two albums.
- **Scroll index**: a list's names grouped by first character, counted in the list's own order. Kana are grouped by row. Kanji are one group. It backs the big letter shown while scrolling and the jump to a letter.

## Playback

- **Playback context**: where the user picked a track from. It is an album, or the Tracks list as filtered and sorted. Playback continues through it, and it becomes the queue.
- **Playback**: one queue item being played, identified by its playback id. A seek or an output device switch keeps the same Playback. Starting an item again makes a new one.
- **Playback id**: identifies one loaded Playback. It is stable across seeks. Every track that loads gets a new one.
- **Queue**: the items to play, held as track ids. The app reads the library only where it shows or plays them.
  - Its **arranged order** is the one source of truth. Shuffle is a separate **play order** over it.
  - Editing while shuffled, then turning shuffle off, loses and reorders nothing.
  - Starting playback from a list replaces the queue. The user can undo the replacement (or Clear upcoming) once.
- **PlaybackItem**: a queue entry's id plus the one track-metadata type (`PlayableTrack`), which carries the library `track_id`. Nothing looks up a playing track by path.
- **Output stream**: the device stream that playback opens. It lives until playback stops, the device changes, or the next track's audio format differs. Seeks and same-format track changes do not replace it, so it can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them. It is always on. A format change reopens the output stream and leaves a short gap, so the Path stays true.
- **Pipeline**: a decode thread and the sample queue it fills for the output stream. A seek builds a new Pipeline and hands its sample queue to the running stream. The app builds the next track's Pipeline before the end and hands it over the same way.
- **Position event**: the playing position (playback id, position, seek revision). The backend sends it on its own while a track plays. It sends the playback snapshot only when state changes. A tick re-renders only the Playback clock.
- **Waveform**: the RMS and peak levels of the loaded Playback, keyed by its playback id.
  - The backend pushes it whenever a better one is ready: first a quick approximation, then the exact one.
  - Each push carries the playback id of the track it was read for.
  - The renderer asks only for a Waveform that was ready before it started watching. A late answer never decides what is shown.
- **Spectrum**: the level of the audio being played, in 30 one-third-octave bands, with left and right summed. It describes the sound as it leaves the app (after volume), not the file.
- **Level meter**: the left and right channel levels of the audio being played. Each channel has a peak (with a held peak) and an RMS.
- **Meter frame**: one measurement of the Spectrum and the Level meter, taken at one moment of the output. Frames are a live stream. They are sent only while a meter is visible. They are never state, and the app skips a missed one.
- **Bar**: one drawn level of the Spectrum (a band) or the Level meter (a channel's RMS). It fills from the floor. It rises instantly and falls at a fixed dB-per-second rate.
- **Cap**: the thin line above a Bar that marks its held peak. It never sits below its Bar.
- **Hold**: how long a Cap stays in place before it falls (1.5 s), and how long "Clip" stays shown (2 s).
- **Playback clock**: the single source of the playing position. Code reads it in two ways only:
  - A timer that wakes at a boundary (a whole second, a lyric line, the last seconds of a track).
  - An animation that the compositor advances (the position marker, fills).

  Nothing draws time frame by frame on the main thread.

- **Now Playing**: the dock extended upward, as a layer over the current location. It is not a page. Back closes it.
- **Dock**: the persistent playback bar at the bottom of the workspace.

## UI (see [DESIGN.md](./DESIGN.md))

- **Sleeve**: the music as an object, shown as its artwork. Its corner radius shows how it is placed: square when attached to an edge, rounded when placed in the workspace, smaller inside a row.
- **Light**: the artwork, blurred, that lights a surface. Its strength follows the user's focus. It is strongest in Now Playing, then the dock, then the header of a detail page. It is faint in the library. It is absent in navigation and Settings.
- **Acrylic**: the surface of floating UI (menus, dialogs, panels). It is used instead of Light. Blur appears only in Light and Acrylic. Blur is never animated.
- **Strip**: time drawn horizontally.
- **Gutter**: position and order on the left, in tabular figures. It is also the button of its row.
- **Path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length alone shows whether playback is bit-perfect.
- **Calm motion**: a setting. With it, only the position marker moves on its own.
- **Progress motion**: motion proportional to time or to work done (the playing position, scan progress). It runs at constant speed. Every other movement eases.
