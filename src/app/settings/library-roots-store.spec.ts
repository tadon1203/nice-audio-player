import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { AppEvent, LibraryRoot } from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { LibrarySession } from '@app/library/library-session';
import { LibraryRootsStore } from './library-roots-store';

const root: LibraryRoot = {
	id: 'root-1',
	path: 'C:/Music',
	enabled: true,
	scanGeneration: 0,
	lastSuccessfulScanAtMs: null
};

describe('LibraryRootsStore', () => {
	it('updates its mirror only after successful mutations', async () => {
		const invalidate = vi.fn();
		const fake = {
			listLibraryRoots: vi.fn().mockResolvedValue([]),
			selectLibraryDirectory: vi.fn().mockResolvedValue('C:/Music'),
			registerLibraryRoot: vi.fn().mockReturnValue(new Promise<LibraryRoot>(() => undefined)),
			events: new Subject<AppEvent>(),
			getLibraryStatus: vi.fn().mockResolvedValue({ status: 'ready' }),
			getLibraryScanState: vi.fn().mockResolvedValue({
				state: 'idle',
				currentRoot: null,
				discoveredCount: null,
				inspectedCount: null,
				indexedCount: null,
				failedCount: null,
				failureCode: null
			})
		};
		TestBed.configureTestingModule({
			providers: [
				LibraryRootsStore,
				{ provide: Backend, useValue: fake },
				{ provide: LibrarySession, useValue: { invalidateCatalog: invalidate } }
			]
		});
		const store = TestBed.inject(LibraryRootsStore);
		await store.load();
		const pending = store.addFolder();
		expect(store.roots()).toEqual([]);
		await Promise.resolve();
		expect(store.roots()).toEqual([]);
		void pending;
	});

	it('replaces an enabled root after the backend confirms it', async () => {
		const fake = {
			listLibraryRoots: vi.fn().mockResolvedValue([root]),
			setLibraryRootEnabled: vi.fn().mockResolvedValue({ ...root, enabled: false }),
			events: new Subject<AppEvent>(),
			getLibraryStatus: vi.fn().mockResolvedValue({ status: 'ready' }),
			getLibraryScanState: vi.fn().mockResolvedValue({
				state: 'idle',
				currentRoot: null,
				discoveredCount: null,
				inspectedCount: null,
				indexedCount: null,
				failedCount: null,
				failureCode: null
			})
		};
		TestBed.configureTestingModule({
			providers: [
				LibraryRootsStore,
				{ provide: Backend, useValue: fake },
				{ provide: LibrarySession, useValue: { invalidateCatalog: vi.fn() } }
			]
		});
		const store = TestBed.inject(LibraryRootsStore);
		await store.load();
		await store.setEnabled(root, false);
		expect(store.roots()[0].enabled).toBe(false);
	});
});
