import { Component, input, output } from '@angular/core';
import type { LibraryAlbumArtistSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-album-artist-grid',
	imports: [Artwork, Button],
	templateUrl: './album-artist-grid.html'
})
export class AlbumArtistGrid {
	readonly state = input.required<CatalogView<LibraryAlbumArtistSummary>>();
	readonly selectArtist = output<string>();
}
