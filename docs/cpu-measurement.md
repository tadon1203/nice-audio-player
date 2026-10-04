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

## Frame-budget test

`tests/frame-budget.e2e.ts` traces 3 s of mocked playback with Now Playing closed and on Lyrics. It expects 0 `requestAnimationFrame` callbacks and at most a few layouts and style recalculations. It is skipped until ticket 03 of `.scratch/cpu-optimization`; to measure the baseline, change `test.skip` to `test` and run `pnpm test:e2e`.

## Baseline (before the CPU optimization work)

Frame-budget trace, 3 s, mocked playback, 1920x1080, full motion:

| Now Playing | rAF callbacks |
| ----------- | ------------- |
| Closed      | 195           |
| On Lyrics   | 200           |

That is about 65 callbacks per second, a frame loop at display rate. Whole-process CPU numbers are not yet recorded; fill in the table when first measuring by hand.

| Now Playing | Process CPU % | Notes |
| ----------- | ------------- | ----- |
| Closed      |               |       |
| On Lyrics   |               |       |
