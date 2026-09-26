import { expect, test } from "@playwright/test";
import { installNativeApi } from "./fixtures/native-api";

test("shows playback initialization failure instead of remaining loading", async ({ page }) => {
  await installNativeApi(page, { failPlaybackInitialization: true });
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

test("does not present an album track query failure as an empty album", async ({ page }) => {
  await installNativeApi(page, { failAlbumTracks: true });
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("does not present an artist album query failure as an empty artist", async ({ page }) => {
  await installNativeApi(page, { failArtistAlbums: true });
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows an album summary query failure in the album workspace", async ({ page }) => {
  await installNativeApi(page, { failAlbumDetails: true });
  await page.goto("/library/albums/Test%20artist/Test%20album");

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("shows an artist summary query failure in the artist workspace", async ({ page }) => {
  await installNativeApi(page, { failArtistDetails: true });
  await page.goto("/library/album-artists/Test%20artist");

  await expect(page.getByRole("alert")).toContainText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows the structured library unavailable reason", async ({ page }) => {
  await installNativeApi(page, { libraryUnavailable: true });
  await page.goto("/library/albums");

  await expect(page.getByRole("alert")).toContainText("The library database is corrupt.");
});
