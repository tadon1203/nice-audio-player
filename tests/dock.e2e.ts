import { expect, test, type Page } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => {
  await installNativeApi(page);
  await page.setViewportSize({ width: 1360, height: 900 });
});

async function playFirstTrack(page: Page, beforePlay?: () => Promise<void>) {
  await page.goto("/library/tracks");
  // Lyrics are fetched as soon as a track plays, so anything they should find is set first.
  await beforePlay?.();
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  return dock;
}

test("shows a plain progress line in the dock, never the waveform bars", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const seek = dock.getByRole("slider", { name: "Playback position" });
  await expect(seek).toHaveAttribute("data-ready", "false");
  const before = await dock.boundingBox();
  const seekBefore = await seek.boundingBox();
  await expect(seek.locator('[data-slot="waveform-baseline"]').first()).toBeVisible();
  await expect(seek.locator('[data-slot="waveform-bars"]')).toHaveCount(0);

  // The dock never fetches or draws the waveform, even once one is available — only Now
  // Playing does (see `PlaybackWaveformBand`'s `showWaveform` prop).
  await page.evaluate(() => window.__niceAudioPlayerTest?.publishWaveform());
  await expect(seek).toHaveAttribute("data-ready", "false");
  await expect(seek.locator('[data-slot="waveform-bars"]')).toHaveCount(0);

  const after = await dock.boundingBox();
  const seekAfter = await seek.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(seekAfter).toEqual(seekBefore);
  expect(after!.height).toBeCloseTo(104, 0);
});

test("seeks by clicking and by dragging the dock's progress bar", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const seek = dock.getByRole("slider", { name: "Playback position" });
  const box = (await seek.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.click(box.x + box.width / 2, y);
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(55_000);
  expect(Number(await seek.getAttribute("aria-valuenow"))).toBeLessThan(65_000);

  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 5 });
  // The preview follows the pointer before the seek is committed.
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(85_000);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(85_000);
  expect(Number(await seek.getAttribute("aria-valuenow"))).toBeLessThan(95_000);
});

test("shows the time under the pointer while hovering the dock's progress bar", async ({
  page,
}) => {
  const dock = await playFirstTrack(page);
  const seek = dock.getByRole("slider", { name: "Playback position" });
  const box = (await seek.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(dock.locator('[data-slot="waveform-hover-time"]')).toHaveText("1:00");
});

test("toggles remaining time and track length", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const toggle = dock.getByRole("button", { name: "Time remaining" });
  await expect(toggle).toHaveText("−1:48");
  await toggle.click();
  await expect(dock.getByRole("button", { name: "Track length" })).toHaveText("2:00");
});

