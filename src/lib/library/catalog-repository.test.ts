import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "#lib/native/commands";
import { CatalogRepository, type LibraryCatalogRequest } from "./catalog-repository";

/** The list and index commands resolve to empty pages, as the Backend does for an empty Library. */
const mocks = vi.hoisted(() => ({
  commands: {
    libraryStatus: vi.fn(),
    libraryListAlbums: vi.fn(),
    libraryListArtists: vi.fn(),
    libraryListTracks: vi.fn(),
    libraryAlbumIndex: vi.fn(),
    libraryArtistIndex: vi.fn(),
    libraryTrackIndex: vi.fn(),
  },
}));
vi.mock("#lib/native/bindings", () => ({ commands: mocks.commands }));

const { commands } = mocks;
const empty = { items: [], totalCount: 0, nextCursor: null };

beforeEach(() => {
  vi.clearAllMocks();
  commands.libraryListAlbums.mockResolvedValue(empty);
  commands.libraryListArtists.mockResolvedValue(empty);
  commands.libraryListTracks.mockResolvedValue(empty);
  commands.libraryAlbumIndex.mockResolvedValue([]);
  commands.libraryArtistIndex.mockResolvedValue([]);
  commands.libraryTrackIndex.mockResolvedValue([]);
});

/** Runs the query function of a repository's options, as TanStack Query does. */
async function runQuery(options: { queryFn?: unknown }, context: unknown = {}): Promise<unknown> {
  const queryFn = options.queryFn as (context: unknown) => Promise<unknown>;
  return queryFn(context);
}

describe("CatalogRepository", () => {
  it("lists albums with the request's sort, direction, and skip", async () => {
    const repository = new CatalogRepository(library, new QueryClient());

    await runQuery(
      repository.pageOptions(
        {
          presentation: "albums",
          filter: "abbey",
          sortKey: "year",
          direction: "descending",
          skip: 4,
        },
        true,
      ),
      { pageParam: null },
    );

    expect(commands.libraryListAlbums).toHaveBeenCalledWith({
      search: "abbey",
      sortKey: "year",
      sortDirection: "descending",
      cursor: null,
      skip: 4,
    });
  });

  it("lists album artists with the request's sort and an empty filter as no search", async () => {
    const repository = new CatalogRepository(library, new QueryClient());

    await runQuery(
      repository.pageOptions(
        {
          presentation: "albumArtists",
          filter: "",
          sortKey: "albumCount",
          direction: "ascending",
          skip: 0,
        },
        true,
      ),
      { pageParam: null },
    );

    expect(commands.libraryListArtists).toHaveBeenCalledWith({
      search: null,
      sortKey: "albumCount",
      sortDirection: "ascending",
      cursor: null,
      skip: 0,
    });
  });

  it("lists tracks, and reads the scroll index of the same list", async () => {
    const repository = new CatalogRepository(library, new QueryClient());
    const request: LibraryCatalogRequest = {
      presentation: "tracks",
      filter: "",
      sortKey: "duration",
      direction: "ascending",
      skip: 10,
    };

    await runQuery(repository.pageOptions(request, true), { pageParam: null });
    await runQuery(repository.indexOptions(request, true));

    expect(commands.libraryListTracks).toHaveBeenCalledWith({
      search: null,
      sortKey: "duration",
      sortDirection: "ascending",
      cursor: null,
      skip: 10,
    });
    expect(commands.libraryTrackIndex).toHaveBeenCalledWith({
      search: null,
      sortKey: "duration",
      sortDirection: "ascending",
    });
  });

  it("reads the index of albums and album artists from their own calls", async () => {
    const repository = new CatalogRepository(library, new QueryClient());

    await runQuery(
      repository.indexOptions(
        { presentation: "albums", filter: "x", sortKey: "year", direction: "ascending", skip: 0 },
        true,
      ),
    );
    await runQuery(
      repository.indexOptions(
        {
          presentation: "albumArtists",
          filter: "",
          sortKey: "artist",
          direction: "descending",
          skip: 0,
        },
        true,
      ),
    );

    expect(commands.libraryAlbumIndex).toHaveBeenCalledWith({
      search: "x",
      sortKey: "year",
      sortDirection: "ascending",
    });
    expect(commands.libraryArtistIndex).toHaveBeenCalledWith({
      search: null,
      sortKey: "artist",
      sortDirection: "descending",
    });
  });

  it("starts every loaded list over from its first page on refresh", () => {
    const queryClient = new QueryClient();
    const repository = new CatalogRepository(library, queryClient);
    const key = ["library", "data", "catalog", { presentation: "tracks" }];
    queryClient.setQueryData(key, { pages: [1, 2, 3], pageParams: [null, "a", "b"] });

    repository.refresh();

    expect(queryClient.getQueryData(key)).toEqual({ pages: [1], pageParams: [null] });
  });

  it("reads the library status through the status command", async () => {
    commands.libraryStatus.mockResolvedValue({ status: "ready" });
    const repository = new CatalogRepository(library, new QueryClient());

    await expect(runQuery(repository.statusOptions())).resolves.toEqual({ status: "ready" });
    expect(commands.libraryStatus).toHaveBeenCalledOnce();
  });
});
