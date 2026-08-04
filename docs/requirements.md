# Requirements

This document defines accepted product requirements for Nice Audio Player.

It describes user-visible behavior, supported environments, quality expectations, and data-safety requirements. Implementation rules belong in `architecture.md`; visual and interaction principles belong in `DESIGN.md`; proposed features and implementation scope belong in GitHub Issues.

## 1. Product Purpose

Nice Audio Player is a Windows desktop application for playing and managing local audio files.

The product should prioritize:

- Reliable, high-quality playback
- Clear and responsive interaction
- Safe handling of local files and credentials
- A polished, artwork-led listening experience
- Responsiveness with large local libraries

Audio stability has priority over visual work. Delayed visual updates may be skipped rather than allowed to interfere with playback.

## 2. Target Environment

The initial supported platform is Windows 11.

The application is implemented with Tauri v2, Rust, React, TypeScript, Vite, and Tailwind CSS. Persistent library data may use SQLite when library functionality is introduced.

The interface must remain usable at common Windows display-scaling levels and across ordinary desktop window sizes.

## 3. Audio Files

The initial target formats are:

- MP3
- FLAC
- WAV
- AAC
- M4A

A file is supported only when its container and selected audio stream can be validated and decoded. File extensions alone are not proof that a file is valid or supported.

Additional formats may be accepted through focused feature work when they can be supported without weakening playback reliability.

## 4. Playback

The accepted playback direction includes:

- Play, pause, resume, and stop
- Seeking and playback-position reporting
- Previous and next track behavior
- Volume and mute
- Queue playback
- Repeat and shuffle
- Output-device selection
- Shared output mode
- Playback completion and structured failure reporting

Playback behavior must reflect the actual audio state. The UI must not present a successful or active state after the underlying operation has failed or ended.

Application-side resampling, channel conversion, gapless playback, exclusive output, and bit-perfect playback are not implied by this section. Each requires explicit acceptance and focused implementation scope.

## 5. Audio Processing

Optional audio processing may include loudness normalization and ReplayGain support when separately accepted.

When the selected output requires channel adaptation, matching channel layouts preserve the source layout,
mono sources may play through stereo output by duplicating each sample to left and right, and the active
conversion is visible in playback state. Unsupported channel-layout combinations produce a structured
playback failure.

Any processing that changes sample values must be explicit, user-visible, and bypassable where the product mode requires an unmodified path.

Normalization must avoid clipping. Processing must not run in a way that compromises real-time playback stability.

## 6. Local Library

The accepted library direction includes:

- Registering local music folders
- Discovering and indexing supported audio files
- Updating records when files change
- Representing missing files without destructive automatic actions
- Searching, sorting, and filtering
- Track, album, artist, playlist, recent, and favorite views where the required data exists
- Responsive presentation for large collections

Long-running scans and analysis should expose progress and cancellation where practical.

Automatic deletion or destructive duplicate handling is not permitted.

## 7. Metadata and Source Files

The application may display available metadata such as:

- Track, album, artist, and album artist
- Track and disc numbers
- Genre and date
- Duration
- File format and codec
- Sample rate, channel count, bit depth, and bit rate where meaningful
- File path

Application-level metadata overrides may be supported.

Writing metadata back to source files must require explicit user action. Source files must remain unchanged unless the user deliberately requests a modification.

## 8. Playlists and Playback History

The accepted product direction includes manually managed playlists and playback-derived views such as recently played or frequently played.

Any play count, skip count, history, or completion statistic must use a clearly defined threshold. A brief preview or accidental start must not automatically count as a completed play.

Smart playlists and advanced statistics require separate accepted feature scope.

## 9. Lyrics and Artwork

The product may use local, embedded, cached, manually selected, or external lyrics and artwork sources when those sources are separately implemented.

A confirmed user selection must not be silently replaced by an automatic provider result.

Provider attribution and usage requirements must be respected. External-provider failures must not prevent local playback.

Artwork and lyrics processing must not delay or destabilize audio playback.

## 10. Visualization

Visualization is supplementary and must never be required to understand playback state.

Visualizer rendering must remain isolated from playback-critical work. Stale or delayed visual frames may be discarded rather than queued. The implementation may adapt update frequency or skip frames to preserve audio stability, provided the user-facing result remains coherent.

Specific visualizer modes and quality targets require focused feature acceptance.

## 11. Data, Credentials, and Privacy

Local library data should remain local unless the user explicitly enables an external service.

Credentials must:

- Be stored using an operating-system-backed credential mechanism where available
- Never be returned to the frontend as secret values
- Never appear in logs, error messages, database records, debug output, or serialized events

External network access must be limited to user-enabled features and clearly identified providers.

## 12. Reliability and Safety

The application must:

- Report validation, decode, output, provider, and persistence failures clearly
- Preserve unrelated user data after recoverable failures
- Avoid silent fallback when fallback would change an explicitly selected playback mode
- Avoid destructive file operations without confirmation
- Shut down owned background and audio resources cleanly
- Keep hardware-dependent behavior manually verifiable where deterministic automated testing is not practical

## 13. Scope Management

A capability is not an accepted requirement merely because it is described in an idea, roadmap, or Issue.

New capabilities should be accepted through a focused Issue before being added here. This document should describe durable product expectations, not temporary implementation status, branch plans, or speculative class and module structures.
