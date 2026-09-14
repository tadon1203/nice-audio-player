import type { BackendTransport } from './transport';
import type {
	AudioOutputDevice,
	PlaybackQueue,
	PlaybackState,
	LibraryAlbumArtistPage,
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSortKey,
	LibraryAlbumArtistSummary,
	LibraryAlbumDetails,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryAlbumSortKey,
	LibraryAlbumTrackPage,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackSummary,
	LibraryTrackPage,
	LibraryTrackSortKey
} from '@shared/native-app-api';

export class BackendApi {
	constructor(private readonly transport: BackendTransport) {}

	ping(): Promise<string> {
		return this.transport.send({ method: 'ping' });
	}
	getPlaybackState(): Promise<PlaybackState> {
		return this.transport.send({ method: 'getPlaybackState' });
	}
	getPlaybackQueue(): Promise<PlaybackQueue> {
		return this.transport.send({ method: 'getPlaybackQueue' });
	}
	pausePlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'pausePlayback' });
	}
	resumePlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'resumePlayback' });
	}
	previousPlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'previousPlayback' });
	}
	nextPlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'nextPlayback' });
	}
	seekPlayback(positionMs: number): Promise<PlaybackState> {
		return this.transport.send({ method: 'seekPlayback', params: { position_ms: positionMs } });
	}
	setPlaybackVolume(volume: number): Promise<PlaybackState> {
		return this.transport.send({ method: 'setPlaybackVolume', params: { volume } });
	}
	setPlaybackMuted(muted: boolean): Promise<PlaybackState> {
		return this.transport.send({ method: 'setPlaybackMuted', params: { muted } });
	}
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.transport.send({ method: 'listAudioOutputDevices' });
	}
	listLibraryRoots(): Promise<LibraryRoot[]> {
		return this.transport.send({ method: 'listLibraryRoots' });
	}
	getLibraryStatus(): Promise<LibraryStatus> {
		return this.transport.send({ method: 'getLibraryStatus' });
	}
	getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null> {
		return this.transport.send({ method: 'getLibraryTrackForPath', params: { path } });
	}
	registerLibraryRoot(path: string): Promise<LibraryRoot> {
		return this.transport.send({ method: 'registerLibraryRoot', params: { path } });
	}
	setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot> {
		return this.transport.send({ method: 'setLibraryRootEnabled', params: { id, enabled } });
	}
	async removeLibraryRoot(id: string): Promise<void> {
		await this.transport.send({ method: 'removeLibraryRoot', params: { id } });
	}
	getLibraryScanState(): Promise<LibraryScanSnapshot> {
		return this.transport.send({ method: 'getLibraryScanState' });
	}
	async startLibraryScan(): Promise<void> {
		await this.transport.send({ method: 'startLibraryScan' });
	}
	async cancelLibraryScan(): Promise<void> {
		await this.transport.send({ method: 'cancelLibraryScan' });
	}
	listLibraryTracks(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryTrackSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryTrackPage> {
		return this.transport.send({
			method: 'listLibraryTracks',
			params: { cursor, search, sort_key: sortKey, sort_direction: sortDirection }
		});
	}
	listLibraryAlbums(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryAlbumSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumPage> {
		return this.transport.send({
			method: 'listLibraryAlbums',
			params: {
				cursor,
				search,
				sort_key: sortKey,
				sort_direction: sortDirection
			}
		});
	}
	listLibraryAlbumArtists(
		cursor: string | null,
		search: string | null,
		sortKey: LibraryAlbumArtistSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumArtistPage> {
		return this.transport.send({
			method: 'listLibraryAlbumArtists',
			params: {
				cursor,
				search,
				sort_key: sortKey,
				sort_direction: sortDirection
			}
		});
	}
	getLibraryAlbumArtist(artistKey: LibraryAlbumArtistKey): Promise<LibraryAlbumArtistSummary> {
		return this.transport.send({
			method: 'getLibraryAlbumArtist',
			params: { artist_key: artistKey }
		});
	}
	listLibraryArtistAlbums(
		artistKey: LibraryAlbumArtistKey,
		cursor: string | null,
		sortKey: LibraryArtistAlbumSortKey,
		sortDirection: LibrarySortDirection
	): Promise<LibraryAlbumPage> {
		return this.transport.send({
			method: 'listLibraryArtistAlbums',
			params: {
				artist_key: artistKey,
				cursor,
				sort_key: sortKey,
				sort_direction: sortDirection
			}
		});
	}
	getLibraryAlbumDetails(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails> {
		return this.transport.send({
			method: 'getLibraryAlbumDetails',
			params: { album_key: albumKey }
		});
	}
	listLibraryAlbumTracks(
		albumKey: LibraryAlbumKey,
		cursor: string | null
	): Promise<LibraryAlbumTrackPage> {
		return this.transport.send({
			method: 'listLibraryAlbumTracks',
			params: { album_key: albumKey, cursor }
		});
	}
	startLibraryTrack(trackId: string): Promise<PlaybackState> {
		return this.transport.send({ method: 'startLibraryTrack', params: { track_id: trackId } });
	}
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState> {
		return this.transport.send({ method: 'startLibraryAlbum', params: { album_key: albumKey } });
	}
}
