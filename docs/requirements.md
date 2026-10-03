# Requirements

A Windows 11 desktop app for playing and browsing local audio files. Playback stability comes before visual polish.

## Formats

MP3, FLAC, WAV, AAC, M4A. A file counts as supported only if it can actually be decoded, not just by extension.

## Playback

- Play, pause, resume, stop, seek, previous, next
- Playing a track continues through the context it was picked from: an album plays on through the album, a track in the Tracks list plays on through that list as filtered and sorted
- Previous restarts the track once it has played for 3 seconds, and goes to the previous track before that
- Volume and mute
- Queue, repeat, shuffle. Shuffle is a real random order: the current track stays first and a repeated queue is shuffled again on every pass; tracks added, removed or moved while shuffled keep their intended place when shuffle is turned off. Starting from a very long list responds at once, however large the library is
- Output device selection
- Volume, mute, output device, repeat, and shuffle are remembered across restarts
- Playback state (position, source/output sample rate, resampling) reflects the real audio state
- Decode and output failures are reported clearly. A file that cannot be read or decoded is reported with a transient notice and skipped (consecutive skips share one notice), and the queue survives; a few damaged packets inside a file are skipped silently and the track plays on; an output failure (device, stream) stops playback, keeps the queue, and the dock shows the reason with a Retry that restarts the current item

## Keyboard

| Key                 | Action                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| Space               | Play / pause                                                                   |
| `←` / `→`           | Seek                                                                           |
| `Ctrl+←` / `Ctrl+→` | Previous / next track                                                          |
| `Ctrl+↑` / `Ctrl+↓` | Volume ±1 dB                                                                   |
| `Ctrl+L`            | Now Playing                                                                    |
| `Ctrl+Q`            | Queue                                                                          |
| `Esc`               | Close Now Playing                                                              |
| `/` or `Ctrl+F`     | Filter the library                                                             |
| `Ctrl+S`            | Shuffle on / off                                                               |
| `Ctrl+R`            | Repeat: off, all, one                                                          |
| Arrow keys          | Move between tiles when focus is in an album or artist grid (they do not seek) |

Dragging the seek bar slows down the further the pointer is from the bar (or with `Shift`), for fine positioning. A track row's context menu offers Play next, Add to queue, Go to album, Go to artist, Show in Explorer, and Properties (tags, audio format, and file location); a queue row plays on click, and the tracks already played sit above the current one, faintest, and play again on click. Starting playback from a list replaces the queue, and the dock offers "Queue replaced · Undo" for a few seconds to put the previous queue (and its current track) back in one click; Clear upcoming is undone the same way. Only one step back is kept, and not across restarts.

## Library

- Register local music folders; scan, index, and pick up file changes while idle (a burst of changes is one scan; progress and cancel for long scans; a cancelled or failed scan never leaves a half-written batch; a failed scan stays flagged until a scan succeeds)
- Missing files are shown as missing, never auto-deleted. A file that was moved or renamed is found again by its size and the hash of its head and tail (else by its tags, when exactly one Missing track carries them) and is the same track, so queues still resolve and nothing is left Missing. Settings shows each folder's last scan, track count and Missing count, offers "Delete Missing" (with confirmation; source files are never touched) and a way to open the log folder
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
- Now Playing keeps one layout with or without lyrics: the Sleeve and track info on the left; on the right the lyrics, or the queue (click any track to play it; rows are numbered from the top of the queue) when there are none. With lyrics, the queue sits beside them on a wide window and behind a Lyrics / Queue switch on a narrower one. The queue is the same list wherever it appears, and the current line and the current track sit at the same height wherever they appear.
- Synced lyrics follow the playing line. Scrolling them by hand lets the reader look around, with every line equally readable; they follow again when the reader brings the current line back, on a seek, on `Jump to current line` or `Esc`, or after a short pause, longer when the current line is out of view and not counted while the pointer rests on the lyrics. A click alone never stops following.

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
