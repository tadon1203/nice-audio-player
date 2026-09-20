import { expect, test } from "@playwright/test";
import { installElectronApi } from "./fixtures/electron-api";

test.beforeEach(async ({ page }) => installElectronApi(page));

test("navigates between the three library presentations and Settings", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/library\/albums(?:\?|$)/);

  for (const [label, path] of [
    ["Albums", "/library/albums"],
    ["Album Artists", "/library/album-artists"],
    ["Tracks", "/library/tracks"],
    ["Settings", "/settings"],
  ] as const) {
    const link = page.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:\\?|$)`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main")).toBeVisible();
  }

  await expect(page.getByText("Local listening desk")).toHaveCount(0);
  await expect(page.getByText("Local library", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Native audio engine", { exact: true })).toHaveCount(0);
});

for (const width of [640, 768, 1024, 1360]) {
  test(`keeps navigation and playback inside a ${width}px window`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/library/albums");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("link", { name: "Albums", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo", { name: "Playback controls" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Volume" }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible();

    const navigation = page.getByRole("navigation", { name: "Application" });
    if (width < 800) {
      await expect(navigation).toBeVisible();
    } else {
      await expect(navigation).toBeVisible();
      const navigationBox = await navigation.boundingBox();
      expect(navigationBox?.width).toBe(224);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });
}
