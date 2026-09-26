import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test.beforeEach(async ({ page }) => installNativeApi(page));

test("plays tracks and operates the persistent seek, transport, volume, and technical status", async ({
  page,
}) => {
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });
  const activeRow = table.getByRole("row", { name: /Test track/ });
  const inactiveRow = table.getByRole("row", { name: /Track 002/ });
  await page.getByRole("button", { name: "Play Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  await activeRow.getByText("Test artist", { exact: true }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  await activeRow.getByRole("button", { name: "Pause Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "paused");
  await activeRow.getByText("Test track", { exact: true }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  await inactiveRow.getByText("Test artist", { exact: true }).click();
  await expect(inactiveRow).toHaveAttribute("data-playback-state", "playing");
  await expect(page.getByRole("button", { name: "Next track" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous track" })).toBeDisabled();

  await page.getByRole("button", { name: "Play Test track" }).click();
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
  await expect(page.getByRole("button", { name: "Next track" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous track" })).toBeDisabled();

  const seek = page.getByRole("slider", { name: "Playback position" }).last();
  await expect(seek).toHaveAttribute("aria-valuetext", /\d+:\d+ of \d+:\d+/);
  const beforeSeek = Number(await seek.getAttribute("aria-valuenow"));
  await seek.focus();
  await seek.press("ArrowRight");
  await expect
    .poll(async () => Number(await seek.getAttribute("aria-valuenow")))
    .toBeGreaterThan(beforeSeek);

  const volume = page.getByRole("slider", { name: "Volume" }).last();
  await expect(volume).toHaveAttribute("aria-valuetext", "72 percent");
  const volumeBox = await page.locator('[data-region="volume-slider"]').boundingBox();
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
  await expect(status.locator('[data-status-line="OUTPUT"]')).toHaveAttribute(
    "title",
    "OUTPUT System default · direct · 48.0 kHz",
  );
});

test("remains operable while playback position events are streaming", async ({ page }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  await page.evaluate(() => window.__niceAudioPlayerTest?.startPlaybackTicks());

  try {
    const filter = page.getByRole("searchbox", { name: "Search tracks" });
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

test("uses the album as the queue context when Play album starts playback", async ({ page }) => {
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await page.getByRole("button", { name: "Play album" }).click();

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: "Next track" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(dock.getByText("Track 002", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous track" })).toBeEnabled();
});
