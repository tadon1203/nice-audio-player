import type {
	AudioOutputDevice as GeneratedAudioOutputDevice,
	ArtworkRef,
	BackendEvent,
	LibraryAlbumArtistPage,
	LibraryAlbumArtistSummary,
	LibraryAlbumKey,
	LibraryAlbumDetails,
	LibraryAlbumTrackPage,
	LibraryAlbumTrackSummary,
	LibraryAlbumPage,
	LibraryAlbumSummary,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage,
	LibraryTrackSummary,
	LibraryStatus,
	PlaybackFailureCode,
	PlaybackQueueSnapshot,
	PlaybackSnapshot
} from './protocol/generated';

export type AudioOutputDevice = GeneratedAudioOutputDevice;
export type PlaybackState = PlaybackSnapshot;
export type PlaybackQueue = PlaybackQueueSnapshot;
export type AppEvent = BackendEvent;
export type {
	ArtworkRef,
	LibraryAlbumArtistPage,
	LibraryAlbumArtistSummary,
	LibraryAlbumKey,
	LibraryAlbumDetails,
	LibraryAlbumTrackPage,
	LibraryAlbumTrackSummary,
	LibraryAlbumPage,
	LibraryAlbumSummary,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackPage,
	LibraryTrackSummary,
	PlaybackFailureCode
};
export interface NativeAppApi {
	ping(): Promise<string>;
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
	listLibraryTracks(afterId: string | null, search: string | null): Promise<LibraryTrackPage>;
	listLibraryAlbums(afterCursor: string | null, search: string | null): Promise<LibraryAlbumPage>;
	listLibraryAlbumArtists(
		afterCursor: string | null,
		search: string | null
	): Promise<LibraryAlbumArtistPage>;
	getLibraryAlbumDetails(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails>;
	listLibraryAlbumTracks(albumKey: LibraryAlbumKey, offset: number): Promise<LibraryAlbumTrackPage>;
	getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null>;
	startLibraryTrack(trackId: string): Promise<PlaybackState>;
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState>;
	onEvent(listener: (event: AppEvent) => void): () => void;
}
