import { Service, Signal, inject, signal } from '@angular/core';
import type {
	LibraryAlbumDetails,
	LibraryAlbumKey,
	LibraryAlbumTrackSummary
} from '@shared/native-app-api';
import { Backend } from '@app/core/backend/backend';
import { libraryCommandErrorMessage } from './library-errors';

export type AlbumDetailsLoadState = 'idle' | 'loading' | 'ready' | 'loadingMore' | 'error';

@Service()
export class AlbumDetailsWorkspace {
	private readonly backend = inject(Backend);
	private readonly detailsState = signal<LibraryAlbumDetails | null>(null);
	private readonly tracksState = signal<readonly LibraryAlbumTrackSummary[]>([]);
	private readonly nextCursorState = signal<string | null>(null);
	private readonly loadStateState = signal<AlbumDetailsLoadState>('idle');
	private readonly errorState = signal<string | null>(null);
	private currentKey: LibraryAlbumKey | null = null;
	private generation = 0;

	readonly details: Signal<LibraryAlbumDetails | null> = this.detailsState.asReadonly();
	readonly tracks: Signal<readonly LibraryAlbumTrackSummary[]> = this.tracksState.asReadonly();
	readonly nextCursor: Signal<string | null> = this.nextCursorState.asReadonly();
	readonly loadState: Signal<AlbumDetailsLoadState> = this.loadStateState.asReadonly();
	readonly error: Signal<string | null> = this.errorState.asReadonly();

	async ensureLoaded(key: LibraryAlbumKey): Promise<void> {
		if (sameAlbumKey(this.currentKey, key) && this.loadState() === 'ready') return;
		if (sameAlbumKey(this.currentKey, key) && this.loadState() === 'loading') return;

		this.currentKey = key;
		const generation = ++this.generation;
		this.detailsState.set(null);
		this.tracksState.set([]);
		this.nextCursorState.set(null);
		this.errorState.set(null);
		this.loadStateState.set('loading');

		try {
			const [details, page] = await Promise.all([
				this.backend.getLibraryAlbumDetails(key),
				this.backend.listLibraryAlbumTracks(key, null)
			]);
			if (generation !== this.generation) return;
			this.detailsState.set(details);
			this.tracksState.set(page.items);
			this.nextCursorState.set(page.nextCursor);
			this.loadStateState.set('ready');
		} catch (error) {
			if (generation !== this.generation) return;
			this.errorState.set(libraryCommandErrorMessage(error));
			this.loadStateState.set('error');
		}
	}

	async loadMore(): Promise<void> {
		const key = this.currentKey;
		const cursor = this.nextCursor();
		if (!key || cursor === null || this.loadState() === 'loadingMore') return;

		const generation = this.generation;
		this.loadStateState.set('loadingMore');
		try {
			const page = await this.backend.listLibraryAlbumTracks(key, cursor);
			if (generation !== this.generation) return;
			this.tracksState.set([...this.tracks(), ...page.items]);
			this.nextCursorState.set(page.nextCursor);
			this.loadStateState.set('ready');
		} catch (error) {
			if (generation !== this.generation) return;
			this.errorState.set(libraryCommandErrorMessage(error));
			this.loadStateState.set('error');
		}
	}
}

const sameAlbumKey = (left: LibraryAlbumKey | null, right: LibraryAlbumKey): boolean =>
	left?.title === right.title && left.albumArtist === right.albumArtist;
