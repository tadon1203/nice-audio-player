import { createInfiniteQuery, createQuery } from "@tanstack/svelte-query";
import type {
  ArtworkRef,
  LibraryAlbumArtistKey,
  LibraryAlbumKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
} from "$lib/native";
import { collectionOf } from "./catalog.svelte";
import { libraryQueryOptions } from "./queries";

/*
 * Thin wrappers over the options in `queries.ts`. Arguments are accessors so the query follows
 * the route or sort it was created for. Call during component initialization.
 */

export function createAlbumDetails(key: () => LibraryAlbumKey) {
  return createQuery(() => libraryQueryOptions.album(key()));
}

export function createAlbumTracks(key: () => LibraryAlbumKey) {
  return collectionOf(createInfiniteQuery(() => libraryQueryOptions.albumTracks(key())));
}

export function createAlbumArtist(key: () => LibraryAlbumArtistKey) {
  return createQuery(() => libraryQueryOptions.artist(key()));
}

export function createArtistAlbums(
  key: () => LibraryAlbumArtistKey,
  sortKey: () => LibraryArtistAlbumSortKey,
  direction: () => LibrarySortDirection,
) {
  return collectionOf(
    createInfiniteQuery(() => libraryQueryOptions.artistAlbums(key(), sortKey(), direction())),
  );
}

/** Tags, audio format and file location of a track, read when the Properties view opens. */
export function createLibraryTrackProperties(trackId: () => string | null) {
  return createQuery(() => libraryQueryOptions.trackProperties(trackId()));
}

/** Representative artwork color as `#rrggbb`, for backgrounds only; `null` until known. */
export function createArtworkAccent(artwork: () => ArtworkRef | null | undefined) {
  const query = createQuery(() => libraryQueryOptions.accent(artwork()?.contentHash ?? null));
  return {
    get current(): string | null {
      return query.data ?? null;
    },
  };
}

export function createLibraryStatus() {
  return createQuery(() => libraryQueryOptions.status());
}

export function createLibraryScan() {
  return createQuery(() => libraryQueryOptions.scan());
}

export function createLibraryRoots() {
  return createQuery(() => libraryQueryOptions.roots());
}
