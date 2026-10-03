# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets; do not invent synonyms.

## Library

- **Library**: the indexed set of tracks from the registered music folders.
- **Album Artist**: the artist an album is filed under. Library views are Albums, Album Artists, and Tracks; an Album Artist opens into its Albums.
- **Scan**: discovering, inspecting, and indexing files in batches. A cancelled or failed scan never leaves a half-written batch.
- **Missing**: a track whose file is gone. Shown as missing, never auto-deleted; the user may delete Missing tracks explicitly, after confirmation. A new file with the same content as a Missing track is that track again (relinked, same `track_id`).
- **Compilation**: tracks that share a directory and an album title but not an artist are one album, filed under Various Artists, even when no Album Artist is tagged.

## Playback

- **Playback context**: where a track was picked from (an album, or the Tracks list as filtered and sorted). Playback continues through it and becomes the queue.
- **Playback**: one queue item being played, identified by its playback id. A seek or an output device switch keeps the same Playback; starting an item again makes a new one.
- **Queue**: the items to play, held as track ids and read from the library only where they are shown or played. Its **arranged order** is the one source of truth; shuffle is a separate **play order** over it, so editing while shuffled and then turning shuffle off loses and reorders nothing. Starting playback from a list replaces it; the replacement (or Clear upcoming) can be undone once.
- **PlaybackItem**: a queue entry's id plus the one track-metadata type (`PlayableTrack`), carrying the library `track_id`. Nothing looks a playing track up by path.
- **Output stream**: the device stream playback opens. It lives until playback stops, the device changes or the next track's audio format differs; seeks and same-format track changes do not replace it, so it can span several Playbacks.
- **Gapless**: consecutive tracks of the same audio format play with no silence between them, always on. A format change reopens the output stream and leaves a short gap, so the Path stays true.
- **Pipeline**: a decode thread and the queue it fills for the output stream. A seek builds a new one and hands its queue to the running stream; the next track's Pipeline is built ahead of the end and handed over the same way.
- **Position event**: the playing position (playback id, position, seek revision), sent on its own while a track plays. The playback snapshot is sent only when state changes, so a tick never re-renders anything but the Playback clock.
- **Playback id**: identifies one loaded session; stable across seeks, new for every track that loads.
- **Waveform**: the loaded Playback's RMS and peak levels, keyed by its playback id. The backend pushes it whenever a better one is ready (a quick approximation, then the exact one), always with the playback id of the track it was read for; the renderer asks only for one that was ready before it was watching, so a late answer never decides what is shown.
- **Playback clock**: the single animation-frame clock that everything drawing the playing position reads.
- **Now Playing**: the dock extended upward, a layer over the current location. Not a page; Back closes it.
- **Dock**: the persistent playback bar at the bottom of the workspace.

## UI (see [DESIGN.md](./DESIGN.md))

- **Sleeve**: the music as an object, its artwork. Its corner radius says how it is placed: square when attached to an edge, rounded when placed in the workspace, smaller inside a row.
- **Light**: the artwork, blurred, lighting a surface. Its strength follows the user's focus: strongest in Now Playing, then the dock, then the header of a detail page, faint in the library, absent in navigation and Settings.
- **Acrylic**: the surface of floating UI (menus, dialogs, panels), used instead of Light. Blur appears only in Light and Acrylic and is never animated.
- **Strip**: time drawn horizontally.
- **Gutter**: position and order on the left, in tabular figures. It is also the button of its row.
- **Path**: technical notation for audio, such as `FLAC 24/96 › Speakers`. Its length alone says whether playback is bit-perfect.
- **Calm motion**: a setting under which only the position marker moves on its own.
- **Progress motion**: motion proportional to time or to work done (the playing position, scan progress). It runs at constant speed, unlike every other movement, which eases.
