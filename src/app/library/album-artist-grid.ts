import { Component, input, output } from '@angular/core';
import type { LibraryAlbumArtistSummary } from '@shared/native-app-api';
import { Artwork } from '@app/ui/artwork';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-album-artist-grid',
	imports: [Artwork],
	templateUrl: './album-artist-grid.html'
})
export class AlbumArtistGrid {
	readonly state = input.required<CatalogView<LibraryAlbumArtistSummary>>();
	readonly loadMore = output<void>();
	readonly scrollTopChange = output<number>();

	onScroll(event: Event): void {
		this.scrollTopChange.emit((event.target as HTMLElement).scrollTop);
	}
}
