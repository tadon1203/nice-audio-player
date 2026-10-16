import type {
  LibraryAlbumArtistKey,
  LibraryAlbumKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
} from "#lib/native";
import type { LibraryCatalogRequest } from "./catalog-repository";

/** The arguments of an artist's album list: which artist, and how its albums are ordered. */
export type ArtistAlbumsArguments = {
  readonly key: LibraryAlbumArtistKey;
  readonly sortKey: LibraryArtistAlbumSortKey;
  readonly direction: LibrarySortDirection;
};

/** An Album is its Album Artist, title, and folder, so all three are in its query keys. */
const albumIdentity = (key: LibraryAlbumKey) =>
  [key.title, key.albumArtist, key.albumEdition] as const;

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
  public static readonly roots = [...LibraryQueryKeys.data, "roots"] as const;
  /** The prefix of every artist's album list, for reads across all of them. */
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

  /** The scroll index of a list: how its names are filed, in its order. Not tied to `skip`. */
  public static catalogIndex(request: LibraryCatalogRequest): readonly unknown[] {
    return [...LibraryQueryKeys.data, "catalogIndex", { ...request, skip: 0 }];
  }

  public static album(key: LibraryAlbumKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "detail", ...albumIdentity(key)];
  }

  public static albumTracks(key: LibraryAlbumKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "tracks", ...albumIdentity(key)];
  }

  public static albumArtist(key: LibraryAlbumArtistKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "artist", "detail", key.name];
  }

  public static artistAlbums({
    key,
    sortKey,
    direction,
  }: ArtistAlbumsArguments): readonly unknown[] {
    return [...LibraryQueryKeys.artistAlbumsPrefix, key.name, sortKey, direction];
  }

  public static trackProperties(trackId: string | null): readonly unknown[] {
    return [...LibraryQueryKeys.data, "track", "properties", trackId];
  }

  /** Content-addressed, so it is never invalidated with the catalog. */
  public static accent(contentHash: string | null): readonly unknown[] {
    return ["library", "accent", contentHash];
  }
}
