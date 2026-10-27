import { QueryClient } from "@tanstack/svelte-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AlbumId, type AlbumListItem, type LibraryState } from "#lib/native/bindings";
import { library } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import { libraryStatusMessage, scanFailureMessage } from "./library-catalog.svelte";
import { Library } from "./library.svelte";
import type { LibraryCatalogRequest, Page } from "./types";

/** The list and index commands resolve to empty pages, as the Backend does for an empty Library. */
const mocks = vi.hoisted(() => ({
  commands: {
    libraryListAlbums: vi.fn(),
    libraryListArtists: vi.fn(),
    libraryListTracks: vi.fn(),
    libraryAlbumIndex: vi.fn(),
    libraryArtistIndex: vi.fn(),
    libraryTrackIndex: vi.fn(),
    libraryArtist: vi.fn(),
    libraryListArtistAlbums: vi.fn(),
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

/** Runs the query function of query options, as TanStack Query does. */
async function runQuery(
  options: { queryFn?: unknown; queryKey?: readonly unknown[] },
  pageParam = 0,
): Promise<unknown> {
  const queryFn = options.queryFn as (context: unknown) => Promise<unknown>;
  return queryFn({ pageParam, queryKey: options.queryKey });
}

const albumId = "0f0e0d0c0b0a09080706050403020100" as AlbumId;
const artistId = "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99";

const summary = (year: number): AlbumListItem => ({
  id: albumId,
  title: "Abbey Road",
  albumArtist: { id: artistId, name: "The Beatles" },
  artwork: null,
  year,
});

/** A page the query cache holds: the Result of a read that succeeded. */
const page = (items: AlbumListItem[]): Result<Page<AlbumListItem>> => ({
  ok: true,
  value: { items, total: items.length, version: 1 },
});

const albumsRequest: LibraryCatalogRequest = {
  presentation: "albums",
  filter: "",
  sortKey: "title",
  direction: "ascending",
  skip: 0,
};

function libraryState(version: number, status: "idle" | "running" = "idle"): LibraryState {
  return {
    status: { status: "ready" },
    version,
    directories: [],
    scan: {
      status,
      currentDirectory: null,
      expectedCount: 0,
      progress: null,
      discoveredCount: 0,
      inspectedCount: 0,
      indexedCount: 0,
      failedCount: 0,
      failure: null,
    },
  };
}

describe("Library catalog lists", () => {
  it("lists albums with the request's sort, direction, and skip", async () => {
    const lib = new Library(library, new QueryClient());

    await runQuery(
      lib.getCatalogPages(
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
    const lib = new Library(library, new QueryClient());

    await runQuery(
      lib.getCatalogPages(
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
    const lib = new Library(library, new QueryClient());
    const request: LibraryCatalogRequest = {
      presentation: "tracks",
      filter: "",
      sortKey: "duration",
      direction: "ascending",
      skip: 10,
    };

    await runQuery(lib.getCatalogPages(request, true), 10);
    await runQuery(lib.getCatalogIndex(request, true));

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
    const lib = new Library(library, new QueryClient());

    await runQuery(
      lib.getCatalogIndex(
        { presentation: "albums", filter: "x", sortKey: "year", direction: "ascending", skip: 0 },
        true,
      ),
    );
    await runQuery(
      lib.getCatalogIndex(
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
    const lib = new Library(library, queryClient);
    const key = lib.getCatalogPages(
      { presentation: "tracks", filter: "", sortKey: "title", direction: "ascending", skip: 0 },
      true,
    ).queryKey;
    queryClient.setQueryData<unknown>(key, { pages: [1, 2, 3], pageParams: [0, 100, 200] });

    lib.refresh();

    expect(queryClient.getQueryData(key)).toEqual({ pages: [1], pageParams: [0] });
  });
});

describe("Library catalog page versions", () => {
  const tracksRequest: LibraryCatalogRequest = {
    presentation: "tracks",
    filter: "",
    sortKey: "title",
    direction: "ascending",
    skip: 0,
  };

  it("starts the list over when a page was read at another Library version", async () => {
    const queryClient = new QueryClient();
    const lib = new Library(library, queryClient);
    const options = lib.getCatalogPages(tracksRequest, true);
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
    const lib = new Library(library, queryClient);
    const options = lib.getCatalogPages(tracksRequest, true);
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

describe("Library album reads", () => {
  it("reads the album by its ID from a cached album list", () => {
    const queryClient = new QueryClient();
    const lib = new Library(library, queryClient);
    queryClient.setQueryData(lib.getCatalogPages(albumsRequest, true).queryKey, {
      pages: [page([summary(1969)])],
      pageParams: [0],
    });

    expect(lib.getCachedAlbum(albumId)).toEqual(summary(1969));
    expect(lib.getCachedAlbum("ffffffffffffffffffffffffffffffff" as AlbumId)).toBeNull();
  });

  it("reads the album from a cached artist album list", () => {
    const queryClient = new QueryClient();
    const lib = new Library(library, queryClient);
    queryClient.setQueryData(
      lib.getArtistAlbums({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
      { pages: [page([summary(1969)])], pageParams: [0] },
    );

    expect(lib.getCachedAlbum(albumId)).toEqual(summary(1969));
  });

  it("returns null without writing to the cache when no list holds the album", () => {
    const queryClient = new QueryClient();
    const lib = new Library(library, queryClient);
    const before = queryClient.getQueryCache().getAll().length;

    expect(lib.getCachedAlbum(albumId)).toBeNull();
    expect(queryClient.getQueryCache().getAll().length).toBe(before);
    expect(queryClient.getQueryData(lib.getAlbum(albumId).queryKey)).toBeUndefined();
  });

  it("writes nothing to the cache when it finds the album", () => {
    const queryClient = new QueryClient();
    const lib = new Library(library, queryClient);
    const listKey = lib.getCatalogPages(albumsRequest, true).queryKey;
    const list = { pages: [page([summary(1969)])], pageParams: [0] };
    queryClient.setQueryData(listKey, list);

    lib.getCachedAlbum(albumId);

    expect(queryClient.getQueryData(listKey)).toBe(list);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([listKey]);
  });
});

describe("Library artist reads", () => {
  it("keys the detail and album queries by the artist ID", () => {
    const lib = new Library(library, new QueryClient());

    expect(lib.getArtist(artistId).queryKey).toContain(artistId);
    expect(
      lib.getArtistAlbums({ artistId, sortKey: "year", direction: "ascending" }).queryKey,
    ).toContain(artistId);
  });

  it("fetches the detail by ID", async () => {
    const lib = new Library(library, new QueryClient());

    await runQuery(lib.getArtist(artistId));

    expect(commands.libraryArtist).toHaveBeenCalledWith(artistId);
  });

  it("pages the album list by offset, from the one the page asks for", async () => {
    const lib = new Library(library, new QueryClient());
    const options = lib.getArtistAlbums({
      artistId,
      sortKey: "title",
      direction: "descending",
    });

    await runQuery(options, 100);

    expect(commands.libraryListArtistAlbums).toHaveBeenCalledWith(artistId, {
      search: null,
      sort: "title",
      direction: "descending",
      offset: 100,
      limit: 100,
    });
  });
});

describe("Library views", () => {
  it("starts from each presentation's default sort", () => {
    const lib = new Library(library, new QueryClient());
    expect(lib.albums.request).toEqual({
      presentation: "albums",
      filter: "",
      sortKey: "title",
      direction: "ascending",
      skip: 0,
    });
    expect(lib.albumArtists.sortKey).toBe("artist");
    expect(lib.tracks.sortKey).toBe("title");
    expect(lib.artistAlbums.sortKey).toBe("year");
  });

  it("keeps each presentation independent", () => {
    const lib = new Library(library, new QueryClient());
    lib.albums.setFilter("abbey");
    lib.tracks.setSort("duration", "descending");
    expect(lib.albums.filter).toBe("abbey");
    expect(lib.tracks.request.sortKey).toBe("duration");
    expect(lib.tracks.direction).toBe("descending");
    expect(lib.albumArtists.filter).toBe("");
    expect(lib.albums.sortKey).toBe("title");
  });

  it("enters a list at a letter and starts over from the top when the filter or sort changes", () => {
    const lib = new Library(library, new QueryClient());
    const top = lib.tracks.stateKey;

    lib.tracks.jumpTo(1_200);
    expect(lib.tracks.request.skip).toBe(1_200);
    expect(lib.tracks.stateKey).not.toBe(top);

    lib.tracks.setFilter("x");
    expect(lib.tracks.skip).toBe(0);
    lib.tracks.jumpTo(5);
    lib.tracks.setSort("artist");
    expect(lib.tracks.skip).toBe(0);
    lib.tracks.jumpTo(5);
    lib.tracks.toggleDirection();
    expect(lib.tracks.skip).toBe(0);
  });

  it("resets direction to ascending when the sort key changes without one", () => {
    const lib = new Library(library, new QueryClient());
    lib.albums.setSort("year", "descending");
    lib.albums.setSort("artist");
    expect(lib.albums.direction).toBe("ascending");
  });

  it("toggles direction and changes stateKey with any part of the view", () => {
    const lib = new Library(library, new QueryClient());
    const before = lib.albums.stateKey;
    lib.albums.toggleDirection();
    expect(lib.albums.direction).toBe("descending");
    expect(lib.albums.stateKey).not.toBe(before);
    lib.artistAlbums.toggleDirection();
    expect(lib.artistAlbums.direction).toBe("descending");
  });
});

describe("Library state", () => {
  it("holds the pushed state without a change of the Library version", () => {
    const lib = new Library(library, new QueryClient());

    expect(lib.accept(libraryState(0, "running"))).toBe(false);

    expect(lib.state?.scan.status).toBe("running");
  });

  it("reports the change once when the Library version moves", () => {
    const lib = new Library(library, new QueryClient());

    expect(lib.accept(libraryState(1))).toBe(true);
    expect(lib.accept(libraryState(1))).toBe(false);
  });

  it("never misses a change, even when the states between two versions are dropped", () => {
    const lib = new Library(library, new QueryClient());

    expect(lib.accept(libraryState(1))).toBe(true);
    expect(lib.accept(libraryState(2))).toBe(true);
    expect(lib.accept(libraryState(3))).toBe(true);
  });

  it("holds each pushed state, so the newest push is the one it shows", () => {
    const lib = new Library(library, new QueryClient());

    lib.accept(libraryState(2));
    lib.accept(libraryState(1));

    expect(lib.state?.version).toBe(1);
  });
});

describe("libraryStatusMessage", () => {
  it("has no message while the library is ready", () => {
    expect(libraryStatusMessage({ status: "ready" })).toBeNull();
  });

  it("says the library storage is unavailable", () => {
    expect(libraryStatusMessage({ status: "unavailable" })).toBe(
      "The library storage is unavailable.",
    );
  });
});

describe("scanFailureMessage", () => {
  it("never exposes a raw failure code", () => {
    expect(scanFailureMessage("directoryUnreadable")).toBe(
      "A library directory could not be read.",
    );
    expect(scanFailureMessage("failed")).toBe("The scan stopped unexpectedly.");
    expect(scanFailureMessage("unknownInternalCode")).toBe("The scan stopped unexpectedly.");
    expect(scanFailureMessage(null)).toBe("The scan stopped unexpectedly.");
  });
});
