# 0003: The output stream spans tracks for gapless playback

The behavior (when the next track opens, what is trimmed) is in [requirements.md](../requirements.md).

A session opens its output stream once, not once per track or per seek. A second stream per seek was slow, and it could fail on devices that allow only one stream. A seek builds a new Pipeline (decoder, sample queue, decode thread). The worker hands its queue to the running cpal callback through a lock-free, single-slot handoff (the `triple_buffer` crate). The newest handoff wins. The callback drops nothing on the audio thread. Position reports and completion events carry the Pipeline id, and the app ignores reports from a replaced Pipeline.

The stream stays open across track changes while the audio format (sample rate, channels) stays the same. The worker builds the next track's Pipeline ahead of time. It hands the sample queue to the running callback with the same single-slot handoff that a seek uses. Each track is still its own Playback with a new playback id, so position events, waveforms and revisions keep their meaning.

- If the next track's format differs, the app reopens the stream and accepts a short gap. Resampling into the running stream would be gapless. But it would make the Path a resampled one and rule out bit-perfect playback later.
- The prefetched Pipeline is a disposable cache. Any change to what plays next discards it.
- Prefetching needs sources that the positioned file reader reads. Loading the whole file into memory first would double memory use.
- The handover happens in the output callback, not in the worker.
  - The next queue is chained to the playing one, through a second single-slot handoff beside the seek handoff. The chain is void once the stream plays anything else.
  - When the playing queue runs dry, the callback continues into the chained one in the same buffer. It reports the end of the first track as heard.
  - The worker moves its track state on when it hears that end, with a new playback id.
  - A seek, a device change or a skip replaces or drops the stream's queue. A chain never outlives the track it was made for.
- A shuffled queue that repeats is shuffled only when it wraps. The next track is not known ahead, so that boundary is not gapless.
- Symphonia 0.6 reads no trim data from M4A, so M4A keeps its encoder silence ([research](../research/symphonia-gapless-trim.md)).
