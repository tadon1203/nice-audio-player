# 0014: Time is drawn by the compositor, not by a frame loop

Nothing that follows the playing position runs on the main thread every frame. The Playback clock is read in two ways only:

- **At a boundary**: a consumer says when it next needs to wake (the next whole second, the next lyric line, three seconds before the end) and the clock sets a timer, re-armed on every report and jump and stopped while paused.
- **As a driven animation**: a consumer declares keyframes over the track's time (transform and opacity only) and the clock runs one Web Animation per element across the whole track, setting its `currentTime` from the reported position, and pausing, playing and holding all of them together. The compositor advances them; the main thread does nothing between reports.

The playing position, fills, interval lines and the Light's breathing are all driven animations; the Light's curve is the track's RMS smoothed once, ahead of time, over the whole track (playback speed is always 1, so a position fixes the level).

Before this, one `requestAnimationFrame` loop ran for as long as anything was mounted that drew time, and the dock always is, so playback cost a style, layout and paint pass on every display frame (144 a second on a 144 Hz display) for a 2px line. Consumers that only waited for a boundary rode the same loop, while lyric sync already used timers: two ways of reading one clock.

- **Exception**: a transient movement with a known end may use a frame loop (the seek glide, which moves every driven animation's `currentTime` for 300 ms; `tween-number`; Kinetic text). A loop that lives as long as playback does is never allowed.
- **Clip paths and `left` are not animated**, because the compositor cannot run them. The played part of the waveform is revealed by an outer translate countered by an inner one, and the playhead by a full-width translate.
- **The backend keeps the same shape**: its threads sleep until the next deadline or input instead of ticking, and the position event is a 1 Hz correction, not a source of motion.
- Alternatives rejected: keeping the frame loop and throttling it (still a resident main-thread loop, and visibly coarse at low rates); a frame loop only for boundary consumers (two ways again); a public frame-by-frame subscription "for debugging" (it would be used).
