import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { map } from 'rxjs';
import type { LibraryAlbumArtistKey, LibraryArtistAlbumSortKey } from '@shared/native-app-api';
import { Artwork } from '@app/ui/artwork';
import type { SelectOption } from '@app/ui/app-select';
import { Button } from '@app/ui/button';
import { PageFrame } from '@app/ui/page-frame';
import { ScrollRegion } from '@app/ui/scroll-region';
import { SortControl } from '@app/ui/sort-control';
import { ArtistDetailsWorkspace } from './artist-details-workspace';

@Component({
	selector: 'app-artist-details-page',
	imports: [Artwork, Button, LucideArrowLeft, PageFrame, RouterLink, ScrollRegion, SortControl],
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'artist-details'
	},
	templateUrl: './artist-details-page.html'
})
export class ArtistDetailsPage {
	private readonly route = inject(ActivatedRoute);
	private readonly destroyRef = inject(DestroyRef);
	protected readonly workspace = inject(ArtistDetailsWorkspace);
	protected readonly artistKey = toSignal(
		this.route.paramMap.pipe(
			map((params): LibraryAlbumArtistKey | null => {
				const name = params.get('artistName');
				return name ? { name } : null;
			})
		),
		{ initialValue: this.readArtistKey() }
	);
	protected readonly sortOptions: readonly SelectOption[] = [
		{ key: 'year', label: 'Year' },
		{ key: 'title', label: 'Album title' }
	];
	protected readonly sort = this.workspace.sort;
	protected readonly artist = this.workspace.artist;
	protected readonly albums = this.workspace.albums;

	constructor() {
		this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			const artist = this.artistKey();
			if (artist) void this.workspace.ensureLoaded(artist);
		});
	}

	openAlbum(key: { title: string; albumArtist: string }): string[] {
		return ['/library/albums', key.albumArtist, key.title];
	}

	onSortChange(change: { key: string; direction: 'ascending' | 'descending' }): void {
		this.workspace.setSort({
			key: change.key as LibraryArtistAlbumSortKey,
			direction: change.direction
		});
	}

	private readArtistKey(): LibraryAlbumArtistKey | null {
		const name = this.route.snapshot.paramMap.get('artistName');
		return name ? { name } : null;
	}
}
