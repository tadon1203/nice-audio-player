import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it, vi } from "vitest";
import type { LibraryClient } from "#lib/native";
import { CatalogRepository, type LibraryCatalogRequest } from "./catalog-repository";
import type { Mock } from "vitest";

/** A fake client whose list methods resolve to empty pages. */
function fakeClient(): {
  albums: Mock<() => Promise<{ items: never[]; totalCount: number; nextCursor: null }>>;
  albumArtists: Mock<() => Promise<{ items: never[]; totalCount: number; nextCursor: null }>>;
  tracks: Mock<() => Promise<{ items: never[]; totalCount: number; nextCursor: null }>>;
  albumIndex: Mock<() => Promise<never[]>>;
  albumArtistIndex: Mock<() => Promise<never[]>>;
  trackIndex: Mock<() => Promise<never[]>>;
  status: Mock<() => Promise<{ status: "ready" }>>;
} {
  const empty = { items: [], totalCount: 0, nextCursor: null };
  return {
    albums: vi.fn(async () => empty),
    albumArtists: vi.fn(async () => empty),
    tracks: vi.fn(async () => empty),
    albumIndex: vi.fn(async () => []),
    albumArtistIndex: vi.fn(async () => []),
    trackIndex: vi.fn(async () => []),
    status: vi.fn(async () => ({ status: "ready" as const })),
  };
}

type Client = ReturnType<typeof fakeClient>;

/** Runs the query function of a repository's options, as TanStack Query does. */
async function runQuery(options: { queryFn?: unknown }, context: unknown = {}): Promise<unknown> {
  const queryFn = options.queryFn as (context: unknown) => Promise<unknown>;
  return queryFn(context);
}

function repositoryWith(client: Client): CatalogRepository {
  return new CatalogRepository(client as unknown as LibraryClient, new QueryClient());
}

describe("CatalogRepository", () => {
  it("lists albums with the request's sort, direction, and skip", async () => {
    const client = fakeClient();
    const repository = repositoryWith(client);

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

    expect(client.albums).toHaveBeenCalledWith(null, "abbey", "year", "descending", 4);
  });

  it("lists album artists with the request's sort and an empty filter as no search", async () => {
    const client = fakeClient();
    const repository = repositoryWith(client);

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

    expect(client.albumArtists).toHaveBeenCalledWith(null, null, "albumCount", "ascending", 0);
  });

  it("lists tracks, and reads the scroll index of the same list", async () => {
    const client = fakeClient();
    const repository = repositoryWith(client);
    const request: LibraryCatalogRequest = {
      presentation: "tracks",
      filter: "",
      sortKey: "duration",
      direction: "ascending",
      skip: 10,
    };

    await runQuery(repository.pageOptions(request, true), { pageParam: null });
    await runQuery(repository.indexOptions(request, true));

    expect(client.tracks).toHaveBeenCalledWith(null, null, "duration", "ascending", 10);
    expect(client.trackIndex).toHaveBeenCalledWith(null, "duration", "ascending");
  });

  it("reads the index of albums and album artists from their own calls", async () => {
    const client = fakeClient();
    const repository = repositoryWith(client);

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

    expect(client.albumIndex).toHaveBeenCalledWith("x", "year", "ascending");
    expect(client.albumArtistIndex).toHaveBeenCalledWith(null, "artist", "descending");
  });

  it("starts every loaded list over from its first page on refresh", () => {
    const queryClient = new QueryClient();
    const repository = new CatalogRepository(fakeClient() as unknown as LibraryClient, queryClient);
    const key = ["library", "data", "catalog", { presentation: "tracks" }];
    queryClient.setQueryData(key, { pages: [1, 2, 3], pageParams: [null, "a", "b"] });

    repository.refresh();

    expect(queryClient.getQueryData(key)).toEqual({ pages: [1], pageParams: [null] });
  });

  it("reads the library status through the status call", async () => {
    const client = fakeClient();
    const repository = repositoryWith(client);

    await expect(runQuery(repository.statusOptions())).resolves.toEqual({ status: "ready" });
    expect(client.status).toHaveBeenCalledOnce();
  });
});
