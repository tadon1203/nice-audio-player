import { type Page } from "@playwright/test";
import { albumSequence } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

// Real timing: the rest of the suite runs with reduced motion (see playwright.config.ts).
// These tests check invariants sampled every frame, never screenshots of the motion.
test.use({ reducedMotion: "no-preference" });

test.beforeEach(async ({ page, player, library }) => {
  player.setSequence(albumSequence(library));
  await page.setViewportSize({ width: 1360, height: 900 });
});

async function playAlbum(page: Page) {
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await page.getByRole("button", { name: "Play album" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  return dock;
}

/** Runs `action`, sampling `measure` on every animation frame until `ms` after it. */
async function sampleFrames<T>(
  page: Page,
  measure: () => T,
  action: () => Promise<void>,
  ms = 900,
): Promise<T[]> {
  await page.evaluate(
    ([source]) => {
      const fn = new Function(`return (${source})`)() as () => unknown;
      const samples: unknown[] = [];
      let running = true;
      const loop = () => {
        if (!running) return;
        samples.push(fn());
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      (window as unknown as Record<string, unknown>).__frames = {
        stop: () => {
          running = false;
          return samples;
        },
      };
    },
    [measure.toString()] as const,
  );
  await action();
  await page.waitForTimeout(ms);
  return page.evaluate(() =>
    (window as unknown as { __frames: { stop: () => unknown[] } }).__frames.stop(),
  ) as Promise<T[]>;
}

test("the dock's bottom edge and transport never move while Now Playing opens and closes", async ({
  page,
}) => {
  const dock = await playAlbum(page);
  const measure = () => {
    const footer = document.querySelector('[data-slot="playback-dock"]')!.getBoundingClientRect();
    const core = document.querySelector('[data-region="playback-core"]')!.getBoundingClientRect();
    return { bottom: footer.bottom, core: core.top };
  };

  for (const label of ["Open Now Playing", "Close Now Playing"]) {
    const frames = await sampleFrames(page, measure, () =>
      dock.getByRole("button", { name: label }).click(),
    );
    expect(frames.length).toBeGreaterThan(10);
    for (const frame of frames) {
      expect(frame.bottom).toBeCloseTo(frames[0]!.bottom, 0);
      expect(frame.core).toBeCloseTo(frames[0]!.core, 0);
    }
  }
});

test("the transport buttons keep their size while the dock changes height", async ({ page }) => {
  const dock = await playAlbum(page);
  const measure = () => {
    const button = document.querySelector('button[aria-label="Next track"]')!;
    const rect = button.getBoundingClientRect();
    const scale = getComputedStyle(
      button.closest('[data-slot="playback-dock"]')!.parentElement!,
    ).transform;
    return { height: rect.height, scale };
  };
  const frames = await sampleFrames(page, measure, () =>
    dock.getByRole("button", { name: "Open Now Playing" }).click(),
  );
  for (const frame of frames) {
    expect(frame.height).toBeCloseTo(frames[0]!.height, 1);
    expect(frame.scale).toBe("none");
  }
});

test("changing track never leaves the dock without a visible title", async ({ page }) => {
  const dock = await playAlbum(page);
  const measure = () => {
    const titles = [
      ...document.querySelectorAll<HTMLElement>('[data-region="playback-identity"] button[title]'),
    ];
    return Math.max(
      0,
      ...titles.map((title) => Number(getComputedStyle(title.parentElement!).opacity)),
    );
  };
  const frames = await sampleFrames(page, measure, () =>
    dock.getByRole("button", { name: "Next track" }).click(),
  );
  await expect(dock.getByText("Track 002", { exact: true }).first()).toBeVisible();
  // Skip the first frame, sampled before the click reached the page.
  for (const opacity of frames.slice(1)) expect(opacity).toBeGreaterThan(0.1);
});

test("the progress fill advances every frame between position reports", async ({ page }) => {
  const dock = await playAlbum(page);
  // The mock sends no position events on its own, so every change here is interpolation.
  const measure = () => {
    const layers = document.querySelectorAll<HTMLElement>(
      '[data-slot="playback-dock"] [data-region="seek"] > div[aria-hidden="true"]',
    );
    const played = layers[1]!;
    const match = /inset\([^)]*?([\d.]+)%[^)]*\)/.exec(getComputedStyle(played).clipPath);
    return match ? Number(match[1]) : -1;
  };
  const frames = await sampleFrames(page, measure, async () => {
    await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  });
  const insets = frames.filter((value) => value >= 0);
  expect(insets.length).toBeGreaterThan(10);
  for (let index = 1; index < insets.length; index += 1) {
    expect(insets[index]!).toBeLessThanOrEqual(insets[index - 1]!);
  }
  // Steps between reports would show as a handful of values; a frame-by-frame fill shows many.
  expect(new Set(insets).size).toBeGreaterThan(10);
});

test("an album's artwork moves from its tile to the details header", async ({ page }) => {
  await page.goto("/library/albums");
  const tile = page.getByRole("link", { name: "Open album Test album by Test artist" });
  const tileBox = (await tile.locator('[data-slot="artwork"]').boundingBox())!;
  const measure = () => {
    // The Sleeve in flight is a clone drawn over the page; once it lands, the header's own.
    const artwork =
      document.querySelector('[data-shared-element="flying"]') ??
      document.querySelector('main [data-slot="artwork"]');
    const rect = artwork?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y } : null;
  };
  const frames = (await sampleFrames(page, measure, () => tile.click(), 1200)).filter(
    (frame) => frame !== null,
  );
  const first = frames[0]!;
  // It starts where the tile was and travels (many distinct positions), rather than appearing
  // at the destination.
  expect(Math.abs(first.x - tileBox.x)).toBeLessThan(30);
  expect(Math.abs(first.y - tileBox.y)).toBeLessThan(30);
  expect(
    new Set(frames.map((frame) => `${Math.round(frame.x)},${Math.round(frame.y)}`)).size,
  ).toBeGreaterThan(3);
});
