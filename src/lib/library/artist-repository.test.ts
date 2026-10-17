import { describe, expect, it, vi } from "vitest";
import type { LibraryClient } from "#lib/native";
import { ArtistRepository } from "./artist-repository";
import { LibraryQueryKeys } from "./library-query-keys";
import type { Mock } from "vitest";

const artistId = "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99";

const fakeClient = (): {
  client: LibraryClient;
  artist: Mock<() => Promise<{ id: string; name: string }>>;
  artistAlbums: Mock<() => Promise<{ items: never[]; totalCount: number; nextCursor: null }>>;
} => {
  const artist = vi.fn(async () => ({ id: artistId, name: "The Beatles" }));
  const artistAlbums = vi.fn(async () => ({ items: [], totalCount: 0, nextCursor: null }));
  const client = { artist, artistAlbums } as unknown as LibraryClient;
  return { client, artist, artistAlbums };
};

describe("ArtistRepository", () => {
  it("keys the detail and album queries by the artist ID", () => {
    const repository = new ArtistRepository(fakeClient().client);

    expect(repository.detailsOptions(artistId).queryKey).toEqual(LibraryQueryKeys.artist(artistId));
    expect(
      repository.albumsOptions({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
    ).toEqual(LibraryQueryKeys.artistAlbums({ artistId, sortKey: "year", direction: "ascending" }));
  });

  it("fetches the detail by ID", async () => {
    const { client, artist } = fakeClient();
    const repository = new ArtistRepository(client);
    const options = repository.detailsOptions(artistId);

    await (options.queryFn as () => Promise<unknown>)();

    expect(artist).toHaveBeenCalledWith(artistId);
  });

  it("pages the album list by ID with the cursor", async () => {
    const { client, artistAlbums } = fakeClient();
    const repository = new ArtistRepository(client);
    const options = repository.albumsOptions({
      artistId,
      sortKey: "title",
      direction: "descending",
    });

    await (options.queryFn as (context: unknown) => Promise<unknown>)({ pageParam: "next" });

    expect(artistAlbums).toHaveBeenCalledWith({
      artistId,
      cursor: "next",
      sortKey: "title",
      sortDirection: "descending",
    });
  });
});
