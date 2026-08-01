import { expect, test } from "@playwright/test";

import { expectContainedBy, expectNoHorizontalOverflow, openFixture } from "./helpers";

const stressCases = [
  { width: 640, height: 800, fixture: "long-filename" },
  { width: 800, height: 600, fixture: "long-device" },
  { width: 800, height: 600, fixture: "unbroken-filename" },
  { width: 1120, height: 700, fixture: "failed" },
  { width: 1440, height: 900, fixture: "playing" },
] as const;

for (const stressCase of stressCases) {
  test(`dock contains stress content at ${stressCase.width}px with ${stressCase.fixture}`, async ({
    page,
  }) => {
    await openFixture(page, stressCase.fixture, stressCase);
    const dock = page.getByTestId("playback-dock");
    const overflow = await dock.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    const controls = [
      dock.getByRole("button", { name: /^(Play|Pause)$/ }),
      dock.getByRole("button", { name: "Stop" }),
      dock.getByRole("slider", { name: "Playback position" }),
      dock.getByRole("slider", { name: "Playback volume" }),
      dock.getByRole("combobox", { name: "Audio output device" }),
      dock.getByRole("button", { name: "Refresh output devices" }),
      dock.getByRole("button", { name: "Mute" }),
    ];
    for (const control of controls) {
      await expectContainedBy(control, dock);
    }

    const primary = dock.getByRole("button", {
      name: stressCase.fixture === "playing" ? "Pause" : "Play",
    });
    const primaryBox = await primary.boundingBox();
    expect(primaryBox?.width).toBeGreaterThanOrEqual(48);
    expect(primaryBox?.height).toBeGreaterThanOrEqual(48);
    for (const name of ["Stop", "Refresh output devices", "Mute"]) {
      const box = await dock.getByRole("button", { name }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(40);
      expect(box?.height).toBeGreaterThanOrEqual(40);
    }
    await expectNoHorizontalOverflow(page);
  });
}

const containerLayouts = [
  { width: 640, expected: '"identity" "transport" "timeline" "volume" "output"' },
  { width: 800, expected: '"identity transport" "timeline timeline" "volume output"' },
  {
    width: 1120,
    expected: '"identity transport timeline volume output"',
  },
] as const;

for (const { width, expected } of containerLayouts) {
  test(`uses the intended container layout at ${width}px`, async ({ page }) => {
    await openFixture(page, "playing", { width, height: 800 });
    const areas = await page
      .locator(".playback-dock__layout")
      .evaluate((element) => getComputedStyle(element).gridTemplateAreas);
    expect(areas).toBe(expected);
  });
}

test("reflows without horizontal overflow when text tokens are doubled", async ({ page }) => {
  await openFixture(page, "long-device", { width: 800, height: 600 });
  const dock = page.getByTestId("playback-dock");
  const initialDockBox = await dock.boundingBox();
  await page.addStyleTag({
    content: `
      :root {
        --text-body-sm: 26px;
        --text-body-md: 28px;
        --text-label: 24px;
        --text-numeric: 24px;
        --text-title: 40px;
        --text-display-md: 64px;
        --text-character-sm: 80px;
        --text-character-md: 104px;
      }
    `,
  });

  const regions = dock.locator("[data-region]");
  for (let index = 0; index < (await regions.count()); index += 1) {
    await expectContainedBy(regions.nth(index), dock);
  }
  const [timelineBox, volumeBox, outputBox, resizedDockBox] = await Promise.all([
    dock.locator('[data-region="timeline"]').boundingBox(),
    dock.locator('[data-region="volume"]').boundingBox(),
    dock.locator('[data-region="output"]').boundingBox(),
    dock.boundingBox(),
  ]);
  expect(timelineBox).not.toBeNull();
  expect(volumeBox).not.toBeNull();
  expect(outputBox).not.toBeNull();
  expect(resizedDockBox).not.toBeNull();
  if (
    timelineBox === null ||
    volumeBox === null ||
    outputBox === null ||
    resizedDockBox === null ||
    initialDockBox === null
  ) {
    return;
  }
  expect(timelineBox.y + timelineBox.height).toBeLessThanOrEqual(volumeBox.y + 1);
  expect(volumeBox.x + volumeBox.width).toBeLessThanOrEqual(outputBox.x + 1);
  expect(resizedDockBox.height).toBeGreaterThan(initialDockBox.height);
  for (const [name, minimum] of [
    ["Play", 48],
    ["Stop", 40],
    ["Refresh output devices", 40],
    ["Mute", 40],
  ] as const) {
    const box = await dock.getByRole("button", { name }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(minimum);
    expect(box?.height).toBeGreaterThanOrEqual(minimum);
  }
  await expectNoHorizontalOverflow(page);
});

test("keeps transport geometry stable while seek is pending", async ({ page }) => {
  const viewport = { width: 1120, height: 700 };
  await openFixture(page, "playing", viewport);
  const playingDock = page.getByTestId("playback-dock");
  const [playingPauseBox, playingStopBox] = await Promise.all([
    playingDock.getByRole("button", { name: "Pause" }).boundingBox(),
    playingDock.getByRole("button", { name: "Stop" }).boundingBox(),
  ]);

  await openFixture(page, "seek-pending", viewport);
  const dock = page.getByTestId("playback-dock");
  const pause = dock.getByRole("button", { name: "Pause" });
  const stop = dock.getByRole("button", { name: "Stop" });
  const seek = dock.getByRole("slider", { name: "Playback position" });
  await expect(pause).toBeEnabled();
  await expect(stop).toBeEnabled();
  await expect(seek).toBeDisabled();
  await expect(seek.locator("..")).toHaveAttribute("aria-busy", "true");

  const [seekPauseBox, seekStopBox] = await Promise.all([pause.boundingBox(), stop.boundingBox()]);
  expect(seekPauseBox).toEqual(playingPauseBox);
  expect(seekStopBox).toEqual(playingStopBox);
  await expectNoHorizontalOverflow(page);
});

test("playing layout remains visually stable at 1120x700", async ({ page }) => {
  await openFixture(page, "playing", { width: 1120, height: 700 });
  await page.addStyleTag({
    content: "* { font-family: Arial, sans-serif !important; }",
  });
  await expect(page).toHaveScreenshot("playing-1120x700.png", { animations: "disabled" });
});
