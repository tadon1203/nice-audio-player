# 0010: The output stream spans tracks for gapless playback

Supersedes the "one session = one track" part of [0008](./0008-one-output-stream-per-session.md); its lock-free handoff stays.

The output stream is opened once and kept across track changes while the audio format (sample rate, channels) stays the same. The next track's pipeline is built ahead (about 10 s before the end, or right after load for a short track) and its queue is handed to the running callback with the same single-slot handoff used for seeks. Each track is still its own Playback with a new playback id, so position events, waveforms and revisions keep their meaning.

- When the next track's format differs, the stream is reopened and a short gap is accepted. Resampling it into the running stream would be gapless but would turn the Path into a resampled one and rule out bit-perfect playback later.
- The prefetched pipeline is a disposable cache: any change to what plays next (play next, shuffle, repeat one, removal) discards it.
- Prefetching needs sources read through the positioned file reader instead of loading the whole file into memory first, or memory use doubles.
- The handover happens in the output callback, not in the worker: the next queue is chained to the one playing (a second single-slot handoff beside the seek one, void once the stream plays anything else), and when the playing queue runs dry the callback continues into the chained one within the same buffer, reporting the end of the first track as it was heard. The worker moves its track state on when that end is heard, with a new playback id. A seek, a device change or a skip replaces or drops the stream's queue, so a chain never outlives the track it was made for.
- A shuffled queue that repeats and wraps is shuffled only when it wraps, so its next track is not known ahead and that boundary is not gapless.
- Gapless has no setting. Encoder delay and padding are trimmed where the file carries them (MP3 LAME header); FLAC and WAV are exact. Symphonia 0.6 reads no trim data from M4A, so M4A keeps its encoder silence ([research](../research/symphonia-gapless-trim.md)).
