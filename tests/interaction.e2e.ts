import { expect, test, type Page } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";
import { workspaceViewport } from "./fixtures/locators";

test.beforeEach(async ({ page }) => {
  await installNativeApi(page);
  await page.setViewportSize({ width: 1360, height: 900 });
});

async function playFirstTrack(page: Page) {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  return dock;
}

const upcomingTitles = (page: Page) =>
  page
    .getByRole("dialog", { name: "Queue" })
    .locator('[data-tone="upcoming"] p.truncate.text-sm')
    .allTextContents();

test("Escape closes Now Playing, and Ctrl+L does nothing without a track", async ({ page }) => {
  await page.goto("/library/tracks");
  const layer = page.getByRole("region", { name: "Now Playing" });
  await page.locator("body").click();
  await page.keyboard.press("Control+l");
  await expect(layer).toHaveCount(0);

  await playFirstTrack(page);
  await page.locator("body").click();
  await page.keyboard.press("Control+l");
  await expect(layer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(layer).toHaveCount(0);
});

test("the dock toggles say whether they are on", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const nowPlaying = dock.getByRole("button", { name: "Now Playing", exact: true });
  const queue = dock.getByRole("button", { name: "Queue", exact: true });
  await expect(nowPlaying).toHaveAttribute("aria-pressed", "false");
  await nowPlaying.click();
  await expect(nowPlaying).toHaveAttribute("aria-pressed", "true");
  await nowPlaying.click();
  await queue.click();
  await expect(queue).toHaveAttribute("aria-pressed", "true");
});

test("the filter takes focus from the slash key", async ({ page }) => {
  await page.goto("/library/tracks");
  const filter = page.getByRole("searchbox", { name: "Search tracks" });
  await expect(filter).toBeVisible();
  await page.keyboard.press("/");
  await expect(filter).toBeFocused();
});

test("the volume slider runs in decibels and Ctrl+arrows step by one", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const volume = dock.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveAttribute("aria-valuemax", "60");
  await page.locator("body").click();
  const readout = dock.locator('[data-region="volume-readout"]');
  await page.keyboard.press("Control+ArrowDown");
  await expect(readout).not.toHaveText("−2.9 dB");
  const lower = await volume.getAttribute("aria-valuenow");
  await page.keyboard.press("Control+ArrowUp");
  await expect
    .poll(async () => Number(await volume.getAttribute("aria-valuenow")))
    .toBeGreaterThan(Number(lower));
});

test("a queue row plays on click", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const before = await upcomingTitles(page);
  const third = before[2]!;
  await page
    .getByRole("dialog", { name: "Queue" })
    .getByRole("button", { name: `Play ${third}`, exact: true })
    .click();
  await expect(dock.getByText(third, { exact: true }).first()).toBeVisible();
  // The tracks before it are behind us now, so the queue continues after it.
  await expect.poll(async () => (await upcomingTitles(page))[0]).toBe(before[3]);
});

test("Play next and Add to queue put a track where they say", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  const table = page.getByRole("table", { name: "Library tracks" });

  await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Play next" }).click();
  await expect.poll(async () => (await upcomingTitles(page))[0]).toBe("Track 010");

  await table.getByRole("row", { name: /Track 011/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to queue" }).click();
  // The queue is long and only a window of it is mounted: the end is where the new track is.
  await panel.locator(".overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(async () => (await upcomingTitles(page)).at(-1)).toBe("Track 011");
});

test("clearing the upcoming tracks can be undone", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  await expect(panel.locator('[data-tone="upcoming"]').first()).toBeVisible();
  await panel.getByRole("button", { name: "Clear upcoming" }).click();
  await expect(panel.getByRole("status")).toContainText(/Cleared \d+ tracks/);
  await expect(panel.locator('[data-tone="upcoming"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(panel.locator('[data-tone="upcoming"]').first()).toBeVisible();
});

test("the Now Playing title stays selectable text after a track change", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await dock.getByRole("button", { name: "Next track" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  const title = layer.locator("p").filter({ hasText: "Track 002" }).first();
  await expect(title).toBeVisible();
  // Real text in the flow: once the overlay has gone the text is the element's own content.
  await expect(title.locator('[aria-hidden="true"]')).toHaveCount(0, { timeout: 5_000 });
  await expect(title).toHaveText("Track 002");
});

test("artist and album in Now Playing open their pages", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer.getByText("2019")).toBeVisible();
  await layer.getByRole("link", { name: "Test album" }).click();
  await expect(page).toHaveURL(/\/library\/albums\//);
  await expect(layer).toHaveCount(0);
});

test("reaching the end of a long list loads the next page without a button", async ({ page }) => {
  await page.goto("/library/tracks");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const table = page.getByRole("table", { name: "Library tracks" });
  const viewport = workspaceViewport(page);
  await expect
    .poll(async () => {
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return table.getByRole("row", { name: /Track 139/ }).count();
    })
    .toBe(1);
});
