import { expect, test } from "@playwright/test";

import { expectContainedBy, expectNoHorizontalOverflow, openFixture } from "./helpers";

test("long and unbroken filenames stay inside Now Playing", async ({ page }) => {
  for (const fixture of ["long-filename", "japanese-filename", "unbroken-filename"]) {
    await openFixture(page, fixture, { width: 640, height: 800 });
    const view = page.locator(".now-playing-view");
    await expectContainedBy(page.locator(".now-playing-view__filename"), view);
    await expectContainedBy(page.locator(".now-playing-view__action"), view);
    await expectNoHorizontalOverflow(page);
  }
});

test("empty layout remains visually stable at 800x600", async ({ page }) => {
  await openFixture(page, "empty", { width: 800, height: 600 });
  await page.addStyleTag({
    content: "* { font-family: Arial, sans-serif !important; }",
  });
  await expect(page).toHaveScreenshot("empty-800x600.png", { animations: "disabled" });
});
