# 0004: Time is drawn by the compositor, not by a frame loop

Nothing that follows the playing position runs on the main thread every frame. Code reads the Playback clock in two ways only:

- **At a boundary**: a consumer says when it next needs to wake (the next whole second, the next lyric line, three seconds before the end). The clock sets a timer. It re-arms the timer on every report and jump, and stops it while paused.
- **As a driven animation**: a consumer declares keyframes over the track's time (transform and opacity only). The clock runs one Web Animation per element across the whole track. It sets each `currentTime` from the reported position. It pauses, plays and holds all of them together. The compositor advances them. The main thread does nothing between reports.

The playing position, fills, interval lines and the Light's breathing are driven animations. The Light's curve is the track's RMS, smoothed once, ahead of time, over the whole track. Playback speed is always 1, so a position fixes the level.

Before this, one `requestAnimationFrame` loop ran as long as anything that drew time was mounted. The dock always is. So playback cost a style, layout and paint pass on every display frame (144 a second on a 144 Hz display) for a 2px line. Boundary consumers rode the same loop, while lyric sync already used timers. That was two ways to read one clock.

- **Exception**: a transient movement with a known end may use a frame loop. Examples are the seek glide (300 ms), `tween-number`, and Kinetic text. A loop that lives as long as playback does is never allowed.
- **Do not animate clip paths or `left`**. The compositor cannot run them. An outer translate, countered by an inner one, reveals the played part of the waveform. A full-width translate moves the playhead.
- **The backend has the same shape**. Its threads sleep until the next deadline or input. They do not tick. The position event is a 1 Hz correction, not a source of motion.
- Rejected:
  - Keeping the frame loop and throttling it: it is still a resident main-thread loop, and visibly coarse at low rates.
  - A frame loop only for boundary consumers: that is two ways again.
  - A public frame-by-frame subscription "for debugging": people would use it.
