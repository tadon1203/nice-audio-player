import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "#lib/native/commands";
import { CatalogRepository, type LibraryCatalogRequest } from "./catalog-repository";

/** The list and index commands resolve to empty pages, as the Backend does for an empty Library. */
const mocks = vi.hoisted(() => ({
  commands: {
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
const empty = { items: [], total: 0, version: 1 };

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
async function runQuery(
  options: { queryFn?: unknown; queryKey?: readonly unknown[] },
  pageParam = 0,
): Promise<unknown> {
  const queryFn = options.queryFn as (context: unknown) => Promise<unknown>;
  return queryFn({ pageParam, queryKey: options.queryKey });
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
      4,
    );

    expect(commands.libraryListAlbums).toHaveBeenCalledWith({
      search: "abbey",
      sort: "year",
      direction: "descending",
      offset: 4,
      limit: 100,
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
    );

    expect(commands.libraryListArtists).toHaveBeenCalledWith({
      search: null,
      sort: "albumCount",
      direction: "ascending",
      offset: 0,
      limit: 100,
    });
  });

  it("lists tracks, and reads the letter index of the same list", async () => {
    const repository = new CatalogRepository(library, new QueryClient());
    const request: LibraryCatalogRequest = {
      presentation: "tracks",
      filter: "",
      sortKey: "duration",
      direction: "ascending",
      skip: 10,
    };

    await runQuery(repository.pageOptions(request, true), 10);
    await runQuery(repository.indexOptions(request, true));

    expect(commands.libraryListTracks).toHaveBeenCalledWith({
      search: null,
      sort: "duration",
      direction: "ascending",
      offset: 10,
      limit: 100,
    });
    expect(commands.libraryTrackIndex).toHaveBeenCalledWith({
      search: null,
      sort: "duration",
      direction: "ascending",
      offset: 0,
      limit: 0,
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
      sort: "year",
      direction: "ascending",
      offset: 0,
      limit: 0,
    });
    expect(commands.libraryArtistIndex).toHaveBeenCalledWith({
      search: null,
      sort: "artist",
      direction: "descending",
      offset: 0,
      limit: 0,
    });
  });

  it("starts every loaded list over from its first page on refresh", () => {
    const queryClient = new QueryClient();
    const repository = new CatalogRepository(library, queryClient);
    const key = ["library", "data", "catalog", { presentation: "tracks" }];
    queryClient.setQueryData(key, { pages: [1, 2, 3], pageParams: [0, 100, 200] });

    repository.refresh();

    expect(queryClient.getQueryData(key)).toEqual({ pages: [1], pageParams: [0] });
  });
});

describe("CatalogRepository page versions", () => {
  it("starts the list over when a page was read at another Library version", async () => {
    const queryClient = new QueryClient();
    const repository = new CatalogRepository(library, queryClient);
    const options = repository.pageOptions(
      {
        presentation: "tracks",
        filter: "",
        sortKey: "title",
        direction: "ascending",
        skip: 0,
      },
      true,
    );
    queryClient.setQueryData(options.queryKey, {
      pages: [{ ok: true, value: { items: [], total: 200, version: 1 } }],
      pageParams: [0],
    });
    commands.libraryListTracks.mockResolvedValue({ items: [], total: 200, version: 2 });
    const reset = vi.spyOn(queryClient, "resetQueries").mockResolvedValue(undefined);

    await runQuery(options, 100);

    expect(reset).toHaveBeenCalledWith({ queryKey: options.queryKey, exact: true });
  });

  it("keeps the list when the page was read at the version of the first page", async () => {
    const queryClient = new QueryClient();
    const repository = new CatalogRepository(library, queryClient);
    const options = repository.pageOptions(
      {
        presentation: "tracks",
        filter: "",
        sortKey: "title",
        direction: "ascending",
        skip: 0,
      },
      true,
    );
    queryClient.setQueryData(options.queryKey, {
      pages: [{ ok: true, value: { items: [], total: 200, version: 1 } }],
      pageParams: [0],
    });
    commands.libraryListTracks.mockResolvedValue({ items: [], total: 200, version: 1 });
    const reset = vi.spyOn(queryClient, "resetQueries");

    await runQuery(options, 100);

    expect(reset).not.toHaveBeenCalled();
  });
});
