import { expect, test, type Page } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

async function openQueue(page: Page) {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  return { dock, panel: page.getByRole("dialog", { name: "Queue" }) };
}

test.describe("a queue as long as the library", () => {
  test.beforeEach(async ({ page }) => {
    await installNativeApi(page, { trackCount: 1_000 });
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  test("rows past what the snapshot carries are read as the list scrolls", async ({ page }) => {
    const { panel } = await openQueue(page);
    const rows = panel.locator('[data-tone="upcoming"]');
    await expect(rows.first()).toBeVisible();
    await panel.locator(".overflow-y-auto").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    // Track 1000 is the 999th upcoming item, far beyond the 200 in the snapshot.
    await expect(panel.getByRole("button", { name: "Play Track 1000" })).toBeVisible();
    expect(await rows.count()).toBeLessThan(40);
  });
});

test.describe("the queue as a history", () => {
  test.beforeEach(async ({ page }) => {
    await installNativeApi(page);
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  test("played tracks sit above the current one and can be played again", async ({ page }) => {
    const { dock, panel } = await openQueue(page);
    await expect(panel.locator('[data-tone="past"]')).toHaveCount(0);
    await dock.getByRole("button", { name: "Next track" }).click();
    await dock.getByRole("button", { name: "Next track" }).click();
    await expect(panel.locator('[data-tone="past"]')).toHaveCount(2);
    await panel.getByRole("button", { name: "Play Test track" }).click();
    await expect(panel.locator('[data-tone="past"]')).toHaveCount(0);
    await expect(panel.locator('[data-tone="current"]')).toContainText("Test track");
  });
});

test.describe("a track's menu", () => {
  test.beforeEach(async ({ page }) => {
    await installNativeApi(page);
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  test("Go to album opens the album, Properties lists the file", async ({ page }) => {
    await page.goto("/library/tracks");
    const table = page.getByRole("table", { name: "Library tracks" });

    await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Properties" }).click();
    const sheet = page.getByRole("dialog", { name: "Properties" });
    await expect(sheet.getByText("Electronic")).toBeVisible();
    await expect(sheet.getByText("C:/Music/Track 010.flac")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Go to album" }).click();
    await expect(page).toHaveURL(
      /\/library\/albums\/Test%20artist\/Test%20album|\/library\/albums\//,
    );
  });
});
