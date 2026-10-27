import { type AlbumId, type ArtistId, type TrackId } from "#lib/native/bindings";
import { type ArtistAlbumsRequest, type LibraryCatalogRequest } from "./types";

/** Every Library query key starts with this, so one invalidation covers all of them. */
export const LIBRARY_KEY = ["library"] as const;
export const CATALOG_KEY = [...LIBRARY_KEY, "catalog"] as const;
export const ARTIST_ALBUMS_KEY = [...LIBRARY_KEY, "artistAlbums"] as const;

/** Where the request sits in a catalog query key: `["library", "catalog", request]`. */
const CATALOG_REQUEST_INDEX = 2;

export function catalogKey(request: LibraryCatalogRequest): readonly unknown[] {
  return [...CATALOG_KEY, request];
}

/** The letter index of a list: how its names are filed, in its order. Not tied to `skip`. */
export function catalogIndexKey(request: LibraryCatalogRequest): readonly unknown[] {
  return [...LIBRARY_KEY, "catalogIndex", { ...request, skip: 0 }];
}

/** The request that a catalog query key was built from. */
export function catalogRequestOf(key: readonly unknown[]): LibraryCatalogRequest {
  return key[CATALOG_REQUEST_INDEX] as LibraryCatalogRequest;
}

export function trackPropertiesKey(trackId: TrackId | null): readonly unknown[] {
  return [...LIBRARY_KEY, "track", "properties", trackId];
}

/** Content-addressed, so it is not under the Library key and a refresh never refetches it. */
export function accentKey(path: string | null): readonly unknown[] {
  return ["artwork", "accent", path];
}

export function albumKey(albumId: AlbumId): readonly unknown[] {
  return [...LIBRARY_KEY, "album", "detail", albumId];
}

export function albumTracksKey(albumId: AlbumId): readonly unknown[] {
  return [...LIBRARY_KEY, "album", "tracks", albumId];
}

export function artistKey(artistId: ArtistId): readonly unknown[] {
  return [...LIBRARY_KEY, "artist", "detail", artistId];
}

export function artistAlbumsKey(request: ArtistAlbumsRequest): readonly unknown[] {
  return [...ARTIST_ALBUMS_KEY, request.artistId, request.sortKey, request.direction];
}
