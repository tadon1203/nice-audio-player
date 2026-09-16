import { Component, input, output } from '@angular/core';
import type { LibraryAlbumSummary } from '@shared/native-app-api';
import { HlmButton } from '@app/ui/spartan/button';
import { Artwork } from '@app/ui/artwork';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-album-grid',
	imports: [Artwork, HlmButton],
	templateUrl: './album-grid.html'
})
export class AlbumGrid {
	readonly state = input.required<CatalogView<LibraryAlbumSummary>>();
	readonly openAlbum = output<LibraryAlbumSummary['key']>();
}
