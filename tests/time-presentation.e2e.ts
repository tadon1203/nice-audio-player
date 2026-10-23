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
  // One round trip: asking each of the ~140 rows for its box in turn is slow under load.
  const farthestIndex = await queue.evaluate((list) => {
    const bounds = list.getBoundingClientRect();
    let found = -1;
    list.querySelectorAll('[role="listitem"], li').forEach((row, i) => {
      const box = row.getBoundingClientRect();
      if (box.height > 0 && box.top >= bounds.top && box.bottom <= bounds.bottom) found = i;
    });
    return found;
  });
  const farthest = farthestIndex < 0 ? now : queue.getByRole("listitem").nth(farthestIndex);
  await readableText(page, farthest.getByText("Test artist", { exact: true }));
  await readableText(page, farthest.locator("span.tabular-nums").last());
});

test("lyrics retain artwork ink, readable Row index times and equal ink while reading freely", async ({
  page,
  native,
  player,
}) => {
  native.respond("lyricsTrack", ({ trackId }) => ({
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
  // The renderer extrapolates the position while playing; a slow run would scroll past the line.
  // The pause snapshot carries the script's position, so it freezes at 1:10.
  await dock.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(dock.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const current = page.locator('[aria-current="true"] [data-slot="time-ink"]');
  await expect(current).toContainText("歌詞 8");
  await readableText(page, current);
  const rowIndex = page.getByRole("button", { name: "Seek to 1:10" });
  await rowIndex.hover();
  await readableText(page, rowIndex.locator("span"));
  await rowIndex.focus();
  await readableText(page, rowIndex.locator("span"));
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
