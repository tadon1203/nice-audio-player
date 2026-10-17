import { describe, expect, it, vi } from "vitest";
import type { LibraryClient } from "#lib/native";
import { ArtistRepository } from "./artist-repository";
import { LibraryQueryKeys } from "./library-query-keys";

const artistId = "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99";

const fakeClient = () =>
  ({
    artist: vi.fn(async () => ({ id: artistId, name: "The Beatles" })),
    artistAlbums: vi.fn(async () => ({ items: [], totalCount: 0, nextCursor: null })),
    albumArtist: vi.fn(async () => ({ id: artistId, name: "The Beatles" })),
    albumArtistAlbums: vi.fn(async () => ({ items: [], totalCount: 0, nextCursor: null })),
  }) as unknown as LibraryClient & Record<string, ReturnType<typeof vi.fn>>;

describe("ArtistRepository", () => {
  it("keys the detail and album queries by the artist ID", () => {
    const repository = new ArtistRepository(fakeClient());

    expect(repository.detailsOptions(artistId).queryKey).toEqual(LibraryQueryKeys.artist(artistId));
    expect(
      repository.albumsOptions({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
    ).toEqual(LibraryQueryKeys.artistAlbums({ artistId, sortKey: "year", direction: "ascending" }));
  });

  it("keeps the name route's queries apart from the ID's", () => {
    const repository = new ArtistRepository(fakeClient());
    const key = { name: "The Beatles" };

    expect(repository.albumArtistDetailsOptions(key).queryKey).not.toEqual(
      repository.detailsOptions(artistId).queryKey,
    );
    expect(
      repository.albumArtistAlbumsOptions({ key, sortKey: "year", direction: "ascending" })
        .queryKey,
    ).not.toEqual(
      repository.albumsOptions({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
    );
  });

  it("fetches the detail by ID", async () => {
    const client = fakeClient();
    const repository = new ArtistRepository(client);
    const options = repository.detailsOptions(artistId);

    await (options.queryFn as () => Promise<unknown>)();

    expect(client.artist).toHaveBeenCalledWith(artistId);
  });

  it("pages the album list by ID with the cursor", async () => {
    const client = fakeClient();
    const repository = new ArtistRepository(client);
    const options = repository.albumsOptions({
      artistId,
      sortKey: "title",
      direction: "descending",
    });

    await (options.queryFn as (context: unknown) => Promise<unknown>)({ pageParam: "next" });

    expect(client.artistAlbums).toHaveBeenCalledWith({
      artistId,
      cursor: "next",
      sortKey: "title",
      sortDirection: "descending",
    });
  });
});
