import type { BackendTransport } from './transport';
import type {
	AudioOutputDevice,
	PlaybackQueue,
	PlaybackState,
	LibraryAlbumArtistPage,
	LibraryAlbumKey,
	LibraryAlbumPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackPage
} from '../../../src/lib/api/contracts';
import {
	decodeLibraryAlbumArtists,
	decodeLibraryAlbums,
	decodeLibraryRoot,
	decodeLibraryRoots,
	decodeLibraryScanState,
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
	listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
		return this.transport.send({ method: 'listAudioOutputDevices' }, decodeOutputDevices);
	}
	listLibraryRoots(): Promise<LibraryRoot[]> {
		return this.transport.send({ method: 'listLibraryRoots' }, decodeLibraryRoots);
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
