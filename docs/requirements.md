# Requirements

This document defines what Nice Audio Player must provide as a product.

It describes the supported environment, user-facing capabilities, quality requirements, data handling, and features that are outside the initial scope. Implementation rules and module boundaries belong in `architecture.md`, while visual and interaction details belong in `ui-design.md`.

## 1. Product Goals

Nice Audio Player is a Windows desktop application for managing and playing a local music library.

The product should provide:

- Reliable, high-quality local audio playback
- Fast navigation through large music libraries
- A polished, artwork-driven interface
- High-quality real-time audio visualization
- Extensible lyrics and artwork retrieval
- Clear ownership of local data and credentials

Audio stability has priority over visual performance. The visualizer must use fixed maximum quality and should be optimized toward the active display refresh rate, including 120 Hz displays, without dynamically lowering quality.

## 2. Target Environment

The initial release targets:

- Windows 11
- Tauri v2
- Rust
- React
- TypeScript
- Vite
- Tailwind CSS
- SQLite

Other operating systems are not part of the initial release.

The application should remain usable at common Windows display scaling levels and on displays with different refresh rates.

## 3. Supported Audio Formats

The initial target formats are:

- MP3
- FLAC
- WAV
- AAC
- M4A

A file is supported only when its contained codec and audio stream can be decoded reliably. File extensions alone must not be treated as proof of a valid audio file.

Additional formats may be added later when they can be supported without weakening playback stability.

## 4. Playback

The player must support:

- Play
- Pause
- Resume
- Stop
- Seek
- Previous track
- Next track
- Volume control
- Mute
- Playback queue
- Queue reordering
- Repeat modes
- Shuffle
- Gapless playback
- Output device selection
- Shared output mode
- Exclusive output mode where supported
- Recovery from output-device disconnection where practical
- Playback progress
- Playback completion
- Keyboard media controls

Rust must remain the source of truth for playback state.

The application must not report a playback state that differs from the actual audio-engine state.

## 5. Loudness and Playback Statistics

The player should support:

- Track loudness normalization
- Album loudness normalization
- ReplayGain metadata where available
- Calculated loudness values where required
- Peak information
- Playback history
- Last played time
- Play count
- Skip count
- Favorites

Normalization must avoid clipping.

Playback history and counters should be updated only after clearly defined playback conditions are met. Brief previews or accidental starts must not always count as completed plays.

## 6. Music Library

The application must support:

- Registering one or more music folders
- Initial folder scanning
- Incremental rescanning
- File-system change detection
- Adding newly discovered files
- Updating changed files
- Marking or removing missing files
- Fast searching
- Sorting
- Filtering
- Virtualized list rendering
- Track view
- Album view
- Artist view
- Genre view where metadata is available
- Playlist view
- Recently added view
- Recently played view
- Frequently played view
- Unplayed view
- Favorites view

Library operations must remain responsive with large collections.

Scanning, metadata extraction, artwork processing, and audio analysis should expose progress and allow cancellation where practical.

## 7. Metadata

The application should display relevant metadata, including:

- Track title
- Album title
- Artist
- Album artist
- Track number
- Disc number
- Genre
- Year or date
- Duration
- File format
- Codec
- Sample rate
- Channel count
- Bit depth where available
- Bit rate where meaningful
- File path

The application should support metadata editing.

Initial metadata edits may be stored as application-level overrides. Writing metadata changes back to source files must require an explicit user action.

The application must preserve source files unless the user deliberately requests a file modification.

## 8. Playlists

The application must support:

- Manually managed playlists
- Adding tracks to playlists
- Removing tracks from playlists
- Reordering playlist entries
- Renaming playlists
- Deleting playlists

The application should also support smart playlists based on conditions such as:

- Artist
- Album
- Genre
- Year
- Rating or favorite state
- Play count
- Skip count
- Last played time
- Date added
- Duration
- File format

Smart playlists must be derived from stored rules rather than duplicated track lists.

## 9. Duplicate Detection

The library should detect likely duplicate tracks.

Duplicate detection may use combinations of:

- File path
- File size
- Modification time
- Duration
- Normalized metadata
- Audio properties
- File or content hashes where appropriate

Duplicate detection must not automatically delete files.

Any destructive duplicate-resolution action must require explicit user confirmation.

## 10. Lyrics

The application must support:

- Plain lyrics
- Synchronized lyrics
- Local sidecar lyric files
- Embedded lyrics
- Cached lyrics
- External lyrics providers
- Manual lyric selection
- Manual lyric editing
- Timing offset adjustment
- Provider attribution where required

Lyrics should be resolved in this order:

1. Local sidecar file
2. Embedded lyrics
3. User override
4. Local cache
5. Enabled external providers
6. Manual search or editing

The application should support multiple provider candidates and help the user choose the correct result.

Candidate matching may use:

- Track title
- Artist
- Album
- Duration
- Track number

