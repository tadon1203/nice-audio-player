# Requirements

A Windows 11 desktop app for playing and browsing local audio files. Playback stability comes before visual polish.

## Formats

MP3, FLAC, WAV, AAC, M4A. A file counts as supported only if it can actually be decoded, not just by extension.

## Playback

- Play, pause, resume, stop, seek, previous, next
- Playing a track continues through the context it was picked from: an album plays on through the album, a track in the Tracks list plays on through that list as filtered and sorted
- Previous restarts the track once it has played for 3 seconds, and goes to the previous track before that
- Volume and mute
- Queue, repeat, shuffle. Shuffle is a real random order: the current track stays first and a repeated queue is shuffled again on every pass
- Output device selection
- Volume, mute, output device, repeat, and shuffle are remembered across restarts
- Playback state (position, source/output sample rate, resampling) reflects the real audio state
- Decode and output failures are reported clearly. A file that cannot be read or decoded is reported and skipped, and the queue survives; an output failure (device, stream) stops playback and keeps the queue

## Library

- Register local music folders; scan, index, and pick up file changes (with progress and cancel for long scans; a cancelled or failed scan never leaves a half-written batch)
- Missing files are shown as missing, never auto-deleted
- Browse as Albums, Album Artists, or Tracks; Album Artists drill into their Albums
- Each view keeps its own filter and scroll position across view switches and Library/Settings round trips
- Back returns to the semantic parent (Album Artist → Album → Album Artist)
- Sort and filter, working well on large collections
- Filter matches:
  - Albums: album title, album artist
  - Album Artists: album artist
  - Tracks: title, track artist, album, album artist
  - `\`, `%`, and `_` are searched literally

## Lyrics

- Local `.lrc` sidecar files and embedded lyrics; sidecars may be UTF-8, UTF-16, or a legacy encoding such as Shift_JIS
- Lyrics are read again after a library scan finishes

## Metadata

Displayed when available: title, album, artist, album artist, track/disc number, genre, date, duration, format/codec, sample rate, channels, bit depth, bit rate, file path, artwork.

Source audio files are never modified.

## Reliability

- Failures don't damage unrelated user data
- No destructive file operations without confirmation
- No silent fallback that changes a selected playback mode
- Background and audio resources shut down cleanly

## Planned (not yet implemented)

- Playlists: manually managed
- Playback history: recently and frequently played; a brief preview or accidental start must not count as a play
- Smart playlists and advanced statistics
- Lyrics and artwork from local, embedded, manually selected, or external sources; a user's confirmed choice is never silently replaced, and external failures never block playback
- Visualization: supplementary only, never needed to understand playback state
- Audio processing (loudness normalization, ReplayGain): explicit and visible to the user, bypassable, no clipping
- Gapless playback, exclusive output, bit-perfect playback
- Metadata overrides and editing (only on explicit user request)
- External services: opt-in only, credentials never exposed to the UI or logs; local library data stays local otherwise
