# Context

The language of Nice Audio Player. Use these terms in code, docs, and tickets; do not invent synonyms.

## Library

- **Library**: the indexed set of tracks from the registered music folders.
- **Album Artist**: the artist an album is filed under. Library views are Albums, Album Artists, and Tracks; an Album Artist opens into its Albums.
- **Scan**: discovering, inspecting, and indexing files in batches. A cancelled or failed scan never leaves a half-written batch.
- **Missing**: a track whose file is gone. Shown as missing, never auto-deleted.

## Playback

- **Playback context**: where a track was picked from (an album, or the Tracks list as filtered and sorted). Playback continues through it and becomes the queue.
- **Queue**: the ordered items to play. Starting playback from a list replaces it.
- **PlaybackItem**: a queue entry, carrying the library `track_id`. Nothing looks a playing track up by path.
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
