import type {
	AudioOutputDevice as GeneratedAudioOutputDevice,
	BackendEvent,
	LibraryAlbumArtistPage,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage,
	PlaybackQueueSnapshot,
	PlaybackSnapshot
} from './protocol/generated';

export type AudioOutputDevice = GeneratedAudioOutputDevice;
export type PlaybackState = PlaybackSnapshot;
export type PlaybackQueue = PlaybackQueueSnapshot;
export type AppEvent = BackendEvent;
export type {
	LibraryAlbumArtistPage,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage
};
export interface NativeAppApi {
	ping(): Promise<string>;
	getPlaybackState(): Promise<PlaybackState>;
	getPlaybackQueue(): Promise<PlaybackQueue>;
	listAudioOutputDevices(): Promise<AudioOutputDevice[]>;
	selectLibraryDirectory(): Promise<string | null>;
	listLibraryRoots(): Promise<LibraryRoot[]>;
	registerLibraryRoot(path: string): Promise<LibraryRoot>;
	setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot>;
	removeLibraryRoot(id: string): Promise<void>;
	getLibraryScanState(): Promise<LibraryScanSnapshot>;
	startLibraryScan(): Promise<void>;
	cancelLibraryScan(): Promise<void>;
	listLibraryTracks(afterId: string | null, search: string | null): Promise<LibraryTrackPage>;
	listLibraryAlbums(afterCursor: string | null, search: string | null): Promise<LibraryAlbumPage>;
	listLibraryAlbumArtists(
		afterCursor: string | null,
		search: string | null
	): Promise<LibraryAlbumArtistPage>;
	startLibraryTrack(trackId: string): Promise<PlaybackState>;
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState>;
	onEvent(listener: (event: AppEvent) => void): () => void;
}
