import type { ArtworkRef, LibraryAlbumSummary } from "#lib/native";
import { testAlbum, testLibrary } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

// A pixel is enough: the test reads which artwork files the page asked for, not how they look.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

const artworkOf = (pair: string): ArtworkRef => ({
  hash: pair.repeat(32),
  mimeType: "png",
});
const printings = [
  {
    id: "a1".repeat(16),
    artwork: artworkOf("ab"),
    track: "First printing track",
  },
  {
    id: "b2".repeat(16),
    artwork: artworkOf("cd"),
    track: "Second printing track",
  },
];

const albums: LibraryAlbumSummary[] = printings.map(({ id, artwork }) => ({
  ...testAlbum,
  id,
  artwork,
}));

test("an album opened from its Album Artist page keeps that artist through a reload", async ({
  page,
}) => {
  await page.goto("/library/album-artists");
  await page.getByRole("link", { name: "Browse albums by Test artist" }).click();
  await page.getByRole("link", { name: "Open album Test album" }).click();
  const albumUrl = /\/library\/album-artists\/[0-9a-f]{32}\/albums\/[0-9a-f]{32}$/;
  await expect(page).toHaveURL(albumUrl);
  await page.reload();
  await expect(page).toHaveURL(albumUrl);
  await page.getByRole("link", { name: "Test artist", exact: true }).click();
  await expect(page).toHaveURL(/\/library\/album-artists\/[0-9a-f]{32}$/);
  await expect(page.getByRole("heading", { name: "Test artist" })).toBeVisible();
});

test("two albums with one title and Album Artist in two folders each open their own page", async ({
  page,
  native,
}) => {
  const base = testLibrary();
  const requested: string[] = [];
  await page.route("http://nice-artwork.localhost/**", (route) => {
    requested.push(new URL(route.request().url()).pathname);
    return route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  const printingOf = (albumId: string) => printings.findIndex((entry) => entry.id === albumId);

  native.respond("listLibraryAlbums", () => ({
    items: albums,
    totalCount: albums.length,
    nextCursor: null,
  }));
  native.respond("getLibraryAlbum", ({ albumId }) => ({
    ...base.albumDetails,
    summary: albums[printingOf(albumId)]!,
  }));
  native.respond("listLibraryAlbumTracks", ({ request }) => ({
    ...base.albumTracks,
    items: [
      { ...base.albumTracks.items[0]!, title: printings[printingOf(request.albumId)]!.track },
    ],
    totalCount: 1,
  }));

  await page.goto("/library/albums");
  const tiles = page.getByRole("link", { name: "Open album Test album by Test artist" });
  await expect(tiles).toHaveCount(2);

  for (const [index, { track, artwork }] of printings.entries()) {
    await tiles.nth(index).click();
    const table = page.getByRole("table", { name: "Album tracks" });
    await expect(table.getByText(track, { exact: true })).toBeVisible();
    await expect
      .poll(() => requested.includes(`/artwork/${artwork.hash.slice(0, 2)}/${artwork.hash}.png`))
      .toBe(true);
    for (const other of printings.filter((entry) => entry.track !== track)) {
      await expect(table.getByText(other.track, { exact: true })).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Albums", exact: true }).first().click();
    await expect(tiles).toHaveCount(2);
  }
});
