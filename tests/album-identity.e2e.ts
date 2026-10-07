import type { ArtworkRef, LibraryAlbumSummary } from "$lib/native";
import { testAlbum, testLibrary } from "./fixtures/data";
import { expect, test } from "./fixtures/test";

// A pixel is enough: the test reads which artwork files the page asked for, not how they look.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

const artworkOf = (pair: string): ArtworkRef => {
  const contentHash = pair.repeat(32);
  return {
    contentHash,
    mimeType: "png",
    relativePath: `artwork/${pair}/${contentHash}.png`,
  };
};
const printings = [
  { edition: "1/Artist/Test album", artwork: artworkOf("ab"), track: "First printing track" },
  { edition: "2/Artist/Test album", artwork: artworkOf("cd"), track: "Second printing track" },
];

const albums: LibraryAlbumSummary[] = printings.map(({ edition, artwork }) => ({
  ...testAlbum,
  key: { ...testAlbum.key, albumEdition: edition },
  artwork,
}));

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
  const printingOf = (key: { albumEdition: string }) =>
    printings.findIndex((entry) => entry.edition === key.albumEdition);

  native.respond("listLibraryAlbums", () => ({
    items: albums,
    totalCount: albums.length,
    nextCursor: null,
  }));
  native.respond("getLibraryAlbumDetails", ({ albumKey }) => ({
    ...base.albumDetails,
    summary: albums[printingOf(albumKey)]!,
  }));
  native.respond("listLibraryAlbumTracks", ({ albumKey }) => ({
    ...base.albumTracks,
    items: [{ ...base.albumTracks.items[0]!, title: printings[printingOf(albumKey)]!.track }],
    totalCount: 1,
  }));

  await page.goto("/library/albums");
  const tiles = page.getByRole("link", { name: "Open album Test album by Test artist" });
  await expect(tiles).toHaveCount(2);

  for (const [index, { track, artwork }] of printings.entries()) {
    await tiles.nth(index).click();
    const table = page.getByRole("table", { name: "Album tracks" });
    await expect(table.getByText(track, { exact: true })).toBeVisible();
    await expect.poll(() => requested.includes(`/${artwork.relativePath}`)).toBe(true);
    for (const other of printings.filter((entry) => entry.track !== track)) {
      await expect(table.getByText(other.track, { exact: true })).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Albums", exact: true }).first().click();
    await expect(tiles).toHaveCount(2);
  }
});
