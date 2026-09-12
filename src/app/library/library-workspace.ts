import { DestroyRef, Service, Signal, inject, signal } from '@angular/core';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
	LibraryAlbumArtistSummary,
	LibraryAlbumSummary,
	LibraryTrackSummary
} from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { libraryCommandErrorMessage } from './library-errors';
import { LibrarySession } from './library-session';

export type LibraryPresentation = 'albums' | 'albumArtists' | 'tracks';
export type CatalogLoadState = 'idle' | 'loading' | 'ready' | 'loadingMore' | 'error';
export interface CatalogView<T> {
	readonly filter: string;
	readonly scrollTop: number;
	readonly items: readonly T[];
	readonly totalCount: number | null;
	readonly nextCursor: string | null;
	readonly loadState: CatalogLoadState;
	readonly error: string | null;
	readonly loadedFilter: string | null;
}

type AnyCatalog = CatalogView<unknown>;
type FilterChange = { presentation: LibraryPresentation; filter: string };

const initialView = <T>(): CatalogView<T> => ({
	filter: '',
	scrollTop: 0,
	items: [],
	totalCount: null,
	nextCursor: null,
	loadState: 'idle',
	error: null,
	loadedFilter: null
});

@Service()
export class LibraryWorkspace {
	private readonly backend = inject(Backend);
	private readonly session = inject(LibrarySession);
	private readonly destroyRef = inject(DestroyRef);
	private readonly albumsState = signal<CatalogView<LibraryAlbumSummary>>(initialView());
	private readonly albumArtistsState =
		signal<CatalogView<LibraryAlbumArtistSummary>>(initialView());
	private readonly tracksState = signal<CatalogView<LibraryTrackSummary>>(initialView());
	private readonly filterChanged = new Subject<FilterChange>();
	private readonly generations: Record<LibraryPresentation, number> = {
		albums: 0,
		albumArtists: 0,
		tracks: 0
	};

	readonly albums: Signal<CatalogView<LibraryAlbumSummary>> = this.albumsState.asReadonly();
	readonly albumArtists: Signal<CatalogView<LibraryAlbumArtistSummary>> =
		this.albumArtistsState.asReadonly();
	readonly tracks: Signal<CatalogView<LibraryTrackSummary>> = this.tracksState.asReadonly();

	constructor() {
		this.filterChanged
			.pipe(
				debounceTime(150),
				distinctUntilChanged(
					(previous, next) =>
						previous.presentation === next.presentation && previous.filter === next.filter
				),
				takeUntilDestroyed(this.destroyRef)
			)
			.subscribe(({ presentation }) => void this.reload(presentation));
		this.session.catalogChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.resetCache('albums');
			this.resetCache('albumArtists');
			this.resetCache('tracks');
			void this.reload('albums');
			void this.reload('albumArtists');
			void this.reload('tracks');
		});
	}

	setFilter(presentation: LibraryPresentation, filter: string): void {
		const view = this.view(presentation)();
		if (view.filter === filter) return;
		this.generations[presentation]++;
		this.write(presentation, {
			...view,
			filter,
			items: [],
			totalCount: null,
			nextCursor: null,
			loadState: 'idle',
			error: null,
			loadedFilter: null
		});
		this.filterChanged.next({ presentation, filter });
	}

	setScrollTop(presentation: LibraryPresentation, scrollTop: number): void {
		const view = this.view(presentation)();
		this.write(presentation, { ...view, scrollTop: Math.max(0, scrollTop) });
	}

	async ensureLoaded(presentation: LibraryPresentation): Promise<void> {
		const view = this.view(presentation)();
		if (view.loadState === 'loading' || view.loadState === 'loadingMore') return;
		if (view.loadedFilter === view.filter && view.loadState === 'ready') return;
		await this.reload(presentation);
	}

	async loadMore(presentation: LibraryPresentation): Promise<void> {
		const view = this.view(presentation)();
		if (
			view.nextCursor === null ||
			view.loadState === 'loading' ||
			view.loadState === 'loadingMore'
		)
			return;
		const generation = this.generations[presentation];
		this.write(presentation, { ...view, loadState: 'loadingMore', error: null });
		try {
			const search = view.filter === '' ? null : view.filter;
			const page = await this.loadPage(presentation, view.nextCursor, search);
			if (generation !== this.generations[presentation]) return;
			this.write(presentation, {
				...this.view(presentation)(),
				items: [...this.view(presentation)().items, ...page.items],
				totalCount: page.totalCount,
				nextCursor: page.nextCursor,
				loadState: 'ready',
				loadedFilter: view.filter,
				error: null
			});
		} catch (error) {
			if (generation !== this.generations[presentation]) return;
			this.write(presentation, {
				...this.view(presentation)(),
				loadState: 'error',
				error: libraryCommandErrorMessage(error)
			});
		}
	}

	private async reload(presentation: LibraryPresentation): Promise<void> {
		const generation = ++this.generations[presentation];
		const view = this.view(presentation)();
		this.write(presentation, {
			...view,
			items: [],
			totalCount: null,
			nextCursor: null,
			loadState: 'loading',
			error: null,
			loadedFilter: null
		});
		try {
			const search = view.filter === '' ? null : view.filter;
			const page = await this.loadPage(presentation, null, search);
			if (generation !== this.generations[presentation]) return;
			this.write(presentation, {
				...this.view(presentation)(),
				items: page.items,
				totalCount: page.totalCount,
				nextCursor: page.nextCursor,
				loadState: 'ready',
				loadedFilter: view.filter,
				error: null
			});
		} catch (error) {
			if (generation !== this.generations[presentation]) return;
			this.write(presentation, {
				...this.view(presentation)(),
				loadState: 'error',
				error: libraryCommandErrorMessage(error)
			});
		}
	}

	private loadPage(
		presentation: LibraryPresentation,
		cursor: string | null,
		search: string | null
	): Promise<{ items: readonly unknown[]; totalCount: number | null; nextCursor: string | null }> {
		switch (presentation) {
			case 'albums':
				return this.backend.listLibraryAlbums(cursor, search).then((page) => page);
			case 'albumArtists':
				return this.backend.listLibraryAlbumArtists(cursor, search).then((page) => page);
			case 'tracks':
				return this.backend.listLibraryTracks(cursor, search).then((page) => ({
					items: page.items,
					totalCount: page.totalCount,
					nextCursor: page.nextAfterId
				}));
		}
	}

	private view(presentation: LibraryPresentation): Signal<AnyCatalog> {
		switch (presentation) {
			case 'albums':
				return this.albumsState;
			case 'albumArtists':
				return this.albumArtistsState;
			case 'tracks':
				return this.tracksState;
		}
	}

	private write<T>(presentation: LibraryPresentation, next: CatalogView<T>): void {
		switch (presentation) {
			case 'albums':
				this.albumsState.set(next as CatalogView<LibraryAlbumSummary>);
				return;
			case 'albumArtists':
				this.albumArtistsState.set(next as CatalogView<LibraryAlbumArtistSummary>);
				return;
			case 'tracks':
				this.tracksState.set(next as CatalogView<LibraryTrackSummary>);
				return;
		}
	}

	private resetCache(presentation: LibraryPresentation): void {
		this.generations[presentation]++;
		const view = this.view(presentation)();
		this.write(presentation, {
			...view,
			items: [],
			totalCount: null,
			nextCursor: null,
			loadState: 'idle',
			error: null,
			loadedFilter: null
		});
	}
}
