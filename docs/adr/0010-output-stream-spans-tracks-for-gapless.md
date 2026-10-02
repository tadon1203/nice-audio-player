# 0010: The output stream spans tracks for gapless playback

Supersedes the "one session = one track" part of [0008](./0008-one-output-stream-per-session.md); its lock-free handoff stays.

The output stream is opened once and kept across track changes while the audio format (sample rate, channels) stays the same. The next track's pipeline is built ahead (about 10 s before the end, or right after load for a short track) and its queue is handed to the running callback with the same single-slot handoff used for seeks. Each track is still its own Playback with a new playback id, so position events, waveforms and revisions keep their meaning.

- When the next track's format differs, the stream is reopened and a short gap is accepted. Resampling it into the running stream would be gapless but would turn the Path into a resampled one and rule out bit-perfect playback later.
- The prefetched pipeline is a disposable cache: any change to what plays next (play next, shuffle, repeat one, removal) discards it.
- Prefetching needs sources read through the positioned file reader instead of loading the whole file into memory first, or memory use doubles.
- Gapless has no setting. Encoder delay and padding are trimmed where the file carries them (MP3 LAME header, M4A); FLAC and WAV are exact.
