import { Component, input, output } from '@angular/core';
import type { LibraryAlbumSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-album-grid',
	imports: [Artwork, Button],
	templateUrl: './album-grid.html'
})
export class AlbumGrid {
	readonly state = input.required<CatalogView<LibraryAlbumSummary>>();
	readonly openAlbum = output<LibraryAlbumSummary['key']>();
}
