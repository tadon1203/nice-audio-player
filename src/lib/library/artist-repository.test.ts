import { describe, expect, it, vi } from "vitest";
import { library } from "#lib/native/commands";
import { ArtistRepository } from "./artist-repository";
import { LibraryQueryKeys } from "./library-query-keys";

const mocks = vi.hoisted(() => ({
  commands: { libraryArtist: vi.fn(), libraryListArtistAlbums: vi.fn() },
}));
vi.mock("#lib/native/bindings", () => ({ commands: mocks.commands }));

const artistId = "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99";

describe("ArtistRepository", () => {
  it("keys the detail and album queries by the artist ID", () => {
    const repository = new ArtistRepository(library);

    expect(repository.detailsOptions(artistId).queryKey).toEqual(LibraryQueryKeys.artist(artistId));
    expect(
      repository.albumsOptions({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
    ).toEqual(LibraryQueryKeys.artistAlbums({ artistId, sortKey: "year", direction: "ascending" }));
  });

  it("fetches the detail by ID", async () => {
    const repository = new ArtistRepository(library);
    const options = repository.detailsOptions(artistId);

    await (options.queryFn as () => Promise<unknown>)();

    expect(mocks.commands.libraryArtist).toHaveBeenCalledWith(artistId);
  });

  it("pages the album list by offset, from the one the page asks for", async () => {
    const repository = new ArtistRepository(library);
    const options = repository.albumsOptions({
      artistId,
      sortKey: "title",
      direction: "descending",
    });

    await (options.queryFn as (context: unknown) => Promise<unknown>)({ pageParam: 100 });

    expect(mocks.commands.libraryListArtistAlbums).toHaveBeenCalledWith(artistId, {
      search: null,
      sort: "title",
      direction: "descending",
      offset: 100,
      limit: 100,
    });
  });
});
