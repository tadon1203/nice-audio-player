# CPU measurement

How to compare the app's CPU cost while a track plays, before and after a change.

## Threads

Profilers show these names: `decode`, `meter-analysis`, `waveform`, `worker` (playback worker), `cpal_wasapi_out` (output callback, named by cpal).

## Manual procedure (Windows)

1. `pnpm package` and install, or run `pnpm dev` (dev adds Vite overhead; compare like with like).
2. Play a local track at normal volume, window visible and idle (no pointer movement). Do this twice: Now Playing closed, and Now Playing open on Lyrics.
3. Wait 10 s, then record 30 s in Task Manager > Details (or Windows Performance Monitor) for `nice-audio-player.exe` and its `msedgewebview2.exe` children: average CPU %.
4. For per-thread cost, use Process Explorer (Threads tab) on the same process, or Windows Performance Recorder with the CPU profile.
5. Note the machine, power mode and output device next to the numbers.

## Baseline (before the CPU optimization work)

Count of `requestAnimationFrame` callbacks over 3 s of mocked playback, 1920x1080, full motion (measured with a since-removed e2e trace):

| Now Playing | rAF callbacks |
| ----------- | ------------- |
| Closed      | 195           |
| On Lyrics   | 200           |

That is about 65 callbacks per second, a frame loop at display rate. Whole-process CPU numbers are not yet recorded; fill in the table when first measuring by hand.

| Now Playing | Process CPU % | Notes |
| ----------- | ------------- | ----- |
| Closed      |               |       |
| On Lyrics   |               |       |

## After (CPU optimization work, tickets 02-07)

Time is drawn by the compositor (ADR 0014), so the rAF count while a track plays should be near 0 per 3 s with meters closed, against 195-200 in the baseline. The backend sleeps to deadlines, publishes the position at 1 Hz, and analyses waveforms at background priority.

These numbers still need a hand measurement with the procedure above; record them beside the baseline, on the same machine and power mode.

| Now Playing | rAF callbacks / 3 s | Process CPU % | Notes |
| ----------- | ------------------- | ------------- | ----- |
| Closed      |                     |               |       |
| On Lyrics   |                     |               |       |
