import type {
  AlbumId,
  ArtistId,
  ArtworkHash,
  LibraryAlbumArtistKey,
  LibraryAlbumKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  TrackId,
} from "#lib/native";
import type { LibraryCatalogRequest } from "./catalog-repository";

/** The arguments of an Album Artist's album list: which artist, and how its albums are ordered. */
export type ArtistAlbumsArguments = {
  readonly artistId: ArtistId;
  readonly sortKey: LibraryArtistAlbumSortKey;
  readonly direction: LibrarySortDirection;
};

/** The same list for the old name route, which is keyed by the Album Artist's name. */
export type AlbumArtistAlbumsArguments = {
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
  /** The prefix of every Album Artist's album list, by ID, for reads across all of them. */
  public static readonly artistAlbumsPrefix = [
    ...LibraryQueryKeys.data,
    "artist",
    "albums",
  ] as const;
  /** The prefix of every album list of the old name route, for reads across all of them. */
  public static readonly albumArtistAlbumsPrefix = [
    ...LibraryQueryKeys.data,
    "albumArtist",
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

  /** An album by its ID: one entry per album, however many share a title and Album Artist. */
  public static album(albumId: AlbumId): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "byId", "detail", albumId];
  }

  public static albumTracks(albumId: AlbumId): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "byId", "tracks", albumId];
  }

  /** The old album route's album, by its key, until ticket 14 removes that route. */
  public static albumByKey(key: LibraryAlbumKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "detail", ...albumIdentity(key)];
  }

  public static albumTracksByKey(key: LibraryAlbumKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "album", "tracks", ...albumIdentity(key)];
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

  /** The old name route's Album Artist, until that route is removed. */
  public static albumArtist(key: LibraryAlbumArtistKey): readonly unknown[] {
    return [...LibraryQueryKeys.data, "albumArtist", "detail", key.name];
  }

  public static albumArtistAlbums({
    key,
    sortKey,
    direction,
  }: AlbumArtistAlbumsArguments): readonly unknown[] {
    return [...LibraryQueryKeys.albumArtistAlbumsPrefix, key.name, sortKey, direction];
  }

  public static trackProperties(trackId: TrackId | null): readonly unknown[] {
    return [...LibraryQueryKeys.data, "track", "properties", trackId];
  }

  /** Content-addressed, so it is never invalidated with the catalog. */
  public static accent(hash: ArtworkHash | null): readonly unknown[] {
    return ["library", "accent", hash];
  }
}
