import { Component, input, output } from '@angular/core';
import type { LibraryAlbumArtistSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import type { CatalogView } from './library-workspace';
import { PageFrame } from '@app/ui/page-frame';

@Component({
	selector: 'app-album-artist-grid',
	imports: [Artwork, Button, PageFrame],
	templateUrl: './album-artist-grid.html'
})
export class AlbumArtistGrid {
	readonly state = input.required<CatalogView<LibraryAlbumArtistSummary>>();
	readonly selectArtist = output<string>();
	readonly loadMore = output<void>();
	readonly scrollTopChange = output<number>();

	onScroll(event: Event): void {
		this.scrollTopChange.emit((event.target as HTMLElement).scrollTop);
	}
}