A provider mismatch must not silently replace a confirmed user selection.

## 11. Lyrics Providers

Lyrics providers must be modular.

Each provider may expose:

- Provider name
- Enabled state
- Priority
- Supported capabilities
- API-key requirement
- Search
- Candidate lookup
- Lyrics retrieval
- Attribution
- Rate-limit or error status

Provider settings must support:

- Enable or disable
- Priority ordering
- API-key entry
- API-key replacement
- API-key removal
- Connection testing where supported
- Cache clearing

Failure of an external provider must not interrupt local playback or access to locally stored lyrics.

## 12. Artwork

Artwork should be resolved in this order:

1. Embedded artwork
2. Common artwork files in the track folder
3. User-selected artwork
4. Local cache
5. Enabled external providers
6. Generated fallback artwork

Common folder artwork names may include:

- `cover`
- `folder`
- `front`
- `album`

The application should support:

- Artwork extraction
- Artwork caching
- User replacement
- Provider attribution where required
- Fallback artwork
- Artwork-derived color extraction

Artwork loading and processing must not block audio playback.

## 13. Artwork Providers

Artwork providers must be modular and independent from lyrics providers.

Provider settings may include:

- Enabled state
- Priority
- API-key configuration
- Search capabilities
- Image-size capabilities
- Attribution requirements
- Cache policy

Provider failures must not prevent local or embedded artwork from being used.

## 14. Visualizer

The application should provide visualizer modes such as:

- Spectrum
- Waveform
- Peak meter
- RMS meter
- VU meter
- Stereo phase
- Combined view
- Full-screen view

The visualizer must:

- Use fixed maximum visual quality
- Avoid automatic quality reduction
- Aim to follow the active display refresh rate
- Remain independent from React rendering
- Avoid blocking or delaying audio processing
- Use the latest available analysis data
- Discard stale visualization frames
- Avoid unbounded queues
- Avoid unnecessary per-frame allocations

A slower visualizer must never reduce playback stability.

## 15. User Interface

The interface must provide:

- Library navigation
- Search
- Track lists
- Album and artist browsing
- Queue management
- Persistent playback controls
- Now Playing view
- Lyrics view
- Visualizer view
- Settings
- Provider configuration
- Output-device configuration

The interface should support:

- Artwork-based theming
- Smooth transitions
- Animated control-state changes
- Carefully limited SVG morphing
- Keyboard navigation
- Accessible focus states
- Reduced-motion preferences

Detailed visual rules belong in `ui-design.md`.

## 16. Performance

The application must prioritize playback reliability.

The following requirements apply:

- Normal UI interaction must not cause audio underruns
- Scrolling and searching large libraries must remain responsive
- File scanning must not block playback
- Provider requests must not block playback
- Database work must not run in the audio callback
- File access must not run in the audio callback
- Logging must not run in the audio callback
- IPC must not run in the audio callback
- Large or repeated allocations must be avoided in hot paths
- Visualizer data must not update React state once per rendered frame
- Stale visualizer frames must not accumulate

Performance should be measured on representative Windows hardware rather than inferred only from development builds.

## 17. Data Storage

SQLite should store:

- Registered library folders
- Track metadata
- Album and artist relationships
- File identity information
- Playlists
- Smart-playlist rules
- Favorites
- Playback history
- Play and skip counts
- Analysis results
- Cached lyrics metadata
- Cached artwork metadata
- Non-secret application settings

Database changes must be versioned through migrations.

Cached external content must retain provider and attribution information where required.

## 18. Credentials and Security

API keys and other provider credentials must:

- Be handled by Rust
- Be stored through an operating-system credential-store abstraction
- Never be stored in source files
- Never be stored in plain-text application settings
- Never be written to logs
- Never be returned to React after saving
- Never be displayed again after saving

The frontend may receive only credential states such as:

- `missing`
- `configured`
- `invalid`
- `unavailable`

File paths, metadata, lyrics, artwork, and provider responses must be treated as untrusted input.

## 19. Error Handling

The application must handle recoverable errors without crashing.

User-facing errors should:

- Explain what failed
- Provide an actionable next step where possible
- Avoid exposing internal secrets
- Avoid displaying raw stack traces
- Preserve unrelated application functionality

Examples include:

- Unsupported audio file
- Corrupted audio stream
- Missing output device
- Disconnected output device
- Failed library scan
- Unavailable provider
- Invalid provider credential
- Database failure
- Missing source file

Provider and artwork failures must not stop local audio playback.

## 20. Out of Scope

The initial product does not include:

- Online music streaming
- Cloud library synchronization
- Multi-device synchronization
- Mobile applications
- User accounts
- Social features
- Public profiles
- Sleep timer
- Podcast management
- Video playback
- CD ripping
- Music purchasing
- Third-party DSP plugin hosting
- Automatic visualizer quality reduction
- Automatic destructive duplicate removal
