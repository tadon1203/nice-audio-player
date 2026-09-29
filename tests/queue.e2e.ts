import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => {
  await installNativeApi(page);
  await page.setViewportSize({ width: 1360, height: 900 });
});

async function openQueue(page: import("@playwright/test").Page) {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Queue" }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  await expect(panel).toBeVisible();
  return panel;
}

const upcomingTitles = (panel: import("@playwright/test").Locator) =>
  panel.locator('[data-tone="upcoming"] p.truncate.text-sm').allTextContents();

test("drags an upcoming track to any position", async ({ page }) => {
  const panel = await openQueue(page);
  const before = await upcomingTitles(panel);
  expect(before.length).toBeGreaterThan(3);

  const handle = panel.getByRole("button", { name: `Drag ${before[0]} to reorder` });
  const fourth = panel.locator('[data-tone="upcoming"]').nth(3);
  const from = (await handle.boundingBox())!;
  const target = (await fourth.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Below the fourth row's centre: the item lands after it.
  await page.mouse.move(from.x + 4, target.y + target.height * 0.75, { steps: 6 });
  await expect(panel.locator('[data-drop="before"], [data-drop="after"]')).toHaveCount(1);
  await page.mouse.up();

  await expect
    .poll(() => upcomingTitles(panel))
    .toEqual([...before.slice(1, 4), before[0], ...before.slice(4)]);
  await expect(panel.locator("[data-drop]")).toHaveCount(0);
});

test("a drag released where it started changes nothing", async ({ page }) => {
  const panel = await openQueue(page);
  const before = await upcomingTitles(panel);
  const handle = panel.getByRole("button", { name: `Drag ${before[1]} to reorder` });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, box.y + box.height / 2 + 3, { steps: 3 });
  await page.mouse.up();
  expect(await upcomingTitles(panel)).toEqual(before);
});

test("the queue stays beside the library instead of dimming it", async ({ page }) => {
  const panel = await openQueue(page);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
  // Clicking the library does not close it; Escape does.
  await page.getByRole("main").click({ position: { x: 10, y: 10 } });
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
