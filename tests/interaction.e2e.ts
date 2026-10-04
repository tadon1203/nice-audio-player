import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { workspaceViewport } from "./fixtures/locators";
import { playbackItemFor, playingSnapshot } from "./fixtures/data";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
});

async function playFirstTrack(page: Page) {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  return dock;
}

const upcomingTitles = (page: Page) =>
  page
    .getByRole("dialog", { name: "Queue" })
    .locator('[data-tone="upcoming"] [data-slot="queue-row-title"]')
    .allTextContents();

test("transport hover stays stable and window close keeps its destructive hover", async ({
  page,
}) => {
  const dock = await playFirstTrack(page);
  const transport = dock.getByRole("button", { name: "Pause", exact: true });
  await transport.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  const background = await transport.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await transport.hover();
  await transport.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  expect(await transport.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    background,
  );

  const close = page.getByRole("button", { name: "Close window", exact: true });
  await close.hover();
  await close.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  const colors = await close.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--destructive)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { actual: getComputedStyle(element).backgroundColor, expected };
  });
  expect(colors.actual).toBe(colors.expected);
});

test("Escape closes Now Playing, and Ctrl+L does nothing without a track", async ({ page }) => {
  await page.goto("/library/tracks");
  const layer = page.getByRole("region", { name: "Now Playing" });
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+l");
  await expect(layer).toHaveCount(0);

  await playFirstTrack(page);
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+l");
  await expect(layer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(layer).toHaveCount(0);
});

test("the dock toggles say whether they are on", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const nowPlaying = dock.getByRole("button", { name: "Now Playing", exact: true });
  const queue = dock.getByRole("button", { name: "Queue", exact: true });
  await expect(nowPlaying).toHaveAttribute("aria-pressed", "false");
  await nowPlaying.click();
  await expect(nowPlaying).toHaveAttribute("aria-pressed", "true");
  await nowPlaying.click();
  await queue.click();
  await expect(queue).toHaveAttribute("aria-pressed", "true");
});

test("the filter takes focus from the slash key", async ({ page }) => {
  await page.goto("/library/tracks");
  const filter = page.getByRole("searchbox", { name: "Search tracks" });
  await expect(filter).toBeVisible();
  await page.keyboard.press("/");
  await expect(filter).toBeFocused();
});

test("the volume slider runs in decibels and Ctrl+arrows step by one", async ({ page }) => {
  const dock = await playFirstTrack(page);
  const volume = dock.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveAttribute("aria-valuemax", "60");
  await page.locator("body").click();
  const readout = dock.locator('[data-region="volume-readout"]');
  await page.keyboard.press("Control+ArrowDown");
  await expect(readout).not.toHaveText("−2.9 dB");
  const lower = await volume.getAttribute("aria-valuenow");
  await page.keyboard.press("Control+ArrowUp");
  await expect
    .poll(async () => Number(await volume.getAttribute("aria-valuenow")))
    .toBeGreaterThan(Number(lower));
});

test("a queue row plays on click", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const before = await upcomingTitles(page);
  const third = before[2]!;
  await page
    .getByRole("dialog", { name: "Queue" })
    .getByRole("button", { name: `Play ${third}`, exact: true })
    .click();
  await expect(dock.getByText(third, { exact: true }).first()).toBeVisible();
  // The tracks before it are behind us now, so the queue continues after it.
  await expect.poll(async () => (await upcomingTitles(page))[0]).toBe(before[3]);
});

test("Play next and Add to queue put a track where they say", async ({
  page,
  native,
  player,
  library,
}) => {
  // What the queue should hold once each command has run: the test states it.
  const rest = library.tracks.filter((track) => track.playable).slice(1);
  const track = (title: string) => library.tracks.find((entry) => entry.title === title)!;
  const without = (tracks: typeof rest, ...removed: typeof rest) =>
    tracks.filter((entry) => !removed.some((gone) => gone.id === entry.id));
  const afterPlayNext = [track("Track 010"), ...without(rest, track("Track 010"))];
  native.respond("enqueueTrack", ({ next }) =>
    next
      ? player.queue({ upcoming: afterPlayNext })
      : player.queue({
          upcoming: [...without(afterPlayNext, track("Track 011")), track("Track 011")],
        }),
  );

  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  const table = page.getByRole("table", { name: "Library tracks" });

  await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Play next" }).click();
  await expect.poll(async () => (await upcomingTitles(page))[0]).toBe("Track 010");

  await table.getByRole("row", { name: /Track 011/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add to queue" }).click();
  // The queue is long and only a window of it is mounted: the end is where the new track is.
  await panel.locator(".overflow-y-auto").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(async () => (await upcomingTitles(page)).at(-1)).toBe("Track 011");
});

test("clearing the upcoming tracks can be undone", async ({ page, native, player, library }) => {
  const rest = library.tracks.filter((track) => track.playable).slice(1);
  native.respond("clearQueue", () => player.queue({ upcoming: [] }));
  native.respond("restorePreviousQueue", async () => {
    await player.queue({ upcoming: rest });
    return playingSnapshot({
      revision: 100,
      status: "playing",
      item: playbackItemFor(library.tracks[0]!),
      positionMs: 12_000,
      seekRevision: 0,
      volume: 0.72,
      muted: false,
      outputSelection: { kind: "systemDefault" },
      canGoPrevious: false,
      canGoNext: true,
    });
  });
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Queue", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Queue" });
  await expect(panel.locator('[data-tone="upcoming"]').first()).toBeVisible();
  await panel.getByRole("button", { name: "Clear upcoming" }).click();
  await expect(dock.getByRole("status")).toContainText("Upcoming cleared");
  await expect(panel.locator('[data-tone="upcoming"]')).toHaveCount(0);
  await dock.getByRole("button", { name: "Undo" }).click();
  await expect(panel.locator('[data-tone="upcoming"]').first()).toBeVisible();
});

test("the Now Playing title stays selectable text after a track change", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  await dock.getByRole("button", { name: "Next track" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  const title = layer.locator("p").filter({ hasText: "Track 002" }).first();
  await expect(title).toBeVisible();
  // Real text in the flow: once the overlay has gone the text is the element's own content.
  await expect(title.locator('[aria-hidden="true"]')).toHaveCount(0, { timeout: 5_000 });
  await expect(title).toHaveText("Track 002");
});

test("artist and album in Now Playing open their pages", async ({ page }) => {
  const dock = await playFirstTrack(page);
  await dock.getByRole("button", { name: "Open Now Playing" }).click();
  const layer = page.getByRole("region", { name: "Now Playing" });
  await expect(layer.getByText("2019")).toBeVisible();
  await layer.getByRole("link", { name: "Test album" }).click();
  await expect(page).toHaveURL(/\/library\/albums\//);
  await expect(layer).toHaveCount(0);
});

test("reaching the end of a long list loads the next page without a button", async ({ page }) => {
  await page.goto("/library/tracks");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const table = page.getByRole("table", { name: "Library tracks" });
  const viewport = workspaceViewport(page);
  await expect
    .poll(async () => {
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return table.getByRole("row", { name: /Track 139/ }).count();
    })
    .toBe(1);
});
