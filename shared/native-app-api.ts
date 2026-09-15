import type {
	AudioOutputDevice as GeneratedAudioOutputDevice,
	ArtworkRef,
	BackendEvent,
	LibraryAlbumArtistPage,
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSummary,
	LibraryAlbumKey,
	LibraryAlbumDetails,
	LibraryAlbumTrackPage,
	LibraryAlbumTrackSummary,
	LibraryAlbumPage,
	LibraryAlbumArtistSortKey,
	LibraryAlbumSortKey,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection,
	LibraryAlbumSummary,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage,
	LibraryTrackSortKey,
	LibraryTrackSummary,
	LibraryStatus,
	PlaybackFailureCode,
	PlaybackQueueSnapshot,
	PlaybackSnapshot
} from './native-backend';

export type AudioOutputDevice = GeneratedAudioOutputDevice;
export type PlaybackState = PlaybackSnapshot;
export type PlaybackQueue = PlaybackQueueSnapshot;
export type AppEvent = BackendEvent;

export type IpcError = {
	readonly code: string;
	readonly message: string;
};

export type IpcResult<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: IpcError };

export type {
	ArtworkRef,
	LibraryAlbumArtistPage,
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSummary,
	LibraryAlbumKey,
	LibraryAlbumDetails,
	LibraryAlbumTrackPage,
	LibraryAlbumTrackSummary,
	LibraryAlbumPage,
	LibraryAlbumArtistSortKey,
	LibraryAlbumSortKey,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection,
	LibraryAlbumSummary,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackPage,
	LibraryTrackSortKey,
	LibraryTrackSummary,
	PlaybackFailureCode
};
export interface NativeAppApi {
	getPlaybackState(): Promise<PlaybackState>;
	getPlaybackQueue(): Promise<PlaybackQueue>;
	pausePlayback(): Promise<PlaybackState>;
	resumePlayback(): Promise<PlaybackState>;
	previousPlayback(): Promise<PlaybackState>;
	nextPlayback(): Promise<PlaybackState>;
	seekPlayback(positionMs: number): Promise<PlaybackState>;
	setPlaybackVolume(volume: number): Promise<PlaybackState>;
	setPlaybackMuted(muted: boolean): Promise<PlaybackState>;
	listAudioOutputDevices(): Promise<AudioOutputDevice[]>;
	selectLibraryDirectory(): Promise<string | null>;
	getLibraryStatus(): Promise<LibraryStatus>;
	listLibraryRoots(): Promise<LibraryRoot[]>;
	registerLibraryRoot(path: string): Promise<LibraryRoot>;
	setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot>;
	removeLibraryRoot(id: string): Promise<void>;
	getLibraryScanState(): Promise<LibraryScanSnapshot>;
	startLibraryScan(): Promise<void>;
	cancelLibraryScan(): Promise<void>;
	listLibraryTracks(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryTrackSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryTrackPage>;
	listLibraryAlbums(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryAlbumSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumPage>;
	listLibraryAlbumArtists(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryAlbumArtistSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumArtistPage>;
	getLibraryAlbumArtist(artistKey: LibraryAlbumArtistKey): Promise<LibraryAlbumArtistSummary>;
	listLibraryArtistAlbums(
		artistKey: LibraryAlbumArtistKey,
		cursor: string | null,
		sortKey: LibraryArtistAlbumSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumPage>;
	getLibraryAlbumDetails(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails>;
	listLibraryAlbumTracks(
		albumKey: LibraryAlbumKey,
		cursor: string | null
	): Promise<LibraryAlbumTrackPage>;
	getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null>;
	startLibraryTrack(trackId: string): Promise<PlaybackState>;
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState>;
	onEvent(listener: (event: AppEvent) => void): () => void;
}
