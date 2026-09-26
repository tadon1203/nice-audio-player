export { libraryCommandErrorMessage, libraryStatusMessage } from "./model/library-errors";
export {
  libraryQueryKeys,
  useAlbumArtist,
  useAlbumDetails,
  useAlbumTracks,
  useArtistAlbums,
  useLibraryPresentationQuery,
  useLibraryRootsQuery,
  useLibraryScan,
  useLibraryStatus,
  useLibraryTrackForPath,
  type LibraryCatalogRequest,
} from "./api/queries";
export {
  useAddLibraryRoot,
  useCancelLibraryScan,
  useRemoveLibraryRoot,
  useSetLibraryRootEnabled,
  useStartLibraryScan,
} from "./api/mutations";
export type {
  LibraryAlbumArtistKey,
  LibraryAlbumArtistSummary,
  LibraryAlbumArtistSortKey,
  LibraryAlbumDetails,
  LibraryAlbumKey,
  LibraryAlbumSortKey,
  LibraryAlbumSummary,
  LibraryAlbumTrackSummary,
  LibraryArtistAlbumSortKey,
  LibraryRoot,
  LibraryScanSnapshot,
  LibrarySortDirection,
  LibraryStatus,
  LibraryTrackSortKey,
  LibraryTrackSummary,
} from "@/shared/ipc";
