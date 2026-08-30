import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openFixture } from "./helpers";

for (const viewport of [
  { width: 640, height: 800 },
  { width: 800, height: 600 },
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`album detail geometry stays aligned at ${viewport.width}px`, async ({ page }) => {
    await openFixture(page, "album-detail-wide", viewport);
    const content = page.locator('[data-region="album-detail-content"]');
    const tracks = page.locator('[data-region="album-detail-tracks"]');
    const identity = page.locator('[data-region="album-detail-identity"]');
    const artwork = page.locator('[data-region="album-detail-artwork"]');
    await expect
      .poll(
        async () => {
          const [identityBox, artworkBox] = await Promise.all([
            identity.boundingBox(),
            artwork.boundingBox(),
          ]);
          if (!identityBox || !artworkBox) return false;
          return viewport.width < 1120
            ? identityBox.y > artworkBox.y + artworkBox.height - 1
            : artworkBox.x + artworkBox.width < identityBox.x;
        },
        { timeout: 2000 },
      )
      .toBe(true);
    const [contentBox, tracksBox, identityBox, artworkBox] = await Promise.all([
      content.boundingBox(),
      tracks.boundingBox(),
      identity.boundingBox(),
      artwork.boundingBox(),
    ]);
    expect(contentBox).not.toBeNull();
    expect(tracksBox).not.toBeNull();
    if (!contentBox || !tracksBox || !identityBox || !artworkBox) return;
    if (viewport.width < 1120) {
      expect(identityBox.y).toBeGreaterThan(artworkBox.y + artworkBox.height - 1);
    } else {
      expect(artworkBox.x + artworkBox.width).toBeLessThan(identityBox.x);
    }
    expect(Math.abs(tracksBox.x - contentBox.x)).toBeLessThanOrEqual(2);
    expect(tracksBox.x + tracksBox.width).toBeLessThanOrEqual(contentBox.x + contentBox.width + 1);
    expect(
      Math.abs(tracksBox.x + tracksBox.width - (contentBox.x + contentBox.width)),
    ).toBeLessThanOrEqual(2);
    if (viewport.width >= 1120) expect(tracksBox.x).toBeLessThan(identityBox.x);
    if (viewport.width >= 1400)
      expect(identityBox.x - (artworkBox.x + artworkBox.width)).toBeGreaterThan(20);
    const duration = page
      .locator('[data-slot="album-track-row"]')
      .first()
      .locator('[data-slot="album-track-duration"]');
    const rowBox = await page.locator('[data-slot="album-track-row"]').first().boundingBox();
    const durationBox = await duration.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(durationBox).not.toBeNull();
    if (rowBox && durationBox) {
      expect(durationBox.x + durationBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width - 10);
      expect(durationBox.x + durationBox.width).toBeGreaterThan(rowBox.x + rowBox.width - 18);
    }
    const playButton = page.getByRole("button", { name: "Play album" });
    const restColors = await playButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(restColors).toEqual({ color: "rgb(5, 5, 5)", background: "rgb(244, 244, 244)" });
    await playButton.hover();
    await expect
      .poll(() =>
        playButton.evaluate((element) => {
          const style = getComputedStyle(element);
          return { color: style.color, background: style.backgroundColor };
        }),
      )
      .toEqual({ color: "rgb(5, 5, 5)", background: "rgb(221, 221, 221)" });
    await expectNoHorizontalOverflow(page);
  });
}
