# Requirements

A Windows 11 desktop app for playing and browsing local audio files. Playback stability comes before visual polish.

## Formats

MP3, FLAC, WAV, AAC, M4A. A file counts as supported only if it can actually be decoded, not just by extension.

## Playback

- Play, pause, resume, stop, seek, previous, next
- Playing a track continues through the context it was picked from:
  - An album plays on through the album.
  - A track in the Tracks list plays on through that list, as filtered and sorted.
- Previous restarts the track after 3 seconds of playing. Before that, it goes to the previous track.
- Volume and mute
- Queue, repeat, shuffle:
  - Shuffle is a real random order. The current track stays first. A repeated queue is shuffled again on every pass.
  - A track added, removed or moved while shuffled keeps its intended place when shuffle is turned off.
  - Starting from a very long list responds at once, however large the library is.
- Gapless playback is always on and has no setting:
  - Consecutive tracks with the same sample rate and channel count play with no silence between them, on the same output stream.
  - The next track opens about 10 seconds before the end. A shorter track opens right after loading.
  - Each track is still its own playback, with its own waveform and position.
  - A track of another format reopens the output stream and leaves a short gap, so the Signal path stays true. The end of a shuffled queue that repeats does the same, because its next pass is shuffled only then.
  - Anything that changes what plays next discards the opened track and opens the right one. This includes Play next, shuffle, repeat one, removal, a seek, and a device change.
  - Encoder delay and padding are trimmed where the file carries them (MP3 with a LAME header). FLAC and WAV are exact. M4A is not trimmed, so it keeps the few milliseconds of silence that its encoder added.
- Output device selection
- Volume, mute, output device, repeat, and shuffle are remembered across restarts
- Playback state (position, source and output sample rate, resampling) reflects the real audio state
- Decode and output failures are reported clearly:
  - A file that cannot be read or decoded is skipped, with a transient notice. Consecutive skips share one notice. The queue survives.
  - A few damaged packets inside a file are skipped silently. The track plays on.
  - An output failure (device or stream) stops playback and keeps the queue. The dock shows the reason and a Retry button that restarts the current item.

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

- Seek bar: dragging slows down as the pointer moves away from the bar, or with `Shift`. This gives fine positioning.
- A track row's context menu offers Play next, Add to queue, Go to album, Go to artist, Show in Explorer, and Properties (tags, audio format, and file location).
- A queue row plays on click. The tracks already played sit above the current one, faintest, and play again on click.
- Starting playback from a list replaces the queue.
- Clear upcoming shows "Upcoming cleared · Undo" in the dock for a few seconds. Undo puts the previous queue and its current track back in one click. Only one step back is kept, and not across restarts.

## Library

- Register local music folders. Run a Library scan to index them, and pick up file changes while idle.
  - A burst of changes is one scan.
  - Long scans show progress and can be cancelled.
  - A cancelled or failed scan never leaves a half-written batch.
  - A failed scan stays flagged until a scan succeeds.
- Missing files are shown as missing. The app never deletes them automatically.
  - A moved or renamed file is found again by its size and the hash of its head and tail. If that fails, it is found by its tags, when exactly one Missing track carries them. It is the same track, so queues still resolve.
  - Settings shows each folder's last scan, track count and Missing track count.
  - Settings offers "Delete Missing", with confirmation. Source files are never touched.
  - Settings offers a way to open the log folder.
- Browse as Albums, Album Artists, or Tracks; Album Artists drill into their Albums
- Each view keeps its own filter and scroll position across view switches and Library/Settings round trips
- Back returns to the semantic parent (Album Artist → Album → Album Artist)
- Sort and filter, working well on large collections
- Filter matches:
  - Albums: album title, album artist
  - Album Artists: album artist
  - Tracks: title, track artist, album, album artist
  - Text is compared folded (NFKC, katakana as hiragana, lowercase, Latin accents dropped): "ゆず" finds "ユズ", and full-width and half-width forms match each other
  - `\`, `%`, and `_` are searched literally
- Sort order uses the same folding. If the file has a SortOrder tag (`TITLESORT`, `ARTISTSORT`, `ALBUMSORT`, `ALBUMARTISTSORT`), the tag is used instead. The app does not skip a leading "The".
  - Order: symbols and digits, Latin, other scripts, kana in gojūon order, then kanji by code point (kanji have no reading).
  - Names with no value come last in both directions.
- The scroll index (letters, or years for albums sorted by year) is read from the library, in the list's own order. The big letter shown while scrolling and the index rail agree with the order by construction.
  - Kana are filed under the head of their row (か for が). All kanji are one "漢".
  - Choosing a letter starts the list there, without loading what precedes it.
  - Choosing the first letter, or changing the sort or filter, starts the list from the top.
- Albums are filed by Album Artist, title and Album edition. See Compilation and Album edition in [CONTEXT.md](../CONTEXT.md). A disc folder ("CD1", "Disc 2") belongs to the album folder above it.

## Lyrics

- Local `.lrc` sidecar files and embedded lyrics; sidecars may be UTF-8, UTF-16, or a legacy encoding such as Shift_JIS
- Lyrics are read again after a library scan finishes
- Now Playing keeps one layout with or without lyrics.
  - The Sleeve and track info are on the left.
  - On the right are the lyrics. Without lyrics, the queue is there instead. A click on any queue track plays it. Rows are numbered from the top of the queue.
  - With lyrics, the queue sits beside them on a wide window. On a narrower window, it is behind a Lyrics / Queue switch.
  - The queue is the same list wherever it appears. The current line and the current track sit at the same height wherever they appear.
- Synced lyrics follow the playing line.
  - If the reader scrolls by hand, every line is equally readable.
  - Following resumes when the reader brings the current line back, on a seek, on `Jump to current line` or `Esc`, or after a short pause.
  - The pause is longer when the current line is out of view. It does not count while the pointer rests on the lyrics.
  - A click alone never stops following.

## Meters

A third view of Now Playing, beside Lyrics and Queue. On a wide window it replaces the lyrics, and the queue stays. It shows the Spectrum and the Level meter (see [CONTEXT.md](../CONTEXT.md)) on one shared dB axis (−90 to 0 dBFS). It measures the audio as it leaves the app, after volume.

- The Level meter shows left and right side by side, each with peak, RMS and a held peak.
- Level bars are thin and white, not tinted by the artwork, on the bare surface (no panel). The held peak is a thin full-white Peak cap.
- Level bars rise instantly. Spectrum bars fall at 30 dB/s. Level meter bars fall at 8.6 dB/s. Peak caps hold for 1.5 s (the Peak hold time), then fall at 10 dB/s.
- Each channel shows its held peak in dBFS as text, refreshed a few times a second.
- The Clip warning shows the word "Clip" for 2 s. A click clears it. Color is never the only signal.
- The meters run only while visible. When playback is paused or stopped, the Level bars fall to the floor. With Calm motion, the meters stop and say so.
- On a narrow window, the Spectrum takes the full width. The left and right meters become two horizontal bars below it.
- Meter frames are a live stream, not state. The app skips a missed frame and never keeps or replays one.
- A mono device shows the same level on both channels. A device with more than two channels shows its first two.

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
- Exclusive output, bit-perfect playback
- Metadata overrides and editing (only on explicit user request)
- External services: opt-in only, credentials never exposed to the UI or logs; local library data stays local otherwise
