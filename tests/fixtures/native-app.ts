import type { Page } from '@playwright/test';
import type {
	AppEvent,
	LibraryRoot,
	LibraryScanSnapshot,
	LibraryTrackSummary,
	NativeAppApi,
	PlaybackQueue,
	PlaybackState
} from '@shared/native-app-api';

export async function installNativeAppFixture(page: Page): Promise<void> {
	await page.addInitScript(() => {
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
			listLibraryTracks: (_afterId: string | null, search: string | null) => {
				const filtered =
					roots.length === 0
						? []
						: tracks.filter((track) => search === null || track.title.includes(search));
				return Promise.resolve({
					items: filtered,
					totalCount: filtered.length,
					nextAfterId: null
				});
			},
			listLibraryAlbums: (_afterCursor: string | null, search: string | null) =>
				Promise.resolve({
					items:
						roots.length === 0 || (search !== null && !'Test album Test artist'.includes(search))
							? []
							: [{ key: { title: 'Test album', albumArtist: 'Test artist' }, artwork: null }],
					totalCount:
						roots.length === 0 || (search !== null && !'Test album Test artist'.includes(search))
							? 0
							: 1,
					nextCursor: null
				}),
			listLibraryAlbumArtists: (_afterCursor: string | null, search: string | null) =>
				Promise.resolve({
					items:
						roots.length === 0 || (search !== null && !'Test artist'.includes(search))
							? []
							: [{ key: { name: 'Test artist' }, artwork: null, albumCount: 1 }],
					totalCount:
						roots.length === 0 || (search !== null && !'Test artist'.includes(search)) ? 0 : 1,
					nextCursor: null
				}),
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
