import { testAlbum } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

const persistenceFailure = { code: "persistenceFailed" } as const;

test("shows playback initialization failure instead of remaining loading", async ({
  page,
  native,
}) => {
  native.fail("appConnect", { code: "output", failure: "noOutputDevice" });
  await page.goto("/library/albums");

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  const playbackError = dock.getByRole("alert");
  await expect(playbackError).toHaveText("No audio output device is available.");
  await playbackError.focus();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(
    "No audio output device is available.",
  );
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeDisabled();
});

test("does not present an album track query failure as an empty album", async ({
  page,
  native,
}) => {
  native.fail("libraryListAlbumTracks", persistenceFailure);
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("does not present an artist album query failure as an empty artist", async ({
  page,
  native,
}) => {
  native.fail("libraryListArtistAlbums", persistenceFailure);
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows an album summary query failure in the album workspace", async ({ page, native }) => {
  native.fail("libraryAlbum", persistenceFailure);
  await page.goto(`/library/albums/${testAlbum.id}`);

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("shows an artist summary query failure in the artist workspace", async ({ page, native }) => {
  native.fail("libraryArtist", persistenceFailure);
  await page.goto(`/library/album-artists/${testAlbum.albumArtist.id}`);

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("the properties sheet says a track the library does not hold is not found", async ({
  page,
  native,
}) => {
  native.fail("libraryTrackProperties", { code: "trackNotFound" });
  await page.goto("/library/tracks");
  await page
    .getByRole("table", { name: "Library tracks" })
    .getByRole("row", { name: /Track 010/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Properties" }).click();

  await expect(page.getByRole("dialog", { name: "Properties" })).toContainText(
    "That track could not be found.",
  );
});

test("shows the structured library unavailable reason", async ({ page, native }) => {
  native.respond("libraryStatus", { status: "unavailable", reason: "databaseOpenFailed" });
  await page.goto("/library/albums");

  await expect(page.getByRole("alert")).toContainText("The library storage is unavailable.");
});
