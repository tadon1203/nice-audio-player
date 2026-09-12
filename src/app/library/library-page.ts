import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { LucideSearch } from '@lucide/angular';
import type { LibraryAlbumKey } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { PageFrame } from '@app/ui/page-frame';
import { PlaybackSession } from '@app/playback/playback-session';
import { AlbumArtistGrid } from './album-artist-grid';
import { AlbumGrid } from './album-grid';
import { LibrarySession } from './library-session';
import { libraryStatusMessage } from './library-errors';
import { LibraryPresentation, LibraryWorkspace } from './library-workspace';
import { TrackList } from './track-list';

@Component({
	imports: [AlbumArtistGrid, AlbumGrid, Button, LucideSearch, PageFrame, TrackList],
	selector: 'app-library-page',
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'library'
	},
	templateUrl: './library-page.html'
})
export class LibraryPage {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	protected readonly workspace = inject(LibraryWorkspace);
	protected readonly playback = inject(PlaybackSession);
	protected readonly library = inject(LibrarySession);
	protected readonly presentation = toSignal(
		this.route.data.pipe(map((data) => data['presentation'] as LibraryPresentation)),
		{ initialValue: this.route.snapshot.data['presentation'] as LibraryPresentation }
	);
	protected readonly currentFilter = computed(() => this.viewFor(this.presentation()).filter);
	protected readonly activeTrackId = computed(() => this.playback.currentTrack()?.id ?? null);
	protected readonly playbackStatus = computed(() => this.playback.snapshot()?.status ?? 'stopped');
	protected readonly pageMeta = computed(() => presentationMeta[this.presentation()]);
	protected readonly currentView = computed(() => this.viewFor(this.presentation()));
	protected readonly resultCount = computed(() => {
		const count = this.currentView().totalCount;
		const noun = count === 1 ? this.pageMeta().singularNoun : this.pageMeta().pluralNoun;
		return `${count === null ? '—' : count.toLocaleString()} ${noun}`;
	});
	protected readonly emptyMessage = computed(() =>
		this.currentFilter() === ''
			? `No ${this.pageMeta().pluralNoun} in your library.`
			: `No results for “${this.currentFilter()}”.`
	);
	protected readonly statusMessage = computed(() => {
		const status = this.library.status();
		return status ? libraryStatusMessage(status) : null;
	});

	constructor() {
		void this.workspace.ensureLoaded(this.presentation());
	}

	onFilterInput(event: Event): void {
		this.workspace.setFilter(this.presentation(), (event.target as HTMLInputElement).value);
	}

	openArtistAlbums(artistName: string): void {
		this.workspace.setFilter('albums', artistName);
		void this.router.navigate(['/library/albums']);
	}

	onScroll(event: Event): void {
		this.workspace.setScrollTop(this.presentation(), (event.target as HTMLElement).scrollTop);
	}

	playTrack(id: string): void {
		void this.playback.startLibraryTrack(id);
	}

	playAlbum(key: LibraryAlbumKey): void {
		void this.playback.startLibraryAlbum(key);
	}

	private viewFor(presentation: LibraryPresentation) {
		switch (presentation) {
			case 'albums':
				return this.workspace.albums();
			case 'albumArtists':
				return this.workspace.albumArtists();
			case 'tracks':
				return this.workspace.tracks();
		}
	}
}

const presentationMeta: Record<LibraryPresentation, PresentationMeta> = {
	albums: {
		title: 'Albums',
		singularNoun: 'album',
		pluralNoun: 'albums',
		searchPlaceholder: 'Search music…',
		sortLabel: 'Sort: Album title'
	},
	albumArtists: {
		title: 'Album Artists',
		singularNoun: 'album artist',
		pluralNoun: 'album artists',
		searchPlaceholder: 'Search music…',
		sortLabel: 'Sort: Artist name'
	},
	tracks: {
		title: 'Tracks',
		singularNoun: 'track',
		pluralNoun: 'tracks',
		searchPlaceholder: 'Search music…',
		sortLabel: 'Sort: Added order'
	}
};

interface PresentationMeta {
	readonly title: string;
	readonly singularNoun: string;
	readonly pluralNoun: string;
	readonly searchPlaceholder: string;
	readonly sortLabel: string;
}
