import { type Page } from "@playwright/test";
import { defaultSettings, meterFrameBytes } from "./fixtures/data";
import type { Native } from "./fixtures/native-api";
import { expect, test } from "./fixtures/test";

const WIDE = { width: 1920, height: 1080 };
const MEDIUM = { width: 1360, height: 900 };
const NARROW = { width: 500, height: 800 };

async function openNowPlaying(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer).toBeVisible();
  return { layer, dock };
}

const choose = (layer: ReturnType<Page["getByRole"]>, view: "Queue" | "Meters") =>
  layer.getByRole("button", { name: view, exact: true }).click();

const subscribes = (native: Native) => native.callsTo("subscribeMeterFrames").length;
const unsubscribes = (native: Native) => native.callsTo("unsubscribeMeterFrames").length;

test("offers Meters as a third view and chooses it", async ({ page }) => {
  const { layer } = await openNowPlaying(page, MEDIUM);
  const meters = layer.getByRole("region", { name: "Meters" });
  await expect(meters).toBeHidden();
  await choose(layer, "Meters");
  await expect(meters).toBeVisible();
  await expect(layer.getByRole("list", { name: "Queue" })).toBeHidden();
  await choose(layer, "Queue");
  await expect(meters).toBeHidden();
  await expect(layer.getByRole("list", { name: "Queue" })).toBeVisible();
});

test("replaces the lyrics column and keeps the queue on a wide window", async ({ page }) => {
  const { layer } = await openNowPlaying(page, WIDE);
  await choose(layer, "Meters");
  const meters = layer.getByRole("region", { name: "Meters" });
  await expect(meters).toBeVisible();
  await expect(meters).toHaveAttribute("data-layout", "wide");
  await expect(layer.getByRole("list", { name: "Queue" })).toBeVisible();
});

test("lays the stage out in a narrow window as a full-width Spectrum over two bars", async ({
  page,
}) => {
  const { layer } = await openNowPlaying(page, NARROW);
  await choose(layer, "Meters");
  const meters = layer.getByRole("region", { name: "Meters" });
  await expect(meters).toHaveAttribute("data-layout", "narrow");
  const canvases = meters.locator("canvas");
  await expect(canvases).toHaveCount(3);
  const [left, right, spectrum] = await Promise.all(
    [0, 1, 2].map((i) => canvases.nth(i).boundingBox()),
  );
  expect(spectrum!.width).toBeGreaterThan(left!.width);
  expect(left!.width).toBeGreaterThan(left!.height);
  expect(left!.y).toBeGreaterThan(spectrum!.y + spectrum!.height - 1);
  expect(right!.y).toBeGreaterThan(left!.y);
  await expect(meters.locator("canvas[aria-hidden='true']")).toHaveCount(3);
});

test("subscribes while Meters is shown and unsubscribes when another view is chosen", async ({
  page,
  native,
}) => {
  const { layer } = await openNowPlaying(page, MEDIUM);
  expect(subscribes(native)).toBe(0);
  await choose(layer, "Meters");
  await expect.poll(() => subscribes(native)).toBe(1);
  expect(unsubscribes(native)).toBe(0);

  await choose(layer, "Queue");
  await expect.poll(() => unsubscribes(native)).toBe(1);
  expect(native.callsTo("unsubscribeMeterFrames")[0]).toEqual({ subscription: 1 });

  await choose(layer, "Meters");
  await expect.poll(() => subscribes(native)).toBe(2);
});

test("unsubscribes when Now Playing closes", async ({ page, native }) => {
  const { layer, dock } = await openNowPlaying(page, MEDIUM);
  await choose(layer, "Meters");
  await expect.poll(() => subscribes(native)).toBe(1);
  await dock.getByRole("button", { name: "Close Now Playing" }).click();
  await expect(layer).toBeHidden();
  await expect.poll(() => unsubscribes(native)).toBe(1);
});

test("does not subscribe under Calm motion and says the meters are stopped", async ({
  page,
  native,
}) => {
  native.respond("getSettings", { ...defaultSettings, calmMotion: true });
  const { layer } = await openNowPlaying(page, MEDIUM);
  await choose(layer, "Meters");
  const meters = layer.getByRole("region", { name: "Meters" });
  await expect(meters.getByRole("status")).toContainText("stopped");
  await page.waitForTimeout(300);
  expect(subscribes(native)).toBe(0);
});

test("shows Clip for a full-scale frame and clears it on click", async ({ page, native }) => {
  const { layer } = await openNowPlaying(page, MEDIUM);
  await choose(layer, "Meters");
  const meters = layer.getByRole("region", { name: "Meters" });
  await expect(meters.getByText("-inf")).toHaveCount(2);
  await expect.poll(() => subscribes(native)).toBe(1);

  await native.emitChannelMessage(
    "subscribeMeterFrames",
    "frames",
    meterFrameBytes({ band: -3, peak: [0, -12], rms: [-4, -14], fullScale: true }),
  );
  const clip = meters.getByRole("button", { name: "Clip" });
  await expect(clip).toBeVisible();
  await expect(clip).toHaveCount(1);
  await clip.click();
  await expect(clip).toBeHidden();
});

test("unsubscribes while the window is hidden and resumes when it returns", async ({
  page,
  native,
}) => {
  const { layer } = await openNowPlaying(page, MEDIUM);
  await choose(layer, "Meters");
  await expect.poll(() => subscribes(native)).toBe(1);

  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { value, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  await expect.poll(() => unsubscribes(native)).toBe(1);
  await setVisibility("visible");
  await expect.poll(() => subscribes(native)).toBe(2);
});
