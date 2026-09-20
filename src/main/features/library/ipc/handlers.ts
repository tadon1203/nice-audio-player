import type {
  LibraryAlbumArtistSortKey as NativeAlbumArtistSortKey,
  LibraryAlbumSortKey as NativeAlbumSortKey,
  LibraryArtistAlbumSortKey as NativeArtistAlbumSortKey,
  LibrarySortDirection as NativeSortDirection,
  LibraryTrackSortKey as NativeTrackSortKey,
} from "../../../shared/native-backend";
import type { NativeBackend } from "../../../shared/native-backend";
import { IPC_CHANNELS } from "../../../../shared/ipc";
import type {
  LibraryAlbumArtistSortKey,
  LibraryAlbumSortKey,
  LibraryArtistAlbumSortKey,
  LibrarySortDirection,
  LibraryTrackSortKey,
} from "../../../../shared/ipc";
import type { IpcHandlerMap } from "../../../shared/electron";

type LibraryHandlerMap = Pick<
  IpcHandlerMap,
  (typeof IPC_CHANNELS.library)[keyof typeof IPC_CHANNELS.library]
>;

const trackSortKey: Record<LibraryTrackSortKey, NativeTrackSortKey> = {
  title: "title" as NativeTrackSortKey,
  artist: "artist" as NativeTrackSortKey,
  album: "album" as NativeTrackSortKey,
  duration: "duration" as NativeTrackSortKey,
};
const albumSortKey: Record<LibraryAlbumSortKey, NativeAlbumSortKey> = {
  title: "title" as NativeAlbumSortKey,
  artist: "artist" as NativeAlbumSortKey,
  year: "year" as NativeAlbumSortKey,
};
const artistSortKey: Record<LibraryAlbumArtistSortKey, NativeAlbumArtistSortKey> = {
  artist: "artist" as NativeAlbumArtistSortKey,
  albumCount: "albumCount" as NativeAlbumArtistSortKey,
  trackCount: "trackCount" as NativeAlbumArtistSortKey,
};
const artistAlbumSortKey: Record<LibraryArtistAlbumSortKey, NativeArtistAlbumSortKey> = {
  year: "year" as NativeArtistAlbumSortKey,
  title: "title" as NativeArtistAlbumSortKey,
};
const sortDirection: Record<LibrarySortDirection, NativeSortDirection> = {
  ascending: "ascending" as NativeSortDirection,
  descending: "descending" as NativeSortDirection,
};

async function completeVoid(operation: Promise<void>): Promise<undefined> {
  await operation;
  return undefined;
}

export function createLibraryHandlers(backend: NativeBackend): LibraryHandlerMap {
  return {
    [IPC_CHANNELS.library.status]: () => backend.getLibraryStatus(),
    [IPC_CHANNELS.library.roots]: () => backend.listLibraryRoots(),
    [IPC_CHANNELS.library.registerRoot]: (path) => backend.registerLibraryRoot(path),
    [IPC_CHANNELS.library.setRootEnabled]: (id, enabled) =>
      backend.setLibraryRootEnabled(id, enabled),
    [IPC_CHANNELS.library.removeRoot]: (id) => completeVoid(backend.removeLibraryRoot(id)),
    [IPC_CHANNELS.library.scan]: () => backend.getLibraryScanState(),
    [IPC_CHANNELS.library.startScan]: () => completeVoid(backend.startLibraryScan()),
    [IPC_CHANNELS.library.cancelScan]: () => completeVoid(backend.cancelLibraryScan()),
    [IPC_CHANNELS.library.listTracks]: (cursor, search, key, direction) =>
      backend.listLibraryTracks(cursor, search, trackSortKey[key], sortDirection[direction]),
    [IPC_CHANNELS.library.listAlbums]: (cursor, search, key, direction) =>
      backend.listLibraryAlbums(cursor, search, albumSortKey[key], sortDirection[direction]),
    [IPC_CHANNELS.library.listAlbumArtists]: (cursor, search, key, direction) =>
      backend.listLibraryAlbumArtists(cursor, search, artistSortKey[key], sortDirection[direction]),
    [IPC_CHANNELS.library.getAlbumArtist]: (key) => backend.getLibraryAlbumArtist(key),
    [IPC_CHANNELS.library.listArtistAlbums]: (key, cursor, sort, direction) =>
      backend.listLibraryArtistAlbums(
        key,
        cursor,
        artistAlbumSortKey[sort],
        sortDirection[direction],
      ),
    [IPC_CHANNELS.library.getAlbumDetails]: (key) => backend.getLibraryAlbumDetails(key),
    [IPC_CHANNELS.library.listAlbumTracks]: (key, cursor) =>
      backend.listLibraryAlbumTracks(key, cursor),
    [IPC_CHANNELS.library.getTrackForPath]: (path) => backend.getLibraryTrackForPath(path),
  };
}
