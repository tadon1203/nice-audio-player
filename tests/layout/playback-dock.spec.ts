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
    expect(dockBox.height).toBeGreaterThanOrEqual(136);
    expect(dockBox.height).toBeLessThanOrEqual(140);
    expect(
      Math.abs(buttonBox.x + buttonBox.width / 2 - (gridBox.x + gridBox.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      await page
        .locator(".playback-dock__transport")
        .evaluate((element) => getComputedStyle(element).translate),
    ).toBe("0px 8px");
    expect(seekBox.x).toBeGreaterThanOrEqual(coreBox.x - 1);
    expect(seekBox.x + seekBox.width).toBeLessThanOrEqual(coreBox.x + coreBox.width + 1);
    expect(seekBox.width).toBeLessThanOrEqual(704);
    expect(buttonBox.width).toBe(48);
    expect(buttonBox.height).toBe(48);
    expect(primaryIconBox.width).toBe(24);
    expect(primaryIconBox.height).toBe(24);
    expect(volumeIconBox.width).toBe(28);
    expect(volumeIconBox.height).toBe(28);
    expect(artworkBox.width).toBe(80);
    expect(artworkBox.height).toBe(80);
    expect(
      Math.abs(timelineBox.x + timelineBox.width / 2 - (coreBox.x + coreBox.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(timelineBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height - 6);
    expect(timelineBox.y - (buttonBox.y + buttonBox.height)).toBeLessThanOrEqual(4);
    expect(timelineBox.y - (buttonBox.y + buttonBox.height)).toBeGreaterThanOrEqual(-6);
    expect(seekBox.y).toBeGreaterThanOrEqual(timelineBox.y + 20 - 1);
    expect(identityBox.x + identityBox.width).toBeLessThanOrEqual(coreBox.x + 1);
    expect(volumeBox.x).toBeGreaterThanOrEqual(coreBox.x + coreBox.width - 1);
    expect(identityBox.x - dockBox.x).toBeGreaterThanOrEqual(24);
    expect(identityBox.x - dockBox.x).toBeLessThanOrEqual(48);
    expect(dockBox.x + dockBox.width - (volumeBox.x + volumeBox.width)).toBeGreaterThanOrEqual(24);
    expect(dockBox.x + dockBox.width - (volumeBox.x + volumeBox.width)).toBeLessThanOrEqual(48);
    expect(buttonBox.y - dockBox.y).toBeGreaterThanOrEqual(8);
    expect(
      dockBox.y + dockBox.height - (timelineBox.y + timelineBox.height),
    ).toBeGreaterThanOrEqual(8);
    expect(volumeBox.width).toBeGreaterThanOrEqual(192);
    expect(
      await page
        .getByRole("slider", { name: "Playback volume" })
        .evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(144);
    expect(
      Math.abs(identityBox.y + identityBox.height / 2 - (coreBox.y + coreBox.height / 2)),
    ).toBeLessThanOrEqual(8);
    expect(
      Math.abs(artworkBox.y + artworkBox.height / 2 - (identityBox.y + identityBox.height / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(volumeBox.y + volumeBox.height / 2 - (coreBox.y + coreBox.height / 2)),
    ).toBeLessThanOrEqual(width <= 800 ? 24 : 8);

    const queueBox = await page.getByRole("button", { name: "Open queue" }).boundingBox();
    const lyricsBox = await page.getByRole("button", { name: "Open lyrics" }).boundingBox();
    expect(queueBox).not.toBeNull();
    expect(lyricsBox).not.toBeNull();
    if (queueBox && lyricsBox) {
      expect(
        queueBox.x + queueBox.width <= volumeBox.x ||
          volumeBox.x + volumeBox.width <= queueBox.x ||
          queueBox.y + queueBox.height <= volumeBox.y ||
          volumeBox.y + volumeBox.height <= queueBox.y,
      ).toBe(true);
      if (width <= 800) {
        expect(queueBox.y + queueBox.height).toBeLessThanOrEqual(volumeBox.y);
        expect(lyricsBox.y + lyricsBox.height).toBeLessThanOrEqual(volumeBox.y);
      } else {
        expect(lyricsBox.x - (queueBox.x + queueBox.width)).toBe(8);
        expect(volumeBox.x - (lyricsBox.x + lyricsBox.width)).toBe(8);
        expect(
          Math.abs(lyricsBox.y + lyricsBox.height / 2 - (volumeBox.y + volumeBox.height / 2)),
        ).toBeLessThanOrEqual(8);
      }
    }
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
  for (const name of ["Playback position", "Playback volume"]) {
    const input = page.getByRole("slider", { name });
    const appearance = await input.evaluate((element) => getComputedStyle(element).appearance);
    expect(appearance).toBe("none");
    await expect(input.locator(".."), `${name} should use the shared wrapper`).toHaveClass(
      /range-control/,
    );
    const wrapper = input.locator("..");
    await expect(wrapper.locator(".range-control__track")).toHaveCount(1);
    await expect(wrapper.locator(".range-control__fill-position")).toHaveCount(1);
    await expect(wrapper.locator(".range-control__fill-visual")).toHaveCount(1);
    await expect(wrapper.locator(".range-control__thumb-position")).toHaveCount(1);
    await expect(wrapper.locator(".range-control__thumb-visual")).toHaveCount(1);
    await expect(wrapper.locator(".range-control__thumb-ring")).toHaveCount(1);
    expect(
      await wrapper.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(40);
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
    24,
  );
  const queue = dock.getByRole("button", { name: "Open queue" });
  const queueBox = await queue.boundingBox();
  expect(queueBox).not.toBeNull();
  if (queueBox) expect(queueBox.y + queueBox.height).toBeLessThanOrEqual(volume.y);
  expect(timeline.y - (button.y + button.height)).toBeGreaterThanOrEqual(-6);
  expect(timeline.y - (button.y + button.height)).toBeLessThanOrEqual(4);
  await expectNoHorizontalOverflow(page);
});
