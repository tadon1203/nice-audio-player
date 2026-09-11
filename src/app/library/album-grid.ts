import { Component, input, output } from '@angular/core';
import type { LibraryAlbumKey, LibraryAlbumSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import { PageFrame } from '@app/ui/page-frame';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-album-grid',
	imports: [Artwork, Button, PageFrame],
	templateUrl: './album-grid.html'
})
export class AlbumGrid {
	readonly state = input.required<CatalogView<LibraryAlbumSummary>>();
	readonly playAlbum = output<LibraryAlbumKey>();
	readonly loadMore = output<void>();
	readonly scrollTopChange = output<number>();

	onScroll(event: Event): void {
		this.scrollTopChange.emit((event.target as HTMLElement).scrollTop);
	}
}
