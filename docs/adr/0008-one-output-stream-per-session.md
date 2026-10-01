# 0008: One output stream per session

A session opens its output stream once. A seek builds a new pipeline (decoder, queue, decode thread) and, when its prebuffer is ready, hands the new queue to the running cpal callback through a lock-free single-slot handoff (the `triple_buffer` crate; the newest unread handoff wins). The callback switches at its next run, restarts its frame count and drops nothing on the audio thread: the queue it leaves goes back into the slot for the worker to free.

- Opening a second stream per seek was slow and could fail on devices that allow only one stream.
- The old queue keeps playing until the new prebuffer is ready, so a seek has no audible gap beyond decode latency. The callback pads only underruns with silence.
- Position reports and completion events carry the pipeline id, so reports of a replaced pipeline are ignored.
