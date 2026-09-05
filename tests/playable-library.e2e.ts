import { expect, test } from '@playwright/test';
import type { LibraryRoot, LibraryScanSnapshot } from '../src/lib/api/contracts';

test.beforeEach(async ({ page }) => {
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
		const listeners = new Set<Parameters<NonNullable<typeof window.app>['onEvent']>[0]>();
		const stopped = {
			status: 'stopped' as const,
			revision: 0,
			file: null,
			volume: 1,
			muted: false,
			outputSelection: { kind: 'systemDefault' as const },
			canGoPrevious: false,
			canGoNext: false
		};
		const playing = {
			status: 'playing' as const,
			revision: 1,
			file: { path: 'C:/Music/track.wav', fileName: 'track.wav', extension: 'wav' },
			playbackId: 'playback-1',
			positionMs: 0,
			durationMs: 120000,
			volume: 1,
			muted: false,
			outputSelection: { kind: 'systemDefault' as const },
			outputDevice: { id: 'default', name: 'Default' },
			channelConversion: 'none' as const,
			sourceSampleRate: 44100,
			outputSampleRate: 44100,
			resamplingActive: false,
			canGoPrevious: false,
			canGoNext: false
		};
		const track = {
			id: 'track-1',
			title: 'Test track',
			artist: 'Test artist',
			album: 'Test album',
			albumArtist: 'Test artist',
			artwork: null,
			durationMs: 120000,
			availability: 'available' as const,
			playable: true
		};
		window.app = {
			ping: () => Promise.resolve('pong'),
			getPlaybackState: () => Promise.resolve(stopped),
			getPlaybackQueue: () =>
				Promise.resolve({
					revision: 0,
					current: null,
					upcoming: [],
					repeatMode: 'off',
					shuffleEnabled: false
				}),
			listAudioOutputDevices: () => Promise.resolve([]),
			selectLibraryDirectory: () => Promise.resolve('C:/Music'),
			listLibraryRoots: () => Promise.resolve(roots),
			registerLibraryRoot: (path) => {
				const root = {
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
			setLibraryRootEnabled: (id, enabled) => {
				roots = roots.map((root) => ({
					...root,
					enabled: root.id === id ? enabled : root.enabled
				}));
				persistRoots();
				const root = roots.find((candidate) => candidate.id === id);
				if (!root) throw new Error('test root not found');
				return Promise.resolve(root);
			},
			removeLibraryRoot: (id) => {
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
				listeners.forEach((listener) =>
					listener({ event: 'libraryScanStateChanged', payload: scan })
				);
				return Promise.resolve();
			},
			cancelLibraryScan: () => {
				scan = { ...scan, state: 'cancelled' };
				return Promise.resolve();
			},
			listLibraryTracks: () =>
				Promise.resolve({
					items: roots.length === 0 ? [] : [track],
					nextAfterId: null
				}),
			listLibraryAlbums: () =>
				Promise.resolve({
					items:
						roots.length === 0
							? []
							: [{ key: { title: 'Test album', albumArtist: 'Test artist' }, artwork: null }],
					nextCursor: null
				}),
			listLibraryAlbumArtists: () =>
				Promise.resolve({
					items:
						roots.length === 0
							? []
							: [{ key: { name: 'Test artist' }, artwork: null, albumCount: 1 }],
					nextCursor: null
				}),
			startLibraryTrack: () => {
				setTimeout(() => {
					listeners.forEach((listener) =>
						listener({ event: 'playbackStateChanged', payload: playing })
					);
				}, 0);
				return Promise.resolve(playing);
			},
			startLibraryAlbum: () => Promise.resolve(playing),
			onEvent: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
		(window as Window & { __emitPlayback?: () => void }).__emitPlayback = () => {
			listeners.forEach((listener) =>
				listener({ event: 'playbackStateChanged', payload: playing })
			);
		};
	});
});

test('connects folder registration, scan, catalog selection, and playback dock', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Add folder' }).click();
	await expect(page.getByText('C:/Music')).toBeVisible();
	await page.getByRole('button', { name: 'Rescan' }).click();
	await expect(page.getByRole('status')).toContainText('1 inspected');

	await page.goto('/library');
	await page.getByRole('tab', { name: 'Tracks' }).click();
	await expect(page.getByRole('button', { name: /Test track/ })).toBeVisible();
	await page.getByRole('button', { name: /Test track/ }).click();
	await page.evaluate(() =>
		(window as Window & { __emitPlayback?: () => void }).__emitPlayback?.()
	);
	await expect(page.getByTestId('playback-dock')).toContainText('track.wav');
});

test('uses AlertDialog keyboard focus and cancel behavior', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Add folder' }).click();
	await page.getByRole('button', { name: 'Remove' }).click();
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toBeVisible();
	const cancel = dialog.getByRole('button', { name: 'Cancel' });
	await expect(cancel).toHaveAttribute('autofocus', '');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('empty library remains interactive across tabs and routes', async ({ page }) => {
	const errors: Error[] = [];
	page.on('pageerror', (error) => errors.push(error));

	await page.goto('/library');
	const albums = page.getByRole('tab', { name: 'Albums' });
	await albums.click();
	await expect(albums).toHaveAttribute('aria-selected', 'true');
	await expect
		.poll(() => albums.evaluate((element) => getComputedStyle(element, '::after').opacity))
		.toBe('1');

	const artists = page.getByRole('tab', { name: 'Album Artists' });
	await artists.click();
	await expect(artists).toHaveAttribute('aria-selected', 'true');

	const tracks = page.getByRole('tab', { name: 'Tracks' });
	await tracks.click();
	await expect(tracks).toHaveAttribute('aria-selected', 'true');
	await tracks.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(artists).toBeFocused();
	await expect(artists).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.locator('[data-page="settings"]')).toBeVisible();
	await page.getByRole('link', { name: 'Library' }).click();
	await expect(page).toHaveURL(/\/library$/);
	await expect(page.locator('[data-page="library"]')).toBeVisible();

	expect(errors).toEqual([]);
});
