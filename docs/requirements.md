# Requirements

Nice Audio Player is a Windows 11 desktop app. It plays and browses local audio files. Playback stability comes before visual polish.

## Formats

MP3, FLAC, WAV, AAC, and M4A. The app counts a file as supported only if it can decode the file. The file extension alone does not decide.

## Playback

- Play, pause, resume, stop, seek, previous, and next.
- A track plays on through the context that the user picked it from:
  - An album plays on through the album.
  - A track in the Tracks list plays on through that list, as filtered and sorted.
- Previous restarts the track when more than 3 seconds have played. Otherwise, it goes to the previous track.
- Volume and mute.
- Queue, repeat, and shuffle:
  - Shuffle makes a real random order. The current track stays first. A repeated queue shuffles again on each pass.
  - A track that is added, removed, or moved while shuffle is on keeps its intended place when shuffle turns off.
  - Starting from a very long list responds at once, whatever the size of the library.
- Gapless playback is always on. It has no setting.
  - Consecutive tracks with the same sample rate and channel count play with no silence between them. They play on the same output stream.
  - The next track opens about 10 seconds before the end. A shorter track opens right after it loads.
  - Each track is still its own Playback, with its own waveform and position.
  - A track of another format reopens the output stream. The app leaves a short gap, so the Signal path stays true. The end of a shuffled queue that repeats does the same. Its next pass is shuffled only then.
  - A change to what plays next discards the opened track. The app then opens the right track. These changes include Play next, shuffle, repeat one, removal, a seek, and a device change.
  - The app trims encoder delay and padding where the file has them (MP3 with a LAME header). FLAC and WAV trim exactly. The app does not trim M4A. M4A keeps the few milliseconds of silence that its encoder added.
- Output device selection.
- The app remembers volume, mute, output device, repeat, and shuffle across restarts.
- While a track loads, the Player bar shows that track at once, without a position.
- The playback state (position, source and output sample rate, resampling) shows the real audio state.
- The app reports decode and output failures clearly:
  - A file that cannot be read or decoded is skipped. A short notice appears. Consecutive skips share one notice. The queue stays.
  - A few damaged packets inside a file are skipped without a notice. The track plays on.
  - An output failure (device or stream) stops playback. The queue stays. The dock shows the reason and a Retry button. Retry restarts the current item.

## Keyboard

| Key                 | Action                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| Space               | Play or pause                                                                  |
| `←` / `→`           | Seek                                                                           |
| `Ctrl+←` / `Ctrl+→` | Previous or next track                                                         |
| `Ctrl+↑` / `Ctrl+↓` | Volume ±1 dB                                                                   |
| `Ctrl+L`            | Now Playing                                                                    |
| `Ctrl+Q`            | Queue                                                                          |
| `Esc`               | Close Now Playing                                                              |
| `/` or `Ctrl+F`     | Filter the library                                                             |
| `Ctrl+S`            | Shuffle on or off                                                              |
| `Ctrl+R`            | Repeat: off, all, or one                                                       |
| Arrow keys          | Move between tiles when focus is in an album or artist grid. They do not seek. |

- Seek bar: dragging slows down as the pointer moves away from the bar. Holding `Shift` also slows it down. This gives fine positioning.
- A track row's context menu offers Play next, Add to queue, Go to album, Go to artist, Show in Explorer, and Properties (tags, audio format, and file location).
- A queue row plays on click. The tracks already played sit above the current one, faintest. Click one to play it again.
- Starting playback from a list replaces the queue.
- Clear upcoming shows "Upcoming cleared · Undo" in the dock for a few seconds. Undo restores the previous queue and its current track in one click. The app keeps only one step back. It does not keep that step across restarts.

## Library

- The user registers local music directories. A Library scan indexes them. The app picks up file changes while idle.
  - A burst of changes makes one scan.
  - Long scans show progress. The user can cancel them.
  - A cancelled or failed scan never leaves a half-written batch.
  - A failed scan stays flagged until a scan succeeds.
  - During a first scan, albums appear in batches as their tracks are indexed.
  - A watcher that cannot attach is not retried. The directory is still scanned.
- Missing files show as missing. The app never deletes them by itself.
  - A moved or renamed file is found again when its size and the hash of its head and tail match exactly one Missing track. The file is the same track, so queues still resolve.
  - Settings shows each directory's last scan, track count, and Missing track count. The directory list, the counts, and the scan update by themselves. No reload is needed.
  - Settings offers "Delete Missing", with confirmation. Source files are never touched.
  - Settings offers a way to open the log directory.
