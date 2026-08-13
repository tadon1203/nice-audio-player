import { expect, test } from "@playwright/test";
import { expectContainedBy, expectNoHorizontalOverflow, openFixture } from "./helpers";

for (const viewport of [
  { width: 640, height: 800 },
  { width: 800, height: 600 },
  { width: 1120, height: 700 },
  { width: 1440, height: 900 },
]) {
  test(`three-region Dock contains controls at ${viewport.width}px`, async ({ page }) => {
    await openFixture(page, "playing", viewport);
    const dock = page.getByTestId("playback-dock");
    const regions = dock.locator("[data-region]");
    await expect(regions).toHaveCount(3);
    for (const region of ["identity", "playback-core", "volume"])
      await expect(dock.locator(`[data-region="${region}"]`)).toBeVisible();
    for (let index = 0; index < (await regions.count()); index += 1)
      await expectContainedBy(regions.nth(index), dock);
    await expect(dock.getByRole("button", { name: "Pause" })).toHaveAttribute(
      "aria-label",
      "Pause",
    );
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [640, 800, 1120, 1440, 1760]) {
  test(`Play/Pause remains centered in the Dock at ${width}px`, async ({ page }) => {
    await openFixture(page, "playing", { width, height: 700 });
    const grid = page.locator(".playback-dock__layout");
    const core = page.locator('[data-region="playback-core"]');
    const button = page.getByRole("button", { name: "Pause" });
    const [
      gridBox,
      dockBox,
      coreBox,
      buttonBox,
      timelineBox,
      seekBox,
      volumeBox,
      identityBox,
      artworkBox,
      primaryIconBox,
      volumeIconBox,
    ] = await Promise.all([
      grid.boundingBox(),
      page.getByTestId("playback-dock").boundingBox(),
      core.boundingBox(),
      button.boundingBox(),
      page.locator(".playback-dock__timeline").boundingBox(),
      page.getByRole("slider", { name: "Playback position" }).boundingBox(),
      page.locator('[data-region="volume"]').boundingBox(),
      page.locator('[data-region="identity"]').boundingBox(),
      page.locator(".playback-dock__artwork-frame").boundingBox(),
      button.locator("svg").boundingBox(),
      page.getByRole("button", { name: "Mute" }).locator("svg").boundingBox(),
    ]);
    expect(gridBox && buttonBox).not.toBeNull();
    if (
      !gridBox ||
      !dockBox ||
      !buttonBox ||
      !coreBox ||
      !timelineBox ||
      !seekBox ||
      !volumeBox ||
      !identityBox ||
      !artworkBox ||
      !primaryIconBox ||
      !volumeIconBox
    )
      return;
    expect(dockBox.height).toBeGreaterThanOrEqual(144);
    expect(dockBox.height).toBeLessThanOrEqual(160);
    expect(
      Math.abs(buttonBox.x + buttonBox.width / 2 - (gridBox.x + gridBox.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(seekBox.x).toBeGreaterThanOrEqual(coreBox.x - 1);
    expect(seekBox.x + seekBox.width).toBeLessThanOrEqual(coreBox.x + coreBox.width + 1);
    expect(seekBox.width).toBeLessThanOrEqual(704);
    expect(buttonBox.width).toBe(64);
    expect(buttonBox.height).toBe(64);
    expect(primaryIconBox.width).toBe(32);
    expect(primaryIconBox.height).toBe(32);
    expect(volumeIconBox.width).toBe(28);
    expect(volumeIconBox.height).toBe(28);
    expect(artworkBox.width).toBe(64);
    expect(artworkBox.height).toBe(64);
    expect(
      Math.abs(timelineBox.x + timelineBox.width / 2 - (coreBox.x + coreBox.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(timelineBox.y - (buttonBox.y + buttonBox.height)).toBeGreaterThanOrEqual(-16);
    expect(timelineBox.y - (buttonBox.y + buttonBox.height)).toBeLessThanOrEqual(0);
    expect(seekBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height - 1);
    expect(identityBox.x + identityBox.width).toBeLessThanOrEqual(coreBox.x + 1);
    expect(volumeBox.x).toBeGreaterThanOrEqual(coreBox.x + coreBox.width - 1);
    expect(identityBox.x - dockBox.x).toBeGreaterThanOrEqual(24);
    expect(identityBox.x - dockBox.x).toBeLessThanOrEqual(48);
    expect(dockBox.x + dockBox.width - (volumeBox.x + volumeBox.width)).toBeGreaterThanOrEqual(24);
    expect(dockBox.x + dockBox.width - (volumeBox.x + volumeBox.width)).toBeLessThanOrEqual(48);
    expect(buttonBox.y - dockBox.y).toBeGreaterThanOrEqual(16);
    expect(
      dockBox.y + dockBox.height - (timelineBox.y + timelineBox.height),
    ).toBeGreaterThanOrEqual(16);
    expect(
      Math.abs(identityBox.y + identityBox.height / 2 - (coreBox.y + coreBox.height / 2)),
    ).toBeLessThanOrEqual(8);
    expect(
      Math.abs(volumeBox.y + volumeBox.height / 2 - (coreBox.y + coreBox.height / 2)),
    ).toBeLessThanOrEqual(8);
  });
}

test("seek-pending preserves core geometry", async ({ page }) => {
  const viewport = { width: 1120, height: 700 };
  await openFixture(page, "playing", viewport);
  const normalButton = await page.getByRole("button", { name: "Pause" }).boundingBox();
  const normalCore = await page.locator('[data-region="playback-core"]').boundingBox();
  await openFixture(page, "seek-pending", viewport);
  const dock = page.getByTestId("playback-dock");
  expect(await dock.getByRole("slider", { name: "Playback position" }).isDisabled()).toBe(true);
  const pendingButton = await dock.getByRole("button", { name: "Pause" }).boundingBox();
  const pendingCore = await dock.locator('[data-region="playback-core"]').boundingBox();
  expect(normalButton && pendingButton && normalCore && pendingCore).not.toBeNull();
  if (!normalButton || !pendingButton || !normalCore || !pendingCore) return;
  for (const property of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(pendingButton[property] - normalButton[property])).toBeLessThanOrEqual(1);
    expect(Math.abs(pendingCore[property] - normalCore[property])).toBeLessThanOrEqual(1);
  }
});

test("Dock remains contained when typography tokens grow", async ({ page }) => {
  await openFixture(page, "playing", { width: 800, height: 600 });
  const dock = page.getByTestId("playback-dock");
  await page.addStyleTag({ content: ":root { --text-body-sm: 26px; --text-body-md: 28px; }" });
  for (const region of ["identity", "playback-core", "volume"])
    await expectContainedBy(dock.locator(`[data-region="${region}"]`), dock);
  await expectNoHorizontalOverflow(page);
});

test("Dock ranges use the shared custom control treatment", async ({ page }) => {
  await openFixture(page, "playing", { width: 800, height: 600 });
  const ruleSelectors = await page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules, (rule) =>
          rule instanceof CSSStyleRule ? rule.selectorText : "",
        );
      } catch {
        return [];
      }
    }),
  );
  expect(
    ruleSelectors.some((selector) => selector.includes("::-webkit-slider-runnable-track")),
  ).toBe(true);
  expect(ruleSelectors.some((selector) => selector.includes("::-webkit-slider-thumb"))).toBe(true);
  for (const name of ["Playback position", "Playback volume"]) {
    const appearance = await page
      .getByRole("slider", { name })
      .evaluate((input) => getComputedStyle(input).appearance);
    expect(appearance).toBe("none");
  }
});

test("minimum window width keeps the Dock in one anchored row", async ({ page }) => {
  await openFixture(page, "playing", { width: 640, height: 800 });
  const dock = page.getByTestId("playback-dock");
  const [identity, core, volume, button, timeline] = await Promise.all([
    dock.locator('[data-region="identity"]').boundingBox(),
    dock.locator('[data-region="playback-core"]').boundingBox(),
    dock.locator('[data-region="volume"]').boundingBox(),
    dock.getByRole("button", { name: "Pause" }).boundingBox(),
    dock.locator(".playback-dock__timeline").boundingBox(),
  ]);
  expect(identity && core && volume && button && timeline).not.toBeNull();
  if (!identity || !core || !volume || !button || !timeline) return;
  expect(identity.x + identity.width).toBeLessThanOrEqual(core.x + 1);
  expect(core.x + core.width).toBeLessThanOrEqual(volume.x + 1);
  expect(
    Math.abs(identity.y + identity.height / 2 - (core.y + core.height / 2)),
  ).toBeLessThanOrEqual(8);
  expect(Math.abs(volume.y + volume.height / 2 - (core.y + core.height / 2))).toBeLessThanOrEqual(
    8,
  );
  expect(timeline.y - (button.y + button.height)).toBeLessThanOrEqual(0);
  await expectNoHorizontalOverflow(page);
});
