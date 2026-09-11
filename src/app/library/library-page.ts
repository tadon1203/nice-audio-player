import { Component, computed, inject } from '@angular/core';
import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import type { LibraryAlbumKey } from '@shared/native-app-api';
import { PageFrame } from '@app/ui/page-frame';
import { PlaybackSession } from '@app/playback/playback-session';
import { AlbumArtistGrid } from './album-artist-grid';
import { AlbumGrid } from './album-grid';
import { LibrarySession } from './library-session';
import { libraryStatusMessage } from './library-errors';
import { LibraryPresentation, LibraryWorkspace } from './library-workspace';
import { TrackList } from './track-list';

@Component({
	imports: [
		Tab,
		TabContent,
		TabList,
		TabPanel,
		Tabs,
		AlbumArtistGrid,
		AlbumGrid,
		PageFrame,
		TrackList
	],
	selector: 'app-library-page',
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'library'
	},
	templateUrl: './library-page.html'
})
export class LibraryPage {
	protected readonly workspace = inject(LibraryWorkspace);
	protected readonly playback = inject(PlaybackSession);
	protected readonly library = inject(LibrarySession);
	protected readonly currentFilter = computed(
		() => this.viewFor(this.workspace.presentation()).filter
	);
	protected readonly activeTrackId = computed(() => this.playback.currentTrack()?.id ?? null);
	protected readonly playbackStatus = computed(() => this.playback.snapshot()?.status ?? 'stopped');
	protected readonly statusMessage = computed(() => {
		const status = this.library.status();
		return status ? libraryStatusMessage(status) : null;
	});

	constructor() {
		void this.workspace.ensureLoaded(this.workspace.presentation());
	}

	onPresentationChange(value: unknown): void {
		if (value !== 'albums' && value !== 'albumArtists' && value !== 'tracks') return;
		this.workspace.selectPresentation(value);
	}

	onFilterInput(presentation: LibraryPresentation, event: Event): void {
		this.workspace.setFilter(presentation, (event.target as HTMLInputElement).value);
	}

	openArtistAlbums(artistName: string): void {
		this.workspace.setFilter('albums', artistName);
		this.workspace.selectPresentation('albums');
	}

	onScroll(presentation: LibraryPresentation, top: number): void {
		this.workspace.setScrollTop(presentation, top);
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
