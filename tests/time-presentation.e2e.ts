import { PNG } from "pngjs";
import { testLibrary } from "./fixtures/data";
import { expect, test } from "./fixtures/test";
import { readableText } from "./fixtures/readability";

test.use({ library: testLibrary({ artwork: true }), viewport: { width: 1920, height: 1080 } });
const white = new PNG({ width: 1, height: 1 });
white.data.fill(255);
test.beforeEach(async ({ page }) => {
  await page.route("http://nice-artwork.localhost/**", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG.sync.write(white) }),
  );
});

test("both Queue views retain readable metadata and ordered time tones over bright artwork", async ({
  page,
}) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: "Next track" }).click();
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  const past = await readableText(page, panel.locator('[data-tone="past"] p').first());
  const present = await readableText(page, panel.locator('[data-tone="current"] p').first());
  const future = await readableText(page, panel.locator('[data-tone="upcoming"] p').first());
  expect(past.foreground[0]).toBeLessThan(future.foreground[0]!);
  expect(future.foreground[0]).toBeLessThan(present.foreground[0]!);
  await readableText(page, panel.locator('[data-tone="past"] p').last());
  await readableText(page, panel.locator('[data-tone="past"] span.tabular-nums').last());
  await page.keyboard.press("Escape");
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const queue = page.getByRole("list", { name: "Queue" });
  const now = queue.locator('[aria-current="true"]');
  await expect(now).toBeVisible();
  const readingPast = await readableText(page, queue.getByText("Test track", { exact: true }));
  expect(readingPast.rgb).toEqual(past.rgb);
  await readableText(page, now.getByText("Test artist", { exact: true }));
  const bounds = (await queue.boundingBox())!;
  let farthest = now;
  for (const row of await queue.getByRole("listitem").all()) {
    const box = await row.boundingBox();
    if (box && box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height) farthest = row;
  }
  await readableText(page, farthest.getByText("Test artist", { exact: true }));
  await readableText(page, farthest.locator("span.tabular-nums").last());
});

test("lyrics retain artwork ink, readable Gutter times and equal ink while reading freely", async ({
  page,
  native,
  player,
}) => {
  native.respond("getTrackLyrics", ({ trackId }) => ({
    status: "resolved",
    trackId,
    notice: null,
    document: {
      source: "sidecar",
      language: null,
      content: {
        kind: "timed",
        lines: Array.from({ length: 30 }, (_, i) => ({
          startMs: i * 10_000,
          text: `日本語の長い歌詞 ${i + 1} — 変わらない文字の大きさと読みやすさ`,
        })),
      },
    },
  }));
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await player.reportPosition(70_000);
  const current = page.locator('[aria-current="true"] [data-slot="time-ink"]');
  await expect(current).toContainText("歌詞 8");
  await readableText(page, current);
  const gutter = page.getByRole("button", { name: "Seek to 1:10" });
  await gutter.hover();
  await readableText(page, gutter.locator("span"));
  await gutter.focus();
  await readableText(page, gutter.locator("span"));
  await page.locator('[data-mode="follow"]').hover();
  await page.mouse.wheel(0, 120);
  await expect(page.locator('[data-mode="free"]')).toBeVisible();
  await expect
    .poll(async () => {
      const inks = await page
        .locator('[data-mode="free"] [data-slot="time-ink"]')
        .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
      return new Set(inks).size;
    })
    .toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-mode="follow"]')).toBeVisible();
});
