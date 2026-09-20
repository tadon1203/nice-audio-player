import { expect, test } from "@playwright/test";
import { installElectronApi } from "./fixtures/electron-api";

test("shows playback initialization failure instead of remaining loading", async ({ page }) => {
  await installElectronApi(page, { failPlaybackInitialization: true });
  await page.goto("/library/albums");

  const dock = page.getByRole("contentinfo", { name: "Playback controls" });
  await expect(dock.getByRole("alert")).toHaveText("No audio output device is available.");
  await expect(page.getByRole("button", { name: "Mute", exact: true })).toBeDisabled();
});

test("does not present an album track query failure as an empty album", async ({ page }) => {
  await installElectronApi(page, { failAlbumTracks: true });
  await page.goto("/library/albums");
  await page.getByRole("link", { name: "Open album Test album by Test artist" }).click();

  await expect(page.getByRole("alert")).toHaveText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("does not present an artist album query failure as an empty artist", async ({ page }) => {
  await installElectronApi(page, { failArtistAlbums: true });
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();

  await expect(page.getByRole("alert")).toHaveText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows an album summary query failure in the album workspace", async ({ page }) => {
  await installElectronApi(page, { failAlbumDetails: true });
  await page.goto("/library/albums/Test%20artist/Test%20album");

  await expect(page.getByRole("alert")).toHaveText("The library database could not be updated.");
  await expect(page.getByText("No tracks were indexed for this album.")).toHaveCount(0);
});

test("shows an artist summary query failure in the artist workspace", async ({ page }) => {
  await installElectronApi(page, { failArtistDetails: true });
  await page.goto("/library/album-artists/Test%20artist");

  await expect(page.getByRole("alert")).toHaveText("The library database could not be updated.");
  await expect(page.getByText("No albums were indexed for this artist.")).toHaveCount(0);
});

test("shows the structured library unavailable reason", async ({ page }) => {
  await installElectronApi(page, { libraryUnavailable: true });
  await page.goto("/library/albums");

  await expect(page.getByRole("alert")).toHaveText("The library database is corrupt.");
});
