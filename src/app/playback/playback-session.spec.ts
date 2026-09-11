import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type {
	AppEvent,
	LibraryTrackSummary,
	PlaybackQueue,
	PlaybackState
} from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { PlaybackSession } from './playback-session';

const stopped = (revision = 0, volume = 1): PlaybackState => ({
	status: 'stopped',
	revision,
	file: null,
	volume,
	muted: false,
	outputSelection: { kind: 'systemDefault' },
	canGoPrevious: false,
	canGoNext: false
});

const playing = (revision: number, path = 'C:/Music/track.wav', positionMs = 0): PlaybackState => ({
	status: 'playing',
	revision,
	file: { path, fileName: 'track.wav', extension: 'wav' },
	playbackId: `playback-${revision}`,
	positionMs,
	durationMs: 120000,
	volume: 1,
	muted: false,
	outputSelection: { kind: 'systemDefault' },
	outputDevice: { id: 'default', name: 'Default' },
	channelConversion: 'none',
	sourceSampleRate: 44100,
	outputSampleRate: 44100,
	resamplingActive: false,
	canGoPrevious: false,
	canGoNext: true
});

const queue = (revision = 0): PlaybackQueue => ({
	revision,
	current: null,
	upcoming: [],
	repeatMode: 'off',
	shuffleEnabled: false
});

const track: LibraryTrackSummary = {
	id: 'track-1',
	title: 'Track title',
	artist: 'Artist',
	album: 'Album',
	albumArtist: 'Artist',
	artwork: null,
	durationMs: 120000,
	availability: 'available',
	playable: true
};

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: (value) => resolvePromise(value) };
}

describe('PlaybackSession', () => {
	let events: Subject<AppEvent>;
	let fake: Record<string, unknown>;

	beforeEach(() => {
		TestBed.resetTestingModule();
		events = new Subject<AppEvent>();
		fake = {
			events: events.asObservable(),
			getPlaybackState: vi.fn().mockResolvedValue(stopped()),
			getPlaybackQueue: vi.fn().mockResolvedValue(queue()),
			getLibraryTrackForPath: vi.fn().mockResolvedValue(track),
			pausePlayback: vi.fn().mockResolvedValue(stopped(1)),
			resumePlayback: vi.fn().mockResolvedValue(playing(1)),
			previousPlayback: vi.fn().mockResolvedValue(playing(1)),
			nextPlayback: vi.fn().mockResolvedValue(playing(1)),
			seekPlayback: vi.fn().mockResolvedValue(playing(1)),
			setPlaybackVolume: vi.fn().mockResolvedValue(stopped(1, 1)),
			setPlaybackMuted: vi.fn().mockResolvedValue(stopped(1))
		};
		TestBed.configureTestingModule({
			providers: [{ provide: Backend, useValue: fake }]
		});
	});

	afterEach(() => TestBed.resetTestingModule());

	it('subscribes before initial reads and discards stale revisions', async () => {
		const initialState = deferred<PlaybackState>();
		const initialQueue = deferred<PlaybackQueue>();
		(fake.getPlaybackState as ReturnType<typeof vi.fn>).mockReturnValue(initialState.promise);
		(fake.getPlaybackQueue as ReturnType<typeof vi.fn>).mockReturnValue(initialQueue.promise);
		const session = TestBed.inject(PlaybackSession);
		events.next({ event: 'playbackStateChanged', payload: playing(2) });
		initialState.resolve(playing(1));
		initialQueue.resolve(queue(1));
		await Promise.resolve();
		await Promise.resolve();

		expect(session.snapshot()?.revision).toBe(2);
		events.next({ event: 'playbackStateChanged', payload: playing(1, 'C:/Music/old.wav') });
		expect(session.snapshot()?.file?.path).toBe('C:/Music/track.wav');
		events.next({ event: 'playbackStateChanged', payload: playing(2, 'C:/Music/new.wav') });
		expect(session.snapshot()?.file?.path).toBe('C:/Music/new.wav');
	});

	it('looks up a track only when the accepted file path changes', async () => {
		const session = TestBed.inject(PlaybackSession);
		await Promise.resolve();
		await Promise.resolve();
		const lookup = fake.getLibraryTrackForPath as ReturnType<typeof vi.fn>;
		events.next({ event: 'playbackStateChanged', payload: playing(1) });
		events.next({ event: 'playbackStateChanged', payload: playing(2, 'C:/Music/track.wav') });
		await Promise.resolve();
		expect(lookup).toHaveBeenCalledTimes(1);
		events.next({ event: 'playbackStateChanged', payload: playing(3, 'C:/Music/new.wav') });
		await Promise.resolve();
		expect(lookup).toHaveBeenCalledTimes(2);
		await Promise.resolve();
		expect(session.title()).toBe('Track title');
	});

	it('allows only one transport command at a time', async () => {
		const pending = deferred<PlaybackState>();
		(fake.pausePlayback as ReturnType<typeof vi.fn>).mockReturnValue(pending.promise);
		const session = TestBed.inject(PlaybackSession);
		void session.pause();
		void session.pause();
		expect(fake.pausePlayback).toHaveBeenCalledTimes(1);
		pending.resolve(stopped(1));
		await Promise.resolve();
		expect(session.transportPending()).toBeNull();
	});

	it('coalesces volume writes while keeping the requested value immediate', async () => {
		const first = deferred<PlaybackState>();
		const second = deferred<PlaybackState>();
		(fake.setPlaybackVolume as ReturnType<typeof vi.fn>)
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const session = TestBed.inject(PlaybackSession);
		session.setVolume(0.2);
		session.setVolume(0.8);
		expect(session.volume()).toBe(0.8);
		first.resolve(stopped(1, 0.2));
		await Promise.resolve();
		expect(fake.setPlaybackVolume).toHaveBeenNthCalledWith(2, 0.8);
		second.resolve(stopped(2, 0.8));
		await Promise.resolve();
		expect(session.volume()).toBe(0.8);
	});
});
