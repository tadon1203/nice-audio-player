import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { AppEvent, LibraryStatus } from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { LibrarySession } from './library-session';
import { LibraryWorkspace } from './library-workspace';

describe('LibraryWorkspace', () => {
	let fake: Record<string, unknown>;

	beforeEach(() => {
		TestBed.resetTestingModule();
		fake = {
			events: new Subject<AppEvent>(),
			getLibraryStatus: vi.fn().mockResolvedValue({ status: 'ready' } satisfies LibraryStatus),
			getLibraryScanState: vi.fn().mockResolvedValue({
				state: 'idle',
				currentRoot: null,
				discoveredCount: null,
				inspectedCount: null,
				indexedCount: null,
				failedCount: null,
				failureCode: null
			}),
			listLibraryAlbums: vi.fn().mockResolvedValue({ items: [], totalCount: 0, nextCursor: null }),
			listLibraryAlbumArtists: vi
				.fn()
				.mockResolvedValue({ items: [], totalCount: 0, nextCursor: null }),
			listLibraryTracks: vi.fn().mockResolvedValue({ items: [], totalCount: 0, nextAfterId: null })
		};
		TestBed.configureTestingModule({
			providers: [{ provide: Backend, useValue: fake }, LibrarySession, LibraryWorkspace]
		});
	});

	afterEach(() => TestBed.resetTestingModule());

	it('keeps filters and scroll positions independent by presentation', () => {
		const workspace = TestBed.inject(LibraryWorkspace);
		workspace.setFilter('albums', 'album');
		workspace.setFilter('tracks', 'track');
		workspace.setScrollTop('albums', 120);
		workspace.setScrollTop('tracks', 240);

		expect(workspace.albums().filter).toBe('album');
		expect(workspace.tracks().filter).toBe('track');
		expect(workspace.albums().scrollTop).toBe(120);
		expect(workspace.tracks().scrollTop).toBe(240);
	});

	it('normalizes track pagination and appends a next page', async () => {
		(fake.listLibraryTracks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			items: [],
			totalCount: 0,
			nextAfterId: 'track-1'
		});
		const workspace = TestBed.inject(LibraryWorkspace);
		await workspace.ensureLoaded('tracks');
		expect(workspace.tracks().nextCursor).toBe('track-1');
		(fake.listLibraryTracks as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			items: [],
			totalCount: 0,
			nextAfterId: null
		});
		await workspace.loadMore('tracks');
		expect(workspace.tracks().loadState).toBe('ready');
	});

	it('keeps the backend total separate from the loaded item count', async () => {
		(fake.listLibraryAlbums as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			items: [],
			totalCount: 184,
			nextCursor: 'album-100'
		});
		const workspace = TestBed.inject(LibraryWorkspace);

		await workspace.ensureLoaded('albums');

		expect(workspace.albums().items).toHaveLength(0);
		expect(workspace.albums().totalCount).toBe(184);

		(fake.listLibraryAlbums as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			items: [],
			totalCount: 184,
			nextCursor: null
		});
		await workspace.loadMore('albums');

		expect(workspace.albums().totalCount).toBe(184);
	});
});