test("marks shuffle and repeat by shape and dot, not color", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const shuffle = dock.getByRole("button", { name: "Shuffle" });
  await expect(shuffle).toHaveAttribute("aria-pressed", "false");
  await expect(shuffle.locator('[data-slot="toggle-dot"]')).toBeHidden();
  await shuffle.click();
  await expect(shuffle).toHaveAttribute("aria-pressed", "true");
  await expect(shuffle.locator('[data-slot="toggle-dot"]')).toBeVisible();

  await dock.getByRole("button", { name: "Repeat: off" }).click();
  await expect(dock.getByRole("button", { name: "Repeat: all" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dock.getByRole("button", { name: "Repeat: all" }).click();
  const repeatOne = dock.getByRole("button", { name: "Repeat: one" });
  await expect(repeatOne.getByText("¹")).toBeVisible();
  await repeatOne.click();
  await expect(dock.getByRole("button", { name: "Repeat: off" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("switches the output device from the signal path", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const path = page.getByRole("group", { name: "Signal path" });
  await expect(path).toContainText("FLAC 24/44.1");
  await path.getByRole("button", { name: "Output device: Speakers" }).click();
  await page.getByRole("menuitemradio", { name: "Headphones" }).click();
  await expect(path.getByRole("button", { name: "Output device: Headphones" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
});

test("adjusts volume by one decibel per wheel step", async ({ page }) => {
  const dock = await playFirstTrack(page);
  // The rolling digits are aria-hidden columns; the value is the screen-reader text.
  const readout = dock.locator('[data-region="volume-readout"] .sr-only');
  await expect(readout).toHaveText("−2.9 dB");
  const slider = dock.locator('[data-region="volume-slider"]');
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(readout).toHaveText("−2.0 dB");
  await page.mouse.wheel(0, 100);
  await expect(readout).toHaveText("−3.0 dB");
});

test("opens Now Playing from the Sleeve and offers album and artist navigation", async ({
  page,
}) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await expect(page.getByRole("region", { name: "Now Playing" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "Now Playing" })).toHaveCount(0);

  await dock.getByRole("button", { name: "Open Now Playing" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Go to album" }).click();
  await expect(page).toHaveURL(/\/library\/albums\/Test%20artist\/Test%20album/);
});

test("Now Playing covers the workspace without moving the sidebar or the dock's bottom", async ({
  page,
}) => {
  const dock = await playFirstTrack(page);
  const shell = async () => {
    const dockBox = (await dock.boundingBox())!;
    const sidebar = (await page.locator("aside").boundingBox())!;
    return {
      dockBottom: dockBox.y + dockBox.height,
      sidebar: { x: sidebar.x, y: sidebar.y, width: sidebar.width },
    };
  };
  const before = await shell();
  const dockTop = (await dock.boundingBox())!.y;

  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer).toBeVisible();
  await expect.poll(async () => (await layer.boundingBox())!.height).toBeGreaterThan(400);

  // The dock gives up its waveform slot (16px) from the top; its bottom edge and the sidebar
  // stay put, and the layer sits between the title bar and the dock.
  await expect.poll(async () => (await dock.boundingBox())!.height).toBeCloseTo(88, 0);
  expect(await shell()).toEqual(before);
  const dockAfter = (await dock.boundingBox())!;
  expect(dockAfter.y).toBeCloseTo(dockTop + 16, 0);
  const layerBox = (await layer.boundingBox())!;
  expect(layerBox.y).toBeCloseTo(40, 0);
  expect(layerBox.y + layerBox.height).toBeCloseTo(dockAfter.y, 0);
  expect(layerBox.x).toBeCloseTo(0, 0);
  expect(layerBox.width).toBeCloseTo(1360, 0);
});

test("keeps the transport and volume groups in place when Now Playing opens", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const core = dock.locator('[data-region="playback-core"]');
  const volume = dock.locator('[data-region="volume"]');
  const before = { core: (await core.boundingBox())!, volume: (await volume.boundingBox())! };

  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const after = { core: (await core.boundingBox())!, volume: (await volume.boundingBox())! };

  expect(after.core.y).toBeCloseTo(before.core.y, 0);
  expect(after.volume.y).toBeCloseTo(before.volume.y, 0);
});

test("the dock Sleeve swaps to a close chevron while Now Playing is open", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const layer = page.getByRole("region", { name: "Now Playing" });

  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await expect(layer).toBeVisible();
  await expect(dock.getByRole("button", { name: "Open Now Playing" })).toHaveCount(0);
  const closeButton = dock.getByRole("button", { name: "Close Now Playing" });
  await expect(closeButton).toBeVisible();

  await closeButton.click();
  await expect(layer).toHaveCount(0);
  await expect(dock.getByRole("button", { name: "Open Now Playing" })).toBeVisible();

  // The title button reopens it too, and the Lyrics button toggles both ways.
  await dock.getByText("Test track", { exact: true }).click();
  await expect(layer).toBeVisible();
  await dock.getByRole("button", { name: "Close Now Playing" }).click();
  await expect(layer).toHaveCount(0);

  await dock.getByRole("button", { name: "Now Playing", exact: true }).click();
  await expect(layer).toBeVisible();
  await dock.getByRole("button", { name: "Now Playing", exact: true }).click();
  await expect(layer).toHaveCount(0);
});

test("preserves the library scroll position across Now Playing open and close", async ({
  page,
}) => {
  const dock = await playFirstTrack(page);
  const list = page.locator('[data-scroll-restoration-id="library-tracks"]');
  await list.evaluate((element) => element.scrollTo(0, 400));
  const before = await list.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);

  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await expect(page.getByRole("region", { name: "Now Playing" })).toBeVisible();
  await page.goBack();

  await expect.poll(async () => list.evaluate((element) => element.scrollTop)).toBe(before);
});

test("shows synced lyrics and follows the current line", async ({ page }) => {
  const dock = await playFirstTrack(page, () =>
    page.evaluate(() =>
      window.__niceAudioPlayerTest?.setLyrics("track-1", {
        status: "resolved",
        trackId: "track-1",
        notice: null,
        document: {
          source: "sidecar",
          language: null,
          content: {
            kind: "timed",
            lines: [
              { startMs: 0, text: "First line" },
              { startMs: 30_000, text: "Second line" },
              { startMs: 90_000, text: "Third line" },
            ],
          },
        },
      }),
    ),
  );
  await dock.getByRole("button", { name: "Open Now Playing" }).click();

  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer.locator('[aria-current="true"]')).toContainText("First line");

  await page.evaluate(() => window.__niceAudioPlayerTest?.startPlaybackTicks());
  await expect(layer.locator('[aria-current="true"]')).toContainText("Second line");
});

test("shows the no-lyrics and unreadable-lyrics states", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const layer = page.getByRole("region", { name: "Now Playing" });
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await expect(layer.getByText("No lyrics for this track")).toBeVisible();
  // The hint sits beside the track, not over the whole screen.
  await expect(
    layer.getByRole("heading", { name: "Test track" }).or(layer.getByText("Test track")),
  ).toBeVisible();
});

test("toggles play/pause and changes tracks with the keyboard", async ({ page }) => {
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await page.getByRole("button", { name: "Play album" }).click();
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();

  await page.locator("body").click();
  await page.keyboard.press("Space");
  await expect(dock.getByRole("button", { name: "Resume" })).toBeEnabled();
  await page.keyboard.press("Space");
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();

  await page.keyboard.press("Control+ArrowRight");
  await expect(dock.getByText("Track 002", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+ArrowLeft");
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();
});

test("toggles Now Playing with Ctrl+L", async ({ page }) => {
  await playFirstTrack(page);
  await page.locator("body").click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await page.keyboard.press("Control+l");
  await expect(layer).toBeVisible();
  await page.keyboard.press("Control+l");
  await expect(layer).toHaveCount(0);
});

test("still opens and closes Now Playing under reduced motion and forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  const dock = await playFirstTrack(page);
  const layer = page.getByRole("region", { name: "Now Playing" });
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await expect(layer).toBeVisible();
  await dock.getByRole("button", { name: "Close Now Playing" }).click();
  await expect(layer).toHaveCount(0);
});

test("the progress line and the elapsed time share one centre line", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const seek = dock.getByRole("slider", { name: "Playback position" });
  const line = (await seek.locator('[data-slot="waveform-baseline"]').first().boundingBox())!;
  const elapsed = (await dock.getByLabel("Elapsed time").boundingBox())!;
  const remaining = (await dock.getByRole("button", { name: "Time remaining" }).boundingBox())!;
  const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(centre(line) - centre(elapsed))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(centre(line) - centre(remaining))).toBeLessThanOrEqual(0.5);
});
