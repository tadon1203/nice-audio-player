import { getAppApi } from './client';
import type { LibraryAlbumKey } from './contracts';
export const libraryApi = {
	selectDirectory: () => getAppApi().selectLibraryDirectory(),
	roots: () => getAppApi().listLibraryRoots(),
	registerRoot: (path: string) => getAppApi().registerLibraryRoot(path),
	setRootEnabled: (id: string, enabled: boolean) => getAppApi().setLibraryRootEnabled(id, enabled),
	removeRoot: (id: string) => getAppApi().removeLibraryRoot(id),
	scanState: () => getAppApi().getLibraryScanState(),
	startScan: () => getAppApi().startLibraryScan(),
	cancelScan: () => getAppApi().cancelLibraryScan(),
	tracks: (afterId: string | null, search: string | null) =>
		getAppApi().listLibraryTracks(afterId, search),
	albums: (afterCursor: string | null, search: string | null) =>
		getAppApi().listLibraryAlbums(afterCursor, search),
	albumArtists: (afterCursor: string | null, search: string | null) =>
		getAppApi().listLibraryAlbumArtists(afterCursor, search),
	startTrack: (trackId: string) => getAppApi().startLibraryTrack(trackId),
	startAlbum: (albumKey: LibraryAlbumKey) => getAppApi().startLibraryAlbum(albumKey)
};
