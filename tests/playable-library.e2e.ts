import { albumSequence, pageOf } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

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
  // Playing from the list queues the rest of it, so the track has neighbours on both sides.
  await expect(page.getByRole("button", { name: "Next track" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Previous track" })).toBeEnabled();

  await page.getByRole("button", { name: "Play Test track" }).click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();
  // Old and new identity briefly coexist while a track change crossfades.
  await expect(dock.getByText("Test artist", { exact: true }).first()).toBeVisible();
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeEnabled();
  await pause.click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "paused");
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(activeRow).toHaveAttribute("data-playback-state", "playing");
  await expect(page.getByRole("button", { name: "Next track" })).toBeEnabled();
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
  await expect(volume).toHaveAttribute("aria-valuetext", /^−\d+(\.\d)? dB$/);
  const volumeBox = await page.locator('[data-region="volume-slider"]').boundingBox();
  expect(volumeBox).not.toBeNull();
  await page.mouse.click(
    volumeBox!.x + volumeBox!.width * 0.42,
    volumeBox!.y + volumeBox!.height / 2,
  );
  await expect
    .poll(async () => Number(await volume.getAttribute("aria-valuenow")))
    // The slider runs in whole decibels from silence (0) to 0 dB (60).
    .toBeCloseTo(25, 0);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
  await volume.focus();
  await volume.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeVisible();

  const path = page.getByRole("group", { name: "Signal path" });
  await expect(path).toContainText("FLAC 24/44.1");
  await expect(path).toContainText("48 kHz");
  await expect(path.getByRole("button", { name: "Output device: Speakers" })).toBeVisible();
});

test("remains operable while playback position events are streaming", async ({ page, player }) => {
  await page.goto("/library/tracks");
  await page.getByRole("button", { name: "Play Test track" }).click();
  player.startTicks();

  try {
    const filter = page.getByRole("searchbox", { name: "Search tracks" });
    await filter.fill("Track 0");
    await expect(page.getByRole("table", { name: "Library tracks" })).toBeVisible();

    await page.getByRole("link", { name: "Albums", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Albums", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Tracks", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Tracks", exact: true })).toBeVisible();
  } finally {
    player.stopTicks();
  }
});

test("plays the list that shows, also right after the filter changes", async ({
  page,
  native,
  library,
}) => {
  // A search answers only when the test lets it, so the old list stays on screen until then.
  let releaseSearch: () => void = () => {};
  const searchMayAnswer = new Promise<void>((resolve) => (releaseSearch = resolve));
  native.respond("listLibraryTracks", async ({ cursor, search }) => {
    if (search === null) return pageOf(library.tracks, cursor);
    await searchMayAnswer;
    return pageOf(
      library.tracks.filter((track) => track.title.includes(search)),
      cursor,
    );
  });
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });
  await expect(table.getByRole("row", { name: /Test track/ })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search tracks" }).fill("Track 002");
  // The search request is sent once the filter has settled; the old list still shows.
  await expect.poll(() => native.callsTo("listLibraryTracks").length).toBe(2);
  await page.getByRole("button", { name: "Play Test track" }).click();
  await expect.poll(() => native.callsTo("startPlayback").length).toBe(1);
  expect(native.callsTo("startPlayback")[0]!.context).toMatchObject({
    kind: "tracks",
    search: null,
  });

  releaseSearch();
  await expect(table.getByRole("row", { name: /Test track/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Play Track 002" }).click();
  await expect.poll(() => native.callsTo("startPlayback").length).toBe(2);
  expect(native.callsTo("startPlayback")[1]!.context).toMatchObject({
    kind: "tracks",
    search: "Track 002",
  });
});

test("uses the album as the queue context when Play album starts playback", async ({
  page,
  native,
  player,
  library,
}) => {
  player.setSequence(albumSequence(library));
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();
  await page.getByRole("button", { name: "Play album" }).click();
  await expect
    .poll(() => native.callsTo("startPlayback").map((call) => call.context))
    .toEqual([{ kind: "album", key: library.albumDetails.summary.key }]);

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByText("Test track", { exact: true })).toBeVisible();
  const next = page.getByRole("button", { name: "Next track" });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(dock.getByText("Track 002", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous track" })).toBeEnabled();
});
