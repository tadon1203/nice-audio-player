import { Service, Signal, inject, signal } from '@angular/core';
import type {
	LibraryAlbumArtistKey,
	LibraryAlbumArtistSummary,
	LibraryAlbumSummary,
	LibraryArtistAlbumSortKey,
	LibrarySortDirection
} from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { libraryCommandErrorMessage } from './library-errors';

export type ArtistDetailsLoadState = 'idle' | 'loading' | 'ready' | 'loadingMore' | 'error';
export interface ArtistDetailsSortChange {
	readonly key: LibraryArtistAlbumSortKey;
	readonly direction: LibrarySortDirection;
}

@Service()
export class ArtistDetailsWorkspace {
	private readonly backend = inject(Backend);
	private readonly artistState = signal<LibraryAlbumArtistSummary | null>(null);
	private readonly albumsState = signal<readonly LibraryAlbumSummary[]>([]);
	private readonly nextCursorState = signal<string | null>(null);
	private readonly loadStateState = signal<ArtistDetailsLoadState>('idle');
	private readonly errorState = signal<string | null>(null);
	private readonly sortState = signal<ArtistDetailsSortChange>({
		key: 'year',
		direction: 'ascending'
	});
	private readonly sortsByArtist = new Map<string, ArtistDetailsSortChange>();
	private currentArtist: LibraryAlbumArtistKey | null = null;
	private generation = 0;

	readonly artist: Signal<LibraryAlbumArtistSummary | null> = this.artistState.asReadonly();
	readonly albums: Signal<readonly LibraryAlbumSummary[]> = this.albumsState.asReadonly();
	readonly nextCursor: Signal<string | null> = this.nextCursorState.asReadonly();
	readonly loadState: Signal<ArtistDetailsLoadState> = this.loadStateState.asReadonly();
	readonly error: Signal<string | null> = this.errorState.asReadonly();
	readonly sort: Signal<ArtistDetailsSortChange> = this.sortState.asReadonly();

	async ensureLoaded(artist: LibraryAlbumArtistKey): Promise<void> {
		if (sameArtist(this.currentArtist, artist) && this.loadState() === 'ready') return;
		this.currentArtist = artist;
		this.sortState.set(
			this.sortsByArtist.get(artist.name) ?? { key: 'year', direction: 'ascending' }
		);
		const generation = ++this.generation;
		this.artistState.set(null);
		this.albumsState.set([]);
		this.nextCursorState.set(null);
		this.errorState.set(null);
		this.loadStateState.set('loading');
		try {
			const selection = this.sort();
			const [summary, page] = await Promise.all([
				this.backend.getLibraryAlbumArtist(artist),
				this.backend.listLibraryArtistAlbums(artist, null, selection.key, selection.direction)
			]);
			if (generation !== this.generation) return;
			this.artistState.set(summary);
			this.albumsState.set(page.items);
			this.nextCursorState.set(page.nextCursor);
			this.loadStateState.set('ready');
		} catch (error) {
			if (generation !== this.generation) return;
			this.errorState.set(libraryCommandErrorMessage(error));
			this.loadStateState.set('error');
		}
	}

	setSort(selection: ArtistDetailsSortChange): void {
		const artist = this.currentArtist;
		if (!artist || sameSort(this.sort(), selection)) return;
		this.sortsByArtist.set(artist.name, selection);
		this.sortState.set(selection);
		this.albumsState.set([]);
		this.nextCursorState.set(null);
		this.loadStateState.set('idle');
		void this.ensureLoaded(artist);
	}

	async loadMore(): Promise<void> {
		const artist = this.currentArtist;
		const cursor = this.nextCursor();
		if (!artist || cursor === null || this.loadState() === 'loadingMore') return;
		const generation = this.generation;
		this.loadStateState.set('loadingMore');
		try {
			const selection = this.sort();
			const page = await this.backend.listLibraryArtistAlbums(
				artist,
				cursor,
				selection.key,
				selection.direction
			);
			if (generation !== this.generation) return;
			this.albumsState.set([...this.albums(), ...page.items]);
			this.nextCursorState.set(page.nextCursor);
			this.loadStateState.set('ready');
		} catch (error) {
			if (generation !== this.generation) return;
			this.errorState.set(libraryCommandErrorMessage(error));
			this.loadStateState.set('error');
		}
	}
}

const sameArtist = (left: LibraryAlbumArtistKey | null, right: LibraryAlbumArtistKey): boolean =>
	left?.name === right.name;

const sameSort = (left: ArtistDetailsSortChange, right: ArtistDetailsSortChange): boolean =>
	left.key === right.key && left.direction === right.direction;
