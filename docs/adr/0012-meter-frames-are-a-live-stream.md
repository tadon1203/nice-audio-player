# 0012: Meter frames are a live stream, not state

The app measures the Spectrum and the Level meter from the audio that leaves it. It sends the results as a stream of Meter frames on their own channel. It does not use the state events of ADRs 0003 and 0009. The behavior and numbers are in [requirements.md](../requirements.md) and [the ballistics research](../research/spectrum-analyzer-meter-ballistics.md).

- The output callback copies the stereo samples it has just written (after volume) into a lock-free ring. If the ring is full, it drops them. It never waits. Nothing in the callback allocates, locks or analyses.
- A separate analysis thread reads the ring. It measures a 30-band one-third-octave filter bank and the left and right peak and RMS. For each band it takes the louder of left and right. So mono is not 6 dB louder, and an inverted pair does not cancel.
- The thread measures frames at 120 Hz. The host sends them at 60 Hz, in a binary Tauri channel, only while a meter is visible (Now Playing open on Meters, window visible).
  - Each sent frame combines the frames measured since the last one: bands and peaks by maximum, RMS by mean energy, clip by OR. No peak is lost.
  - Every message costs an eval in the WebView, and the renderer kept only the maximum anyway.
  - Nothing is sent while the output is silent and unchanged.
  - The renderer subscribes and unsubscribes. Nothing is measured otherwise.
- The renderer draws on its own animation frame, at the display's refresh rate. It keeps only the latest frames. It takes the maximum of those that arrived since the last draw. It applies the ballistics (fall, hold, cap) with the real elapsed time, so the motion is the same at 60 and 144 Hz. The frame loop stops once every Bar and Cap has fallen to the floor.
- A frame measures a moment. It is not the state of something. The app skips a missed frame and never keeps or replays one. So it is not pushed like the Waveform (ADR 0009), whose answer must survive being late. A late meter frame has no meaning.
- The callback timestamps a frame when it hands the samples to the device. The playback position uses the same moment, so the meter and the position agree. The app does not estimate or correct the output latency.
- Rejected:
  - Carrying the levels in `PlaybackPositionChanged`: it runs at 20 Hz, batched with state events, and is too slow to look live.
  - Polling a command from the renderer on every frame: it costs a round trip per frame for data that nobody needs twice.
  - Analysing in the renderer: it never has the samples.
