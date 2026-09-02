# Requirements

This document defines accepted product requirements for Nice Audio Player.

Implementation structure belongs in `architecture.md`. Visual and interaction design belongs in `DESIGN.md`. Change-specific scope belongs in GitHub Issues.

## Platform

Nice Audio Player is a Windows desktop application for playing and managing local audio files.

The initial supported platform is Windows 11.

The application must remain usable across ordinary desktop window sizes and common Windows display-scaling levels.

Audio stability takes priority over visual work.

## Audio Files

Supported formats are:

- MP3
- FLAC
- WAV
- AAC
- M4A

A file is supported only when its container and selected audio stream can be validated and decoded. File extension alone is not sufficient.

Additional formats require separate acceptance.

## Playback

Playback supports:

- play, pause, resume, and stop;
- seeking and playback-position reporting;
- previous and next;
- volume and mute;
- queue playback;
- repeat and shuffle;
- output-device selection;
- shared output mode;
- playback completion and structured failure reporting.

Presented playback state must reflect actual audio state.

When the selected shared output configuration requires sample-rate or channel conversion:

- channel order and source-media duration must be preserved;
- sample-rate conversion must be bypassed when source and output rates match;
- source rate, output rate, and active resampling must be visible in playback state;
- unsupported conversion and processing failures must produce structured playback failures.

Matching channel layouts preserve the source layout. Mono may be converted to stereo by duplicating each sample to left and right.

Gapless playback, exclusive output, and bit-perfect playback require separate acceptance.

## Audio Processing

Processing that changes sample values must be explicit and user-visible.

Where the selected product mode requires an unmodified path, processing must be bypassable.

Normalization must avoid clipping.

Audio processing must not compromise playback stability.

Loudness normalization and ReplayGain require separate acceptance.

## Library

Library browsing provides Albums, Album Artists, and Tracks as peer presentations.

Album Artists support drill-in to their Albums.

Albums, Album Artists, and Tracks retain independent filter and scroll context during the application session, including peer switching and Library/Settings round trips.

Back navigation returns to the semantic parent, including nested Album Artist → Album → Album Artist navigation.

Filtering behaves as follows:

- Albums match Album title and Album Artist.
- Album Artists match Album Artist.
- Tracks match Track title, Track Artist, Album, and Album Artist.
- Literal `\`, `%`, and `_` remain searchable.

The library supports:

- registering local music folders;
- discovering and indexing supported audio files;
- updating indexed records when files change;
- representing missing files without destructive automatic action;
- searching, sorting, and filtering;
- track, album, and album-artist browsing;
- responsive presentation for large collections.

Long-running scans expose progress and cancellation where practical.

Automatic deletion and destructive duplicate handling are not permitted.

Playlists, recent views, favorites, and other additional library presentations require their underlying product capability to be accepted and implemented.

## Metadata and Source Files

The application may display available metadata including:

- track, album, artist, and album artist;
- track and disc numbers;
- genre and date;
- duration;
- file format and codec;
- sample rate, channel count, bit depth, and bit rate where meaningful;
- file path.

Source audio and metadata files must remain unchanged unless the user explicitly requests a modification.

Application-level metadata overrides require separate acceptance.

## Playlists and Playback History

The product may support manually managed playlists and playback-derived views such as recently or frequently played.

Any play count, skip count, history entry, or completion statistic must use a defined threshold. A brief preview or accidental start must not count as completed playback.

Smart playlists and advanced statistics require separate acceptance.

## Lyrics and Artwork

Lyrics and artwork may come from local, embedded, cached, manually selected, or separately accepted external sources.

A confirmed user selection must not be silently replaced by an automatic source.

Provider attribution and usage requirements must be respected.

External-provider failure must not prevent local playback.

Lyrics and artwork processing must not delay or destabilize playback.

## Visualization

Visualization is supplementary and must not be required to understand playback state.

Visualization work must not interfere with playback. Stale or delayed visual updates may be dropped rather than queued.

Specific visualization modes require separate acceptance.

## Data and Privacy

Local library data remains local unless the user explicitly enables an external service.

Credentials must:

- use operating-system-backed storage where available;
- never be returned to the frontend as secret values;
- never appear in logs, error messages, application databases, debug output, or serialized events.

External network access is limited to user-enabled features and identified providers.

## Reliability and Safety

The application must:

- report validation, decoding, output, provider, and persistence failures clearly;
- preserve unrelated user data after recoverable failures;
- avoid silent fallback when it would change an explicitly selected playback mode;
- avoid destructive file operations without confirmation;
- shut down owned background and audio resources cleanly.

Hardware-dependent behavior must remain manually verifiable when deterministic automated testing is impractical.

## Scope

A capability is not an accepted requirement solely because it appears in an idea, roadmap, or Issue.

New product capabilities require focused acceptance before being added here.
