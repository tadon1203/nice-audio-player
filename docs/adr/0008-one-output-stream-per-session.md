# 0008: One output stream per session

Partly superseded by [0010](./0010-output-stream-spans-tracks-for-gapless.md). The stream now outlives a track when the next track has the same format.

A session opens its output stream once. A seek builds a new Pipeline (decoder, sample queue, decode thread). When its prebuffer is ready, the worker hands the new sample queue to the running cpal callback. The handoff is lock-free and single-slot (the `triple_buffer` crate). The newest unread handoff wins. The callback switches at its next run and restarts its frame count. It drops nothing on the audio thread: the queue it leaves goes back into the slot, and the worker frees it.

- Opening a second stream for each seek was slow. It could also fail on devices that allow only one stream.
- The old sample queue keeps playing until the new prebuffer is ready. A seek has no audible gap beyond decode latency. The callback pads only underruns with silence.
- Position reports and completion events carry the Pipeline id. The app ignores reports from a replaced Pipeline.
