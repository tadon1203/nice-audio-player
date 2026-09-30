import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => {
  await installNativeApi(page, { extraAlbums: 60 });
  await page.setViewportSize({ width: 1360, height: 900 });
});

const focusedTile = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.activeElement?.closest("li")?.dataset.index ?? null);

test("arrow keys move focus between album tiles, and are not the seek keys", async ({ page }) => {
  await page.goto("/library/albums");
  await page.locator("main li[data-index='0'] a").first().focus();
  expect(await focusedTile(page)).toBe("0");

  await page.keyboard.press("ArrowRight");
  expect(await focusedTile(page)).toBe("1");
  await page.keyboard.press("ArrowLeft");
  expect(await focusedTile(page)).toBe("0");

  await page.keyboard.press("ArrowDown");
  const below = Number(await focusedTile(page));
  expect(below).toBeGreaterThan(1);
  await page.keyboard.press("ArrowUp");
  expect(await focusedTile(page)).toBe("0");

  // Far away: the tile is scrolled to and then focused.
  await page.keyboard.press("End");
  await expect.poll(() => focusedTile(page)).toBe("61");
  await expect(page.locator("main li[data-index='61'] a").first()).toBeInViewport();
});

test("Ctrl+S toggles shuffle and Ctrl+R steps through repeat", async ({ page }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();

  const shuffle = dock.getByRole("button", { name: /Shuffle/ });
  await expect(shuffle).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+s");
  await expect(shuffle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+s");
  await expect(shuffle).toHaveAttribute("aria-pressed", "false");

  const repeat = dock.getByRole("button", { name: /Repeat/ });
  await expect(repeat).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+r");
  await expect(repeat).toHaveAttribute("aria-pressed", "true");
});
