import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";
import { workspaceViewport } from "./fixtures/locators";

test.beforeEach(async ({ page }) => {
  await installNativeApi(page, { extraAlbums: 2_000 });
  await page.setViewportSize({ width: 1360, height: 900 });
});

test("a long album list keeps only the tiles near the view mounted", async ({ page }) => {
  await page.goto("/library/albums");
  const tiles = page.locator("main li[data-index]");
  await expect(tiles.first()).toBeVisible();
  const mounted = await tiles.count();
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(120);

  const viewport = workspaceViewport(page);
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  // Tiles from the middle of the list are mounted, and still few of them.
  await expect
    .poll(async () => Number(await tiles.first().getAttribute("data-index")))
    .toBeGreaterThan(300);
  expect(await tiles.count()).toBeLessThan(120);
  await expect(tiles.first().getByRole("link")).toBeVisible();
});

test("Albums keeps its scroll position across a view switch", async ({ page }) => {
  await page.goto("/library/albums");
  const tiles = page.locator("main li[data-index]");
  await expect(tiles.first()).toBeVisible();
  const viewport = workspaceViewport(page);
  await viewport.evaluate((element) => {
    element.scrollTop = 5_000;
  });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(5_000);

  await page.getByRole("link", { name: "Album Artists", exact: true }).click();
  await page.getByRole("link", { name: "Albums", exact: true }).click();
  await expect(tiles.first()).toBeVisible();
  await expect.poll(() => workspaceViewport(page).evaluate((e) => e.scrollTop)).toBe(5_000);
});

test("arrow keys move between album tiles", async ({ page }) => {
  await page.goto("/library/albums");
  const tiles = page.locator("main li[data-index]");
  await expect(tiles.first()).toBeVisible();
  await tiles.first().getByRole("link").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tiles.nth(1).getByRole("link")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("main li[data-index] a:focus")).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => Number(document.activeElement?.closest("li")?.dataset.index)))
    .toBeGreaterThan(1);
});

test("a long queue mounts only the rows near the view", async ({ page }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  const rows = panel.locator('[data-tone="upcoming"]');
  await expect(rows.first()).toBeVisible();
  // 139 tracks follow the first; a window of them is mounted.
  expect(await rows.count()).toBeLessThan(40);

  await panel.locator(".overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(panel.getByRole("button", { name: "Play Track 140" })).toBeVisible();
  expect(await rows.count()).toBeLessThan(40);
});
