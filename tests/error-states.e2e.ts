import { idleScan, libraryState, stoppedPlayback, testAlbum } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

const internalFailure = { code: "internal" } as const;

test("shows the playback failure reason the player state carries", async ({ page, native }) => {
  await native.publish("player", {
    ...stoppedPlayback,
    status: "failed",
    item: null,
    error: "noOutputDevice",
    skipping: false,
  });
  await page.goto("/library/albums");

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("alert")).toHaveText("No audio output device is available.");
  await expect(dock.getByRole("button", { name: "Retry", exact: true }).first()).toBeVisible();
});

test("does not present an album track query failure as an empty album", async ({
  page,
  native,
}) => {
  native.fail("libraryListAlbumTracks", internalFailure);
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("Something went wrong. Try again.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("does not present an artist album query failure as an empty artist", async ({
  page,
  native,
}) => {
  native.fail("libraryListArtistAlbums", internalFailure);
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("Something went wrong. Try again.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows an album summary query failure in the album workspace", async ({ page, native }) => {
  native.fail("libraryAlbum", internalFailure);
  await page.goto(`/library/albums/${testAlbum.id}`);

  await expect(page.getByRole("alert")).toContainText("Something went wrong. Try again.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("shows an artist summary query failure in the artist workspace", async ({ page, native }) => {
  native.fail("libraryArtist", internalFailure);
  await page.goto(`/library/album-artists/${testAlbum.albumArtist.id}`);

  await expect(page.getByRole("alert")).toContainText("Something went wrong. Try again.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("the properties sheet says a track the library does not hold is not found", async ({
  page,
  native,
}) => {
  native.fail("libraryTrackProperties", { code: "notFound" });
  await page.goto("/library/tracks");
  await page
    .getByRole("table", { name: "Library tracks" })
    .getByRole("row", { name: /Track 010/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Properties" }).click();

  await expect(page.getByRole("dialog", { name: "Properties" })).toContainText(
    "That item could not be found.",
  );
});

test("shows the structured library unavailable reason", async ({ page, native }) => {
  await native.publish("library", {
    ...libraryState(idleScan, []),
    status: { status: "unavailable" },
  });
  await page.goto("/library/albums");

  await expect(page.getByRole("alert")).toContainText("The library storage is unavailable.");
});