- Settings offers "Reset library and rescan", with confirmation. It deletes the library database and its artwork. Then the app restarts. The restart creates an empty database and rescans the directories. Source files are never touched.
- At start-up, an empty database file gets the schema. A database of another version, or a file that is not a database, is replaced with an empty one. The app then rescans the directories. Only a database that cannot be created at all makes the Library unavailable. The app says so. The rest of the app still works.
- The user browses as Albums, Album Artists, or Tracks. Album Artists open into their Albums.
- Each view keeps its own filter and scroll position across view switches and Library/Settings round trips.
- Back returns to the semantic parent (Album Artist → Album → Album Artist).
- Sort and filter work well on large collections.
- Filter matches:
  - Albums: album title, album artist.
  - Album Artists: album artist.
  - Tracks: title, track artist, album, album artist.
  - The app compares text in folded form: NFKC, katakana as hiragana, lowercase, and Latin accents removed. "ゆず" finds "ユズ". Full-width and half-width forms match each other.
  - `\`, `%`, and `_` are searched literally.
- Sort order uses the same folding. If a file has a SortOrder tag (`TITLESORT`, `ARTISTSORT`, `ALBUMSORT`, `ALBUMARTISTSORT`), the app uses that tag. The app does not skip a leading "The".
  - Order: symbols and digits, Latin, other scripts, kana in gojūon order, then kanji by code point. Kanji have no reading.
  - Names with no value come last in both directions.
- The letter index (letters, or years for albums sorted by year) comes from the library. It follows the list's own order. The big letter shown during scrolling and the index rail agree with that order.
  - Kana file under the head of their row (か for が). All kanji form one group, "漢".
  - Choosing a letter starts the list at that letter. The app does not load the items before it.
  - Choosing the first letter, or changing the sort or filter, starts the list from the top.
- Albums are filed by Album Artist, title, and directory. See Album and Compilation in [CONTEXT.md](../CONTEXT.md). A disc directory ("CD1", "Disc 2") belongs to the album directory above it.

## Lyrics

- Lyrics come from local `.lrc` sidecar files and from embedded lyrics. Sidecar files can be UTF-8, UTF-16, or a legacy encoding such as Shift_JIS.
- The app reads lyrics again after a library scan finishes.
- Now Playing keeps one layout, with or without lyrics.
  - The Sleeve and the track info are on the left.
  - The right side shows the lyrics. Without lyrics, the queue shows there. A click on any queue track plays it. Rows are numbered from the top of the queue.
  - With lyrics, the queue sits beside them on a wide window. On a narrow window, a Lyrics / Queue switch shows one of them.
  - The queue is the same list wherever it appears. The current line and the current track sit at the same height wherever they appear.
- Synced lyrics follow the playing line.
  - When the reader scrolls by hand, every line is equally readable.
  - Following resumes when the reader brings the current line back into view. It also resumes on a seek, on `Jump to current line`, on `Esc`, or after a short pause.
  - The pause is longer when the current line is out of view. The pause does not count while the pointer rests on the lyrics.
  - A click alone never stops following.

## Meters

Meters are a third view of Now Playing, beside Lyrics and Queue. On a wide window, the meters replace the lyrics. The queue stays. The meters show the Spectrum and the Level meter (see [CONTEXT.md](../CONTEXT.md)) on one shared dB axis, from −90 to 0 dBFS. They measure the audio as it leaves the app, after volume.

- The Level meter shows left and right side by side. Each channel has a peak, an RMS, and a held peak.
- Level bars are thin and white. The artwork does not tint them. They sit on the bare surface, with no panel. The held peak is a thin, full-white Peak cap.
- Level bars rise at once. Spectrum bars fall at 30 dB/s. Level meter bars fall at 8.6 dB/s. Peak caps hold for 1.5 s (the Peak hold time). Then they fall at 10 dB/s.
- Each channel shows its held peak in dBFS as text. The text refreshes a few times a second.
- The Clip warning shows the word "Clip" for 2 s. A click clears it. Color is never the only signal.
- The meters run only while they are visible. When playback is paused or stopped, the Level bars fall to the floor. With Calm motion on, the meters stop and say so.
- On a narrow window, the Spectrum takes the full width. The left and right meters become two horizontal bars below it.
- Meter frames are a live stream, not state. The app skips a missed frame. It never keeps or replays a frame.
- A mono device shows the same level on both channels. A device with more than two channels shows its first two.

## Metadata

The app shows these fields when they are available: title, album, artist, album artist, track and disc number, genre, date, duration, format and codec, sample rate, channels, bit depth, bit rate, file path, and artwork.

The app never changes source audio files.

## Reliability

- A failure does not damage unrelated user data.
- A damaged or older settings file does not stop start-up. The app replaces it with defaults. The next change overwrites it.
- The app does no destructive file operation without confirmation.
- The app has no silent fallback that changes a playback mode that the user selected.
- Background and audio resources shut down cleanly.

## Planned (not yet implemented)

- Playlists, managed by the user.
- Playback history: recently and frequently played tracks. A brief preview or an accidental start does not count as a play.
- Smart playlists and advanced statistics.
- Lyrics and artwork from local, embedded, manually selected, or external sources. The app never silently replaces a choice that the user confirmed. External failures never block playback.
- Visualization: supplementary only. The user never needs it to understand the playback state.
- Audio processing (loudness normalization, ReplayGain): explicit and visible to the user, can be bypassed, and does not clip.
- Exclusive output and bit-perfect playback.
- Metadata overrides and editing, only on explicit user request.
- External services: opt-in only. Credentials never appear in the UI or in logs. Otherwise, local library data stays local.
