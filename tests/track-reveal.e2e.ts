import { expect, test } from "./fixtures/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
});

test("Show in Explorer from the track table reveals that track's file", async ({
  page,
  native,
  library,
}) => {
  const track = library.tracks.find((entry) => entry.title === "Track 010")!;
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });

  await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show in Explorer" }).click();

  await expect.poll(() => native.callsTo("libraryRevealTrack")).toEqual([{ trackId: track.id }]);
});

test("Show in Explorer from the properties sheet reveals that track's file", async ({
  page,
  native,
  library,
}) => {
  const track = library.tracks.find((entry) => entry.title === "Track 010")!;
  await page.goto("/library/tracks");
  const table = page.getByRole("table", { name: "Library tracks" });

  await table.getByRole("row", { name: /Track 010/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Properties" }).click();
  const sheet = page.getByRole("dialog", { name: "Properties" });
  await sheet.getByRole("button", { name: "Show in Explorer" }).click();

  await expect.poll(() => native.callsTo("libraryRevealTrack")).toEqual([{ trackId: track.id }]);
});
