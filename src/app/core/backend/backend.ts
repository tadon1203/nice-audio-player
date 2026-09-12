import { DestroyRef, Service, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import type {
	AppEvent,
	AudioOutputDevice,
	LibraryAlbumArtistPage,
	LibraryAlbumDetails,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryAlbumTrackPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackPage,
	LibraryTrackSummary,
	NativeAppApi,
	PlaybackQueue,
	PlaybackState
} from '@shared/native-app-api';

@Service()
export class Backend {
	private readonly api: NativeAppApi | null = window.app ?? null;
	private readonly eventSubject = new Subject<AppEvent>();
	private readonly destroyRef = inject(DestroyRef);

	readonly available = this.api !== null;
	readonly events: Observable<AppEvent> = this.eventSubject.asObservable();

	constructor() {
		const unsubscribe = this.api?.onEvent((event) => this.eventSubject.next(event));
		this.destroyRef.onDestroy(() => unsubscribe?.());
	}

	ping(): Promise<string> {
		return this.requireApi().ping();
	}
	getPlaybackState(): Promise<PlaybackState> {
		return this.requireApi().getPlaybackState();
	}
	getPlaybackQueue(): Promise<PlaybackQueue> {
		return this.requireApi().getPlaybackQueue();
	}
	pausePlayback(): Promise<PlaybackState> {
		return this.requireApi().pausePlayback();
	}
	resumePlayback(): Promise<PlaybackState> {
		return this.requireApi().resumePlayback();
	}
	previousPlayback(): Promise<PlaybackState> {
		return this.requireApi().previousPlayback();
	}
	nextPlayback(): Promise<PlaybackState> {
		return this.requireApi().nextPlayback();
	}
	seekPlayback(positionMs: number): Promise<PlaybackState> {
		return this.requireApi().seekPlayback(positionMs);
	}
	setPlaybackVolume(volume: number): Promise<PlaybackState> {
		return this.requireApi().setPlaybackVolume(volume);
	}
	setPlaybackMuted(muted: boolean): Promise<PlaybackState> {
		return this.requireApi().setPlaybackMuted(muted);
	}
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.requireApi().listAudioOutputDevices();
	}
	selectLibraryDirectory(): Promise<string | null> {
		return this.requireApi().selectLibraryDirectory();
	}
	getLibraryStatus(): Promise<LibraryStatus> {
		return this.requireApi().getLibraryStatus();
	}
	listLibraryRoots(): Promise<LibraryRoot[]> {
		return this.requireApi().listLibraryRoots();
	}
	registerLibraryRoot(path: string): Promise<LibraryRoot> {
		return this.requireApi().registerLibraryRoot(path);
	}
	setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot> {
		return this.requireApi().setLibraryRootEnabled(id, enabled);
	}
	removeLibraryRoot(id: string): Promise<void> {
		return this.requireApi().removeLibraryRoot(id);
	}
	getLibraryScanState(): Promise<LibraryScanSnapshot> {
		return this.requireApi().getLibraryScanState();
	}
	startLibraryScan(): Promise<void> {
		return this.requireApi().startLibraryScan();
	}
	cancelLibraryScan(): Promise<void> {
		return this.requireApi().cancelLibraryScan();
	}
	listLibraryTracks(afterId: string | null, search: string | null): Promise<LibraryTrackPage> {
		return this.requireApi().listLibraryTracks(afterId, search);
	}
	listLibraryAlbums(afterCursor: string | null, search: string | null): Promise<LibraryAlbumPage> {
		return this.requireApi().listLibraryAlbums(afterCursor, search);
	}
	listLibraryAlbumArtists(
		afterCursor: string | null,
		search: string | null
	): Promise<LibraryAlbumArtistPage> {
		return this.requireApi().listLibraryAlbumArtists(afterCursor, search);
	}
	getLibraryAlbumDetails(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails> {
		return this.requireApi().getLibraryAlbumDetails(albumKey);
	}
	listLibraryAlbumTracks(
		albumKey: LibraryAlbumKey,
		offset: number
	): Promise<LibraryAlbumTrackPage> {
		return this.requireApi().listLibraryAlbumTracks(albumKey, offset);
	}
	getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null> {
		return this.requireApi().getLibraryTrackForPath(path);
	}
	startLibraryTrack(trackId: string): Promise<PlaybackState> {
		return this.requireApi().startLibraryTrack(trackId);
	}
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState> {
		return this.requireApi().startLibraryAlbum(albumKey);
	}

	private requireApi(): NativeAppApi {
		if (!this.api) throw new Error('Native application API is unavailable.');
		return this.api;
	}
}
