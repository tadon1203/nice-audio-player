import type { Page } from '@playwright/test';
import type {
	AppEvent,
	LibraryAlbumDetails,
	LibraryAlbumTrackPage,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackSummary,
	NativeAppApi,
	PlaybackQueue,
	PlaybackState
} from '@shared/native-app-api';

export interface LibraryRequestRecord {
	readonly view: 'albums' | 'albumArtists' | 'tracks' | 'artistAlbums';
	readonly sortKey: string;
	readonly sortDirection: string;
}

export async function installNativeAppFixture(page: Page): Promise<void> {
	await page.addInitScript(() => {
		type BrowserLibraryRequest = LibraryRequestRecord;
		const libraryRequests: BrowserLibraryRequest[] = [];
		(
			window as unknown as Window & {
				__niceAudioPlayerLibraryRequests: BrowserLibraryRequest[];
			}
		).__niceAudioPlayerLibraryRequests = libraryRequests;
		const recordLibraryRequest = (
			view: BrowserLibraryRequest['view'],
			sortKey: unknown,
			sortDirection: unknown
		) => {
			libraryRequests.push({
				view,
				sortKey: String(sortKey),
				sortDirection: String(sortDirection)
			});
		};
		const rootsKey = '__nice_audio_player_test_roots';
		let roots: LibraryRoot[] = JSON.parse(localStorage.getItem(rootsKey) ?? '[]') as LibraryRoot[];
		const persistRoots = () => localStorage.setItem(rootsKey, JSON.stringify(roots));
		let scan: LibraryScanSnapshot = {
			state: 'idle',
			currentRoot: null,
			discoveredCount: null,
			inspectedCount: null,
			indexedCount: null,
			failedCount: null,
			failureCode: null
		};
		const listeners = new Set<(event: AppEvent) => void>();
		const track1: LibraryTrackSummary = {
			id: 'track-1',
			title: 'Test track',
			artist: 'Test artist',
			album: 'Test album',
			albumArtist: 'Test artist',
			artwork: null,
			durationMs: 120000,
			availability: 'available',
			playable: true
		};
		const track2: LibraryTrackSummary = {
			...track1,
			id: 'track-2',
			title: 'Second track'
		};
		const literalTrack: LibraryTrackSummary = {
			...track1,
			id: 'track-literal',
			title: String.raw`50%_mix\\live`
		};
		const missingTrack: LibraryTrackSummary = {
			...track1,
			id: 'track-missing',
			title: 'Missing track',
			availability: 'missing',
			playable: false
		};
		const unavailableTrack: LibraryTrackSummary = {
			...track1,
			id: 'track-unavailable',
			title: 'Unavailable track',
			playable: false
		};
		const tracks = [track1, track2, literalTrack, missingTrack, unavailableTrack];
		const artistSummaries = [
			{ key: { name: 'Test artist' }, artwork: null, albumCount: 1, trackCount: 5 },
			{ key: { name: 'Björk' }, artwork: null, albumCount: 10, trackCount: 126 },
			{ key: { name: 'Massive Attack' }, artwork: null, albumCount: 6, trackCount: 74 },
			{ key: { name: 'Portishead' }, artwork: null, albumCount: 3, trackCount: 35 },
			{ key: { name: 'Aphex Twin' }, artwork: null, albumCount: 7, trackCount: 118 },
			{ key: { name: 'Joni Mitchell' }, artwork: null, albumCount: 18, trackCount: 221 },
			{ key: { name: 'Sigur Rós' }, artwork: null, albumCount: 8, trackCount: 93 },
			{ key: { name: 'Floating Points' }, artwork: null, albumCount: 5, trackCount: 57 }
		];
		const albumDetails: LibraryAlbumDetails = {
			summary: {
				key: { title: 'Test album', albumArtist: 'Test artist' },
				artwork: null,
				year: 2020
			},
			date: '2020',
			trackCount: 2,
			durationMs: 300000,
			firstPlayableTrackId: track1.id
		};
		const albumTracks: LibraryAlbumTrackPage = {
			items: [track1, track2].map((track, index) => ({
				id: track.id,
				title: track.title,
				artist: track.artist,
				trackNumber: index + 1,
				discNumber: null,
				fileFormat: 'FLAC',
				bitDepth: 24,
				sampleRate: 96000,
				durationMs: track.durationMs,
				availability: track.availability,
				playable: track.playable
			})),
			totalCount: 2,
			nextCursor: null
		};
		const fileFor = (track: LibraryTrackSummary) => ({
			path: `C:/Music/${track.id === 'track-1' ? 'track' : track.id === 'track-2' ? 'second' : 'literal'}.wav`,
			fileName: `${track.id}.wav`,
			extension: 'wav'
		});
		let revision = 0;
		let playback: PlaybackState = {
			status: 'stopped',
			revision,
			file: null,
			volume: 1,
			muted: false,
			outputSelection: { kind: 'systemDefault' },
			canGoPrevious: false,
			canGoNext: false
		};
		let queue: PlaybackQueue = {
			revision,
			current: null,
			upcoming: [],
			repeatMode: 'off',
			shuffleEnabled: false
		};
		const emit = (event: AppEvent) => listeners.forEach((listener) => listener(event));
		const nextRevision = () => ++revision;
		const stateFor = (track: LibraryTrackSummary, status: 'playing' | 'paused'): PlaybackState => ({
			status,
			revision: nextRevision(),
			file: fileFor(track),
			playbackId: `playback-${track.id}`,
			positionMs: 0,
			durationMs: track.durationMs,
			volume: playback.volume,
			muted: playback.muted,
			outputSelection: { kind: 'systemDefault' },
			outputDevice: { id: 'default', name: 'Default' },
			channelConversion: 'none',
			sourceSampleRate: 44100,
			outputSampleRate: 44100,
			resamplingActive: false,
			canGoPrevious: track.id !== 'track-1',
			canGoNext: track.id !== 'track-literal'
		});
		const updateQueue = (track: LibraryTrackSummary | null) => {
			queue = {
				...queue,
				revision,
				current: track
					? { id: track.id, title: track.title, artist: track.artist, durationMs: track.durationMs }
					: null,
				upcoming:
					track?.id === 'track-1'
						? [
								{
									id: track2.id,
									title: track2.title,
									artist: track2.artist,
									durationMs: track2.durationMs
								}
							]
						: []
			};
			emit({ event: 'playbackQueueStateChanged', payload: queue });
		};
		const publishPlayback = () => emit({ event: 'playbackStateChanged', payload: playback });
		const playTrack = (track: LibraryTrackSummary) => {
			playback = stateFor(track, 'playing');
			updateQueue(track);
			publishPlayback();
			return Promise.resolve(playback);
		};
		const rejected = (code: string): Promise<never> => {
			const error = new Error(code);
			Object.defineProperty(error, 'code', { value: code });
			return Promise.reject(error);
		};
		window.app = {
			ping: () => Promise.resolve('pong'),
			getPlaybackState: () => Promise.resolve(playback),
			getPlaybackQueue: () => Promise.resolve(queue),
			pausePlayback: () => {
				if (playback.status !== 'playing') return rejected('invalidPlaybackState');
				playback = { ...playback, status: 'paused', revision: nextRevision() };
				publishPlayback();
				return Promise.resolve(playback);
			},
			resumePlayback: () => {
				if (playback.status !== 'paused') return rejected('invalidPlaybackState');
				playback = { ...playback, status: 'playing', revision: nextRevision() };
				publishPlayback();
				return Promise.resolve(playback);
			},
			previousPlayback: () => {
				const track = tracks.find((candidate) => candidate.id === 'track-1');
				if (!track || playback.status === 'stopped' || playback.file?.path.includes('/track.wav'))
					return rejected('queueItemNotFound');
				return playTrack(track);
			},
			nextPlayback: () => {
				const track = tracks.find((candidate) => candidate.id === 'track-2');
				if (
					!track ||
					playback.status === 'stopped' ||
					playback.file?.path.includes('/second.wav') ||
					playback.file?.path.includes('/literal.wav')
				)
					return rejected('queueItemNotFound');
				return playTrack(track);
			},
			seekPlayback: (positionMs: number) => {
				if (playback.status !== 'playing' && playback.status !== 'paused')
					return rejected('invalidPlaybackState');
				playback = { ...playback, positionMs, revision: nextRevision() };
				publishPlayback();
				return Promise.resolve(playback);
			},
			setPlaybackVolume: (volume: number) => {
				playback = { ...playback, volume, revision: nextRevision() };
				publishPlayback();
				return Promise.resolve(playback);
			},
			setPlaybackMuted: (muted: boolean) => {
				playback = { ...playback, muted, revision: nextRevision() };
				publishPlayback();
				return Promise.resolve(playback);
			},
			listAudioOutputDevices: () => Promise.resolve([]),
			selectLibraryDirectory: () => Promise.resolve('C:/Music'),
			getLibraryStatus: () => Promise.resolve({ status: 'ready' }),
			listLibraryRoots: () => Promise.resolve(roots),
			registerLibraryRoot: (path: string) => {
				const root: LibraryRoot = {
					id: 'root-1',
					path,
					enabled: true,
					scanGeneration: 0,
					lastSuccessfulScanAtMs: null
				};
				roots = [root];
				persistRoots();
				return Promise.resolve(root);
			},
			setLibraryRootEnabled: (id: string, enabled: boolean) => {
				roots = roots.map((root) => (root.id === id ? { ...root, enabled } : root));
				persistRoots();
				const root = roots.find((candidate) => candidate.id === id);
				return root ? Promise.resolve(root) : rejected('rootMissing');
			},
			removeLibraryRoot: (id: string) => {
				roots = roots.filter((root) => root.id !== id);
				persistRoots();
				return Promise.resolve();
			},
			getLibraryScanState: () => Promise.resolve(scan),
			startLibraryScan: () => {
				scan = {
					...scan,
					state: 'completed',
					discoveredCount: 1,
					inspectedCount: 1,
					indexedCount: 1,
					failedCount: 0
				};
				emit({ event: 'libraryScanStateChanged', payload: scan });
				return Promise.resolve();
			},
			cancelLibraryScan: () => {
				scan = { ...scan, state: 'cancelled' };
				emit({ event: 'libraryScanStateChanged', payload: scan });
				return Promise.resolve();
			},
			listLibraryTracks: (
				_cursor: string | null,
				search: string | null,
				sortKey,
				sortDirection
			) => {
				recordLibraryRequest('tracks', sortKey, sortDirection);
				const filtered =
					roots.length === 0
						? []
						: tracks.filter((track) => search === null || track.title.includes(search));
				return Promise.resolve({
					items: filtered,
					totalCount: filtered.length,
					nextCursor: null
				});
			},
			listLibraryAlbums: (
				_cursor: string | null,
				search: string | null,
				sortKey,
				sortDirection
			) => {
				void _cursor;
				recordLibraryRequest('albums', sortKey, sortDirection);
				return Promise.resolve({
					items:
						roots.length === 0 || (search !== null && !'Test album Test artist'.includes(search))
							? []
							: [albumDetails.summary],
					totalCount:
						roots.length === 0 || (search !== null && !'Test album Test artist'.includes(search))
							? 0
							: 1,
					nextCursor: null
				});
			},
			listLibraryAlbumArtists: (
				_cursor: string | null,
				search: string | null,
				sortKey,
				sortDirection
			) => {
				void _cursor;
				recordLibraryRequest('albumArtists', sortKey, sortDirection);
				return Promise.resolve({
					items:
						roots.length === 0
							? []
							: artistSummaries.filter(
									(artist) => search === null || artist.key.name.includes(search)
								),
					totalCount:
						roots.length === 0
							? 0
							: artistSummaries.filter(
									(artist) => search === null || artist.key.name.includes(search)
								).length,
					nextCursor: null
				});
			},
			getLibraryAlbumArtist: (artistKey) => {
				const artist = artistSummaries.find((candidate) => candidate.key.name === artistKey.name);
				return artist ? Promise.resolve(artist) : rejected('albumArtistNotFound');
			},
			listLibraryArtistAlbums: (artistKey, _cursor, sortKey, sortDirection) => {
				void _cursor;
				recordLibraryRequest('artistAlbums', sortKey, sortDirection);
				return artistKey.name === 'Test artist'
					? Promise.resolve({ items: [albumDetails.summary], totalCount: 1, nextCursor: null })
					: rejected('albumArtistNotFound');
			},
			getLibraryAlbumDetails: (albumKey) =>
				albumKey.title === albumDetails.summary.key.title &&
				albumKey.albumArtist === albumDetails.summary.key.albumArtist
					? Promise.resolve(albumDetails)
					: rejected('albumNotFound'),
			listLibraryAlbumTracks: (albumKey) =>
				albumKey.title === albumDetails.summary.key.title &&
				albumKey.albumArtist === albumDetails.summary.key.albumArtist
					? Promise.resolve(albumTracks)
					: rejected('albumNotFound'),
			getLibraryTrackForPath: (path: string) =>
				Promise.resolve(tracks.find((track) => fileFor(track).path === path) ?? null),
			startLibraryTrack: (trackId: string) => {
				const track = tracks.find((candidate) => candidate.id === trackId);
				return track ? playTrack(track) : rejected('trackNotFound');
			},
			startLibraryAlbum: () => playTrack(track1),
			onEvent: (listener: (event: AppEvent) => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		} satisfies NativeAppApi;
	});
}
