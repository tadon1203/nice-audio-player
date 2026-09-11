import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { AppEvent, LibraryScanSnapshot, LibraryStatus } from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { LibrarySession } from './library-session';

const idle: LibraryScanSnapshot = {
	state: 'idle',
	currentRoot: null,
	discoveredCount: null,
	inspectedCount: null,
	indexedCount: null,
	failedCount: null,
	failureCode: null
};

describe('LibrarySession', () => {
	let events: Subject<AppEvent>;
	let fake: Record<string, unknown>;

	beforeEach(() => {
		TestBed.resetTestingModule();
		events = new Subject<AppEvent>();
		const status: LibraryStatus = { status: 'ready' };
		fake = {
			events: events.asObservable(),
			getLibraryStatus: vi.fn().mockResolvedValue(status),
			getLibraryScanState: vi.fn().mockResolvedValue(idle),
			startLibraryScan: vi.fn().mockResolvedValue(undefined),
			cancelLibraryScan: vi.fn().mockResolvedValue(undefined)
		};
		TestBed.configureTestingModule({ providers: [{ provide: Backend, useValue: fake }] });
	});

	afterEach(() => TestBed.resetTestingModule());

	it('loads status and scan state and mirrors scan events', async () => {
		const session = TestBed.inject(LibrarySession);
		await Promise.resolve();
		await Promise.resolve();
		expect(session.status()).toEqual({ status: 'ready' });
		expect(session.scan()?.state).toBe('idle');
		const running = { ...idle, state: 'running' as const, inspectedCount: 1 };
		events.next({ event: 'libraryScanStateChanged', payload: running });
		expect(session.scan()).toEqual(running);
	});

	it('emits catalog invalidation only when a scan completes', () => {
		const session = TestBed.inject(LibrarySession);
		const changes: number[] = [];
		session.catalogChanged.subscribe(() => changes.push(1));
		events.next({ event: 'libraryScanStateChanged', payload: { ...idle, state: 'running' } });
		events.next({ event: 'libraryScanStateChanged', payload: { ...idle, state: 'completed' } });
		events.next({ event: 'libraryScanStateChanged', payload: { ...idle, state: 'completed' } });
		expect(changes).toHaveLength(1);
	});
});
