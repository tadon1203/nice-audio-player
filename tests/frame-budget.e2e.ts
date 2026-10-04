import { testLibrary } from "./fixtures/data";
import { motionMs } from "./fixtures/motion";
import { test } from "./fixtures/test";
import { expect } from "./fixtures/test";

test.use({ reducedMotion: "no-preference", library: testLibrary({ artwork: true }) });

const TRACE_MS = 3000;
/** A position report may restyle once or twice; steady playback may not. */
const REPORT_ALLOWANCE = 4;

const lyrics = {
  status: "resolved",
  trackId: "track-1",
  notice: null,
  document: {
    source: "sidecar",
    language: null,
    content: {
      kind: "timed",
      lines: Array.from({ length: 60 }, (_, index) => ({
        startMs: index * 3_000,
        text: `This is lyric line number ${index + 1} of the song`,
      })),
    },
  },
} as const;

// Time is drawn by the compositor (ADR 0014), not a frame loop. Enabled in ticket 03, when the
// per-frame loops are gone; until then it fails against the current code. Meters are not mounted
// here, so they are excluded. Paint has no counter in `Performance.getMetrics`; layout and style
// recalculation stand in for per-frame work.
for (const nowPlaying of ["closed", "on Lyrics"] as const) {
  test.skip(`playback runs no frame loop with Now Playing ${nowPlaying} (enable in ticket 03)`, async ({
    page,
    native,
    player,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      const w = window as unknown as { __rafCount: number };
      w.__rafCount = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf((time) => {
          w.__rafCount += 1;
          callback(time);
        });
    });
    await page.goto("/library/tracks");
    native.respond("getTrackLyrics", lyrics);
    await page.getByRole("button", { name: "Play Test track" }).click();
    const dock = page.getByRole("contentinfo", { name: "Playback controls" });
    await dock.getByRole("button", { name: "Pause", exact: true }).waitFor();
    await player.publishWaveform();
    if (nowPlaying === "on Lyrics") {
      await dock.getByRole("button", { name: "Open Now Playing" }).click();
      await page.getByRole("region", { name: "Now Playing" }).waitFor();
      await page.waitForTimeout(motionMs("large"));
    }

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const read = async () => {
      const { metrics } = await cdp.send("Performance.getMetrics");
      const rafCount = await page.evaluate(
        () => (window as unknown as { __rafCount: number }).__rafCount,
      );
      const values: Record<string, number> = Object.fromEntries(
        metrics.map((m) => [m.name, m.value]),
      );
      return { ...values, rafCount } as Record<string, number>;
    };
    const before = await read();
    await page.waitForTimeout(TRACE_MS);
    const after = await read();
    const delta = (name: string) => (after[name] ?? 0) - (before[name] ?? 0);

    expect(delta("rafCount")).toBe(0);
    expect(delta("LayoutCount")).toBeLessThanOrEqual(REPORT_ALLOWANCE);
    expect(delta("RecalcStyleCount")).toBeLessThanOrEqual(REPORT_ALLOWANCE);
  });
}
