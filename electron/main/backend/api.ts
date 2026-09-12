import type { BackendTransport } from './transport';
import type {
	AudioOutputDevice,
	PlaybackQueue,
	PlaybackState,
	LibraryAlbumArtistPage,
	LibraryAlbumDetails,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryAlbumTrackPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryStatus,
	LibraryTrackSummary,
	LibraryTrackPage
} from '@shared/native-app-api';
import {
	decodeLibraryAlbumArtists,
	decodeLibraryAlbumDetails,
	decodeLibraryAlbums,
	decodeLibraryAlbumTracks,
	decodeLibraryRoot,
	decodeLibraryRoots,
	decodeLibraryScanState,
	decodeLibraryStatus,
	decodeLibraryTrack,
	decodeLibraryTracks
} from './decoders/library';
import {
	decodePlaybackQueue,
	decodePlaybackState,
	decodeLibraryPlaybackState
} from './decoders/playback';
import { decodeNull } from './decoders/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const isAudioOutputDevices = (value: unknown): value is AudioOutputDevice[] =>
	Array.isArray(value) &&
	value.every(
		(item) =>
			isRecord(item) &&
			typeof item.id === 'string' &&
			typeof item.name === 'string' &&
			typeof item.isDefault === 'boolean'
	);

function decode<T>(value: unknown, guard: (value: unknown) => value is T, name: string): T {
	if (!guard(value)) throw new Error(`Invalid backend response for ${name}`);
	return value;
}

const decodeString = (value: unknown): string =>
	decode(value, (item): item is string => typeof item === 'string', 'ping');
const decodeOutputDevices = (value: unknown): AudioOutputDevice[] =>
	decode(value, isAudioOutputDevices, 'listAudioOutputDevices');

export class BackendApi {
	constructor(private readonly transport: BackendTransport) {}

	ping(): Promise<string> {
		return this.transport.send({ method: 'ping' }, decodeString);
	}
	getPlaybackState(): Promise<PlaybackState> {
		return this.transport.send({ method: 'getPlaybackState' }, decodePlaybackState);
	}
	getPlaybackQueue(): Promise<PlaybackQueue> {
		return this.transport.send({ method: 'getPlaybackQueue' }, decodePlaybackQueue);
	}
	pausePlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'pausePlayback' }, decodePlaybackState);
	}
	resumePlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'resumePlayback' }, decodePlaybackState);
	}
	previousPlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'previousPlayback' }, decodePlaybackState);
	}
	nextPlayback(): Promise<PlaybackState> {
		return this.transport.send({ method: 'nextPlayback' }, decodePlaybackState);
	}
	seekPlayback(positionMs: number): Promise<PlaybackState> {
		return this.transport.send(
			{ method: 'seekPlayback', params: { position_ms: positionMs } },
			decodePlaybackState
		);
	}
	setPlaybackVolume(volume: number): Promise<PlaybackState> {
		return this.transport.send(
			{ method: 'setPlaybackVolume', params: { volume } },
			decodePlaybackState
		);
	}
	setPlaybackMuted(muted: boolean): Promise<PlaybackState> {
		return this.transport.send(
			{ method: 'setPlaybackMuted', params: { muted } },
			decodePlaybackState
		);
	}
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.transport.send({ method: 'listAudioOutputDevices' }, decodeOutputDevices);
	}
	listLibraryRoots(): Promise<LibraryRoot[]> {
		return this.transport.send({ method: 'listLibraryRoots' }, decodeLibraryRoots);
	}
	getLibraryStatus(): Promise<LibraryStatus> {
		return this.transport.send({ method: 'getLibraryStatus' }, decodeLibraryStatus);
	}
	getLibraryTrackForPath(path: string): Promise<LibraryTrackSummary | null> {
		return this.transport.send(
			{ method: 'getLibraryTrackForPath', params: { path } },
			decodeLibraryTrack
		);
	}
	registerLibraryRoot(path: string): Promise<LibraryRoot> {
		return this.transport.send(
			{ method: 'registerLibraryRoot', params: { path } },
			decodeLibraryRoot
		);
	}
	setLibraryRootEnabled(id: string, enabled: boolean): Promise<LibraryRoot> {
		return this.transport.send(
			{ method: 'setLibraryRootEnabled', params: { id, enabled } },
			decodeLibraryRoot
		);
	}
	async removeLibraryRoot(id: string): Promise<void> {
		await this.transport.send({ method: 'removeLibraryRoot', params: { id } }, (value) =>
			decodeNull(value, 'removeLibraryRoot')
		);
	}
	getLibraryScanState(): Promise<LibraryScanSnapshot> {
		return this.transport.send({ method: 'getLibraryScanState' }, decodeLibraryScanState);
	}
	async startLibraryScan(): Promise<void> {
		await this.transport.send({ method: 'startLibraryScan' }, (value) =>
			decodeNull(value, 'startLibraryScan')
		);
	}
	async cancelLibraryScan(): Promise<void> {
		await this.transport.send({ method: 'cancelLibraryScan' }, (value) =>
			decodeNull(value, 'cancelLibraryScan')
		);
	}
	listLibraryTracks(afterId: string | null, search: string | null): Promise<LibraryTrackPage> {
		return this.transport.send(
			{ method: 'listLibraryTracks', params: { after_id: afterId, search } },
			decodeLibraryTracks
		);
	}
	listLibraryAlbums(afterCursor: string | null, search: string | null): Promise<LibraryAlbumPage> {
		return this.transport.send(
			{ method: 'listLibraryAlbums', params: { after_cursor: afterCursor, search } },
			decodeLibraryAlbums
		);
	}
	listLibraryAlbumArtists(
		afterCursor: string | null,
		search: string | null
	): Promise<LibraryAlbumArtistPage> {
		return this.transport.send(
			{ method: 'listLibraryAlbumArtists', params: { after_cursor: afterCursor, search } },
			decodeLibraryAlbumArtists
		);
	}
	getLibraryAlbumDetails(albumKey: LibraryAlbumKey): Promise<LibraryAlbumDetails> {
		return this.transport.send(
			{ method: 'getLibraryAlbumDetails', params: { album_key: albumKey } },
			decodeLibraryAlbumDetails
		);
	}
	listLibraryAlbumTracks(
		albumKey: LibraryAlbumKey,
		offset: number
	): Promise<LibraryAlbumTrackPage> {
		return this.transport.send(
			{ method: 'listLibraryAlbumTracks', params: { album_key: albumKey, offset } },
			decodeLibraryAlbumTracks
		);
	}
	startLibraryTrack(trackId: string): Promise<PlaybackState> {
		return this.transport.send(
			{ method: 'startLibraryTrack', params: { track_id: trackId } },
			decodeLibraryPlaybackState
		);
	}
	startLibraryAlbum(albumKey: LibraryAlbumKey): Promise<PlaybackState> {
		return this.transport.send(
			{ method: 'startLibraryAlbum', params: { album_key: albumKey } },
			decodeLibraryPlaybackState
		);
	}
}
