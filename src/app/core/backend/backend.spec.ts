import { TestBed } from '@angular/core/testing';
import type { AppEvent, NativeAppApi, PlaybackQueue, PlaybackState } from '@shared/native-app-api';
import { Backend } from './backend';
import { readBackendError } from './backend-error';

describe('Backend', () => {
	let originalApp: NativeAppApi | undefined;
	let listener: ((event: AppEvent) => void) | undefined;
	let unsubscribeCalls: number;

	const state = {
		status: 'stopped',
		revision: 0,
		file: null,
		volume: 1,
		muted: false,
		outputSelection: { kind: 'systemDefault' },
		canGoPrevious: false,
		canGoNext: false
	} as PlaybackState;
	const queue = {
		revision: 0,
		current: null,
		upcoming: [],
		repeatMode: 'off',
		shuffleEnabled: false
	} as PlaybackQueue;

	beforeEach(() => {
		originalApp = window.app;
		listener = undefined;
		unsubscribeCalls = 0;
		window.app = {
			getPlaybackState: () => Promise.resolve(state),
			getPlaybackQueue: () => Promise.resolve(queue),
			onEvent: (next: Parameters<NativeAppApi['onEvent']>[0]) => {
				listener = next;
				return () => unsubscribeCalls++;
			},
			ping: () => Promise.resolve('pong')
		} as unknown as NativeAppApi;
	});

	afterEach(() => {
		TestBed.resetTestingModule();
		window.app = originalApp;
	});

	it('proxies the host API and forwards events', async () => {
		const backend = TestBed.inject(Backend);
		const received: AppEvent[] = [];
		backend.events.subscribe((event) => received.push(event));

		expect(backend.available).toBe(true);
		expect(await backend.ping()).toBe('pong');
		listener?.({ event: 'ready' });

		expect(received).toEqual([{ event: 'ready' }]);
	});

	it('unsubscribes from host events when destroyed', () => {
		TestBed.inject(Backend);
		TestBed.resetTestingModule();

		expect(unsubscribeCalls).toBe(1);
	});

	it('reports a stable error when the host API is absent', () => {
		window.app = undefined;
		const backend = TestBed.inject(Backend);

		expect(() => backend.ping()).toThrow('Native application API is unavailable.');
		expect(readBackendError({})).toEqual({
			code: null,
			message: 'Unexpected application error.'
		});
	});
});
