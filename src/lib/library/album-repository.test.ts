import { QueryClient } from "@tanstack/svelte-query";
import { describe, expect, it } from "vitest";
import type {
  AlbumId,
  LibraryAlbumKey,
  LibraryAlbumPage,
  LibraryAlbumSummary,
  LibraryClient,
} from "#lib/native";
import { AlbumRepository } from "./album-repository";
import { LibraryQueryKeys } from "./library-query-keys";

const key: LibraryAlbumKey = { title: "Abbey Road", albumArtist: "The Beatles", albumEdition: "" };

const summary = (albumKey: LibraryAlbumKey, year: number): LibraryAlbumSummary => ({
  id: "0f0e0d0c0b0a09080706050403020100",
  title: albumKey.title,
  key: albumKey,
  albumArtist: { id: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99", name: albumKey.albumArtist },
  artwork: null,
  year,
});

const page = (items: LibraryAlbumSummary[]): LibraryAlbumPage => ({
  items,
  totalCount: items.length,
  nextCursor: null,
});

/** `cachedSummary` never calls the client, so the fake has no methods. */
const fakeClient = () => ({}) as LibraryClient;

describe("AlbumRepository.cachedSummary", () => {
  it("reads the album from a cached album list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      LibraryQueryKeys.catalog({
        presentation: "albums",
        filter: "",
        sortKey: "title",
        direction: "ascending",
        skip: 0,
      }),
      { pages: [page([summary(key, 1969)])], pageParams: [null] },
    );
    const repository = new AlbumRepository(fakeClient(), queryClient);

    expect(repository.cachedSummary(key)).toEqual(summary(key, 1969));
  });

  it("reads the album from a cached artist album list", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      LibraryQueryKeys.artistAlbums({
        artistId: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99",
        sortKey: "year",
        direction: "ascending",
      }),
      { pages: [page([summary(key, 1969)])], pageParams: [null] },
    );
    const repository = new AlbumRepository(fakeClient(), queryClient);

    expect(repository.cachedSummary(key)).toEqual(summary(key, 1969));
  });

  it("reads the album by its ID", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      LibraryQueryKeys.catalog({
        presentation: "albums",
        filter: "",
        sortKey: "title",
        direction: "ascending",
        skip: 0,
      }),
      { pages: [page([summary(key, 1969)])], pageParams: [null] },
    );
    const repository = new AlbumRepository(fakeClient(), queryClient);

    expect(repository.cachedSummaryById(summary(key, 1969).id)?.year).toBe(1969);
    expect(repository.cachedSummaryById("ffffffffffffffffffffffffffffffff" as AlbumId)).toBeNull();
  });

  it("returns null without writing to the cache when no list holds the album", () => {
    const queryClient = new QueryClient();
    const repository = new AlbumRepository(fakeClient(), queryClient);
    const before = queryClient.getQueryCache().getAll().length;

    expect(repository.cachedSummary(key)).toBeNull();
    expect(queryClient.getQueryCache().getAll().length).toBe(before);
    expect(queryClient.getQueryData(LibraryQueryKeys.albumByKey(key))).toBeUndefined();
  });

  it("writes nothing to the cache when it finds the album", () => {
    const queryClient = new QueryClient();
    const listKey = LibraryQueryKeys.catalog({
      presentation: "albums",
      filter: "",
      sortKey: "title",
      direction: "ascending",
      skip: 0,
    });
    const list = { pages: [page([summary(key, 1969)])], pageParams: [null] };
    queryClient.setQueryData(listKey, list);
    const repository = new AlbumRepository(fakeClient(), queryClient);

    repository.cachedSummary(key);

    expect(queryClient.getQueryData(listKey)).toBe(list);
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([listKey]);
  });
});
