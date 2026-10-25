import {
  type AlbumId,
  type ArtistId,
  type ArtworkHash,
  type ArtistAlbumSortKey,
  type SortDirection,
  type TrackId,
} from "#lib/native/bindings";
import type { LibraryCatalogRequest } from "./catalog-repository";

/** The arguments of an Album Artist's album list: which artist, and how its albums are ordered. */
export interface ArtistAlbumsArguments {
  readonly artistId: ArtistId;
  readonly sortKey: ArtistAlbumSortKey;
  readonly direction: SortDirection;
}

/** Where `LibraryQueryKeys.catalog` puts the request: after `data` and "catalog". */
const CATALOG_REQUEST_INDEX = 3;

/**
 * Every Library query key. Only this class builds them, so the cache's shape is in one place.
 * Everything under `data` is invalidated together when the catalog may have changed.
 */
export class LibraryQueryKeys {
  public static readonly data = ["library", "data"] as const;
  public static readonly catalogs = [...LibraryQueryKeys.data, "catalog"] as const;
  public static readonly status = ["library", "status"] as const;
  public static readonly directories = [...LibraryQueryKeys.data, "directories"] as const;
  /** The prefix of every Album Artist's album list, by ID, for reads across all of them. */
  public static readonly artistAlbumsPrefix = [
    ...LibraryQueryKeys.data,
    "artist",
    "albums",
  ] as const;

  /** The request a catalog query key was built from. */
  public static requestOf(key: readonly unknown[]): LibraryCatalogRequest {
    return key[CATALOG_REQUEST_INDEX] as LibraryCatalogRequest;
  }

  /** Carries the request itself, so what the data was fetched for can be read back from the key. */
  public static catalog(request: LibraryCatalogRequest): readonly unknown[] {
    return [...LibraryQueryKeys.catalogs, request];
  }

  /** The letter index of a list: how its names are filed, in its order. Not tied to `skip`. */
  public static catalogIndex(request: LibraryCatalogRequest): readonly unknown[] {
    return [...LibraryQueryKeys.data, "catalogIndex", { ...request, skip: 0 }];
  }

  /** An album by its ID: one entry per album, however many share a title and Album Artist. */
  public static album(albumId: AlbumId): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "byId", "detail", albumId];
  }

  public static albumTracks(albumId: AlbumId): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "byId", "tracks", albumId];
  }

  public static artist(artistId: ArtistId): readonly unknown[] {
    return [...LibraryQueryKeys.data, "artist", "detail", artistId];
  }

  public static artistAlbums({
    artistId,
    sortKey,
    direction,
  }: ArtistAlbumsArguments): readonly unknown[] {
    return [...LibraryQueryKeys.artistAlbumsPrefix, artistId, sortKey, direction];
  }

  public static trackProperties(trackId: TrackId | null): readonly unknown[] {
    return [...LibraryQueryKeys.data, "track", "properties", trackId];
  }

  /** Content-addressed, so it is never invalidated with the catalog. */
  public static accent(hash: ArtworkHash | null): readonly unknown[] {
    return ["library", "accent", hash];
  }
}
