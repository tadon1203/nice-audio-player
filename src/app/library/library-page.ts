import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import type { LibraryTrackSortKey, LibraryTrackSummary } from '@shared/native-app-api';
import { HlmButton } from '@app/ui/spartan/button';
import { PageFrame } from '@app/ui/page-frame';
import { PlaybackSession } from '@app/playback/playback-session';
import { ScrollRegion } from '@app/ui/scroll-region';
import { SortControl, type SortChange, type SortOption } from '@app/ui/sort-control';
import { AlbumArtistGrid } from './album-artist-grid';
import { AlbumGrid } from './album-grid';
import { LibrarySession } from './library-session';
import { libraryStatusMessage } from './library-errors';
import { LibraryPresentation, LibraryWorkspace, type LibrarySortKey } from './library-workspace';
import {
	TrackTable,
	libraryTrackTableColumns,
	type TrackTableRow,
	type TrackTablePlaybackStatus,
	type TrackTableSortChange
} from './track-table';

@Component({
	imports: [
		AlbumArtistGrid,
		AlbumGrid,
		HlmButton,
		NgIcon,
		PageFrame,
		ScrollRegion,
		SortControl,
		TrackTable
	],
	providers: [provideIcons({ lucideSearch })],
	selector: 'app-library-page',
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'library'
	},
	templateUrl: './library-page.html'
})
export class LibraryPage {
	protected readonly trackTableColumns = libraryTrackTableColumns;
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
	protected readonly playbackStatus = computed<TrackTablePlaybackStatus>(
		() => this.playback.snapshot()?.status ?? 'stopped'
	);
	protected readonly trackRows = computed<readonly TrackTableRow[]>(() =>
		this.workspace.tracks().items.map((track) => trackRowFromSummary(track))
	);
	protected readonly trackSortKey = computed(
		() => this.workspace.tracks().sortKey as LibraryTrackSortKey
	);
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

	onSortChange(change: SortChange | TrackTableSortChange): void {
		this.workspace.setSort(this.presentation(), {
			key: change.key as LibrarySortKey,
			direction: change.direction
		});
	}

	openArtistAlbums(artistName: string): void {
		void this.router.navigate(['/library/album-artists', artistName]);
	}

	openAlbum(key: { title: string; albumArtist: string }): void {
		void this.router.navigate(['/library/albums', key.albumArtist, key.title]);
	}

	onScroll(event: Event): void {
		this.workspace.setScrollTop(this.presentation(), (event.target as HTMLElement).scrollTop);
	}

	playTrack(id: string): void {
		void this.playback.startLibraryTrack(id);
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

const trackRowFromSummary = (track: LibraryTrackSummary): TrackTableRow => ({
	id: track.id,
	title: track.title,
	artist: track.artist,
	album: track.album,
	trackNumber: null,
	discNumber: null,
	format: null,
	quality: null,
	durationMs: track.durationMs,
	availability: track.availability,
	playable: track.playable
});

const presentationMeta: Record<LibraryPresentation, PresentationMeta> = {
	albums: {
		title: 'Albums',
		singularNoun: 'album',
		pluralNoun: 'albums',
		searchPlaceholder: 'Search music…',
		sortOptions: [
			{ key: 'title', label: 'Album title' },
			{ key: 'artist', label: 'Album artist' },
			{ key: 'year', label: 'Year' }
		]
	},
	albumArtists: {
		title: 'Album Artists',
		singularNoun: 'album artist',
		pluralNoun: 'album artists',
		searchPlaceholder: 'Search music…',
		sortOptions: [
			{ key: 'artist', label: 'Artist' },
			{ key: 'albumCount', label: 'Album count' },
			{ key: 'trackCount', label: 'Track count' }
		]
	},
	tracks: {
		title: 'Tracks',
		singularNoun: 'track',
		pluralNoun: 'tracks',
		searchPlaceholder: 'Search music…',
		sortOptions: [
			{ key: 'title', label: 'Title' },
			{ key: 'artist', label: 'Artist' },
			{ key: 'album', label: 'Album' },
			{ key: 'duration', label: 'Time' }
		]
	}
};

interface PresentationMeta {
	readonly title: string;
	readonly singularNoun: string;
	readonly pluralNoun: string;
	readonly searchPlaceholder: string;
	readonly sortOptions: readonly SortOption[];
}
