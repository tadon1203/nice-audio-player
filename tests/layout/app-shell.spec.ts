import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, openFixture, supportedViewports } from "./helpers";

for (const viewport of supportedViewports) {
  test(`app shell stays within ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openFixture(page, "long-filename", viewport);

    const shell = page.getByTestId("app-shell");
    const main = shell.locator(".app-shell__main");
    const dock = shell.locator(".app-shell__persistent");
    const overlay = shell.locator("#overlay-root");
    const [shellBox, mainBox, dockBox, overlayBox] = await Promise.all([
      shell.boundingBox(),
      main.boundingBox(),
      dock.boundingBox(),
      overlay.boundingBox(),
    ]);

    expect(shellBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(overlayBox).not.toBeNull();
    if (shellBox === null || mainBox === null || dockBox === null || overlayBox === null) {
      return;
    }

    expect(shellBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(mainBox.y + mainBox.height).toBeLessThanOrEqual(dockBox.y + 1);
    expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(overlayBox.width).toBe(viewport.width);
    expect(overlayBox.height).toBe(viewport.height);
    await expectNoHorizontalOverflow(page);
  });
}
