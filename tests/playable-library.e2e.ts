import { expect, test } from "@playwright/test";
import { installElectronApi } from "./fixtures/electron-api";

test.beforeEach(async ({ page }) => installElectronApi(page));

test("plays tracks and operates the persistent seek, transport, volume, and technical status", async ({
  page,
}) => {
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });
  const activeRow = table.getByRole("row", { name: /Test track/ });
  const inactiveRow = table.getByRole("row", { name: /Track 002/ });
  await expect(
    inactiveRow.getByRole("button", { name: "Play Track 002" }).locator("svg"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Play Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  await activeRow.getByRole("button", { name: "Pause Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "paused");
  await activeRow.getByRole("button", { name: "Resume Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();
  await expect(dock.getByText("Test artist", { exact: true })).toBeVisible();
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeEnabled();
  await pause.click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "paused");
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");
  await page.getByRole("button", { name: "Next track" }).click();
  await expect(dock.getByText("Track 002", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous track" }).click();
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();

  const seek = page.getByRole("slider", { name: "Playback position" }).last();
  const beforeSeek = Number(await seek.getAttribute("aria-valuenow"));
  await seek.focus();
  await seek.press("ArrowRight");
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(beforeSeek);

  const volume = page.getByRole("slider", { name: "Volume" }).last();
  const volumeBox = await volume.boundingBox();
  expect(volumeBox).not.toBeNull();
  await page.mouse.click(
    volumeBox!.x + volumeBox!.width * 0.42,
    volumeBox!.y + volumeBox!.height / 2,
  );
  await expect
    .poll(async () => Number(await volume.getAttribute("aria-valuenow")))
    .toBeCloseTo(0.42, 1);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
  await volume.focus();
  await volume.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible();

  const status = page.getByRole("region", { name: "Playback signal status" });
  await expect(status).toContainText("SOURCE");
  await expect(status).toContainText("FLAC · 44.1 kHz");
  await expect(status).toContainText("SRC");
  await expect(status).toContainText("resampling");
  await expect(status).toContainText("OUTPUT");
  await expect(status).toContainText("System default · direct · 48.0 kHz");
});

test("keeps volume and mute controls available at narrow sizes", async ({ page }) => {
  for (const width of [640, 768, 1024, 1360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/library/albums");
    await expect(page.getByRole("slider", { name: "Volume" }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  }
});

test("remains operable while playback position events are streaming", async ({ page }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  await page.evaluate(() => window.__niceAudioPlayerTest?.startPlaybackTicks());

  try {
    const filter = page.getByRole("searchbox", { name: "Filter library" });
    await filter.fill("Track 0");
    await expect(page.getByRole("table", { name: "Library tracks" })).toBeVisible();

    await page.getByRole("link", { name: "Albums", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Albums", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Tracks", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Tracks", exact: true })).toBeVisible();
  } finally {
    await page.evaluate(() => window.__niceAudioPlayerTest?.stopPlaybackTicks());
  }
});
