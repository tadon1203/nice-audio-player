import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openFixture } from "./helpers";

for (const viewport of [
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`album detail geometry stays aligned at ${viewport.width}px`, async ({ page }) => {
    await openFixture(page, "album-detail-wide", viewport);
    const content = page.locator(".album-detail__content");
    const tracks = page.locator(".album-detail__tracks");
    const identity = page.locator(".album-detail__identity");
    const artwork = page.locator(".album-detail__artwork-wrap");
    const [contentBox, tracksBox, identityBox, artworkBox] = await Promise.all([
      content.boundingBox(),
      tracks.boundingBox(),
      identity.boundingBox(),
      artwork.boundingBox(),
    ]);
    expect(contentBox).not.toBeNull();
    expect(tracksBox).not.toBeNull();
    if (!contentBox || !tracksBox || !identityBox || !artworkBox) return;
    expect(artworkBox.x + artworkBox.width).toBeLessThan(identityBox.x);
    expect(Math.abs(tracksBox.x - contentBox.x)).toBeLessThanOrEqual(2);
    expect(tracksBox.x + tracksBox.width).toBeLessThanOrEqual(contentBox.x + contentBox.width + 1);
    expect(
      Math.abs(tracksBox.x + tracksBox.width - (contentBox.x + contentBox.width)),
    ).toBeLessThanOrEqual(2);
    expect(tracksBox.x).toBeLessThan(identityBox.x);
    if (viewport.width >= 1400)
      expect(identityBox.x - (artworkBox.x + artworkBox.width)).toBeGreaterThan(20);
    const duration = page.locator(".album-detail__row").first().locator("span").nth(2);
    const rowBox = await page.locator(".album-detail__row").first().boundingBox();
    const durationBox = await duration.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(durationBox).not.toBeNull();
    if (rowBox && durationBox)
      expect(durationBox.x + durationBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    const playButton = page.locator(".album-detail__play");
    await playButton.hover();
    const colors = await playButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(colors.color).not.toBe(colors.background);
    await expectNoHorizontalOverflow(page);
  });
}
