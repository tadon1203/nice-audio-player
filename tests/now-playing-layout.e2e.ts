import { type Page } from "@playwright/test";
import type { Native } from "./fixtures/native-api";
import { motionMs } from "./fixtures/motion";
import { expect, test } from "./fixtures/test";

const SIZES = [
  { width: 1100, height: 680 },
  { width: 1360, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const timedLyrics = {
  status: "resolved",
  trackId: "track-1",
  notice: null,
  document: {
    source: "sidecar",
    language: null,
    content: {
      kind: "timed",
      lines: Array.from({ length: 30 }, (_, index) => ({
        startMs: index * 10_000,
        text: `This is lyric line number ${index + 1} of the song`,
      })),
    },
  },
} as const;

async function openNowPlaying(
  page: Page,
  native: Native,
  size: (typeof SIZES)[number],
  lyrics: boolean,
) {
  await page.setViewportSize(size);
  await page.goto("/library/tracks");
  if (lyrics) {
    native.respond("getTrackLyrics", timedLyrics);
  }
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer).toBeVisible();
  return layer;
}

for (const size of SIZES) {
  test(`keeps the info block clear of the waveform at ${size.width}x${size.height}`, async ({
    page,
    native,
  }) => {
    const layer = await openNowPlaying(page, native, size, true);
    const facts = layer.locator("p", { hasText: /Track \d/ }).first();
    const band = layer.getByRole("slider", { name: "Playback position" });
    await expect(facts).toBeVisible();
    const factsBox = (await facts.boundingBox())!;
    const bandBox = (await band.boundingBox())!;
    expect(factsBox.y + factsBox.height).toBeLessThanOrEqual(bandBox.y);
  });
}

test("shows the queue rail and no Up next in the waveform band at 1920 with lyrics", async ({
  page,
  native,
}) => {
  const layer = await openNowPlaying(page, native, SIZES[2], true);
  await expect(layer.getByText("Up next", { exact: true })).toBeVisible();
  await expect(layer.getByRole("button", { name: /Open the queue/ })).toBeHidden();
});

test("shows Up next in the waveform band and no rail at 1360 with lyrics", async ({
  page,
  native,
}) => {
  const layer = await openNowPlaying(page, native, SIZES[1], true);
  await expect(layer.getByRole("button", { name: /Open the queue/ })).toBeVisible();
  await expect(layer.getByText("Up next", { exact: true })).toBeHidden();
});

test("puts the current row 40% from the top of the queue without lyrics", async ({
  page,
  native,
}) => {
  const layer = await openNowPlaying(page, native, SIZES[1], false);
  const list = layer.getByRole("list", { name: "Queue" });
  await expect(list).toBeVisible();
  const current = list.locator('[aria-current="true"]');
  await expect(current).toBeVisible();
  await expect
    .poll(async () => {
      const listBox = (await list.boundingBox())!;
      const currentBox = (await current.boundingBox())!;
      return Math.abs(currentBox.y + currentBox.height / 2 - listBox.y - listBox.height * 0.4);
    })
    .toBeLessThanOrEqual(8);
});

test("keeps the artist line in place while the title animates", async ({ page, native }) => {
  const layer = await openNowPlaying(page, native, SIZES[1], false);
  const artist = layer.getByRole("link", { name: "Test artist" }).first();
  await expect(artist).toBeVisible();
  const before = (await artist.boundingBox())!;
  await page.keyboard.press("Control+ArrowRight");
  for (const wait of [0, motionMs("move") / 2, motionMs("large") * 2]) {
    await page.waitForTimeout(wait);
    const box = (await artist.boundingBox())!;
    expect(box.y).toBeCloseTo(before.y, 0);
  }
});
