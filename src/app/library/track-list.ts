import { Component, input, output } from '@angular/core';
import type { LibraryTrackSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { FormatDurationPipe } from '@app/ui/format-duration';
import type { CatalogView } from './library-workspace';

@Component({
	selector: 'app-track-list',
	imports: [Button, FormatDurationPipe],
	templateUrl: './track-list.html'
})
export class TrackList {
	readonly state = input.required<CatalogView<LibraryTrackSummary>>();
	readonly activeTrackId = input<string | null>(null);
	readonly playbackStatus = input<'stopped' | 'playing' | 'paused' | 'failed'>('stopped');
	readonly playTrack = output<string>();
	readonly loadMore = output<void>();
	readonly scrollTopChange = output<number>();

	onScroll(event: Event): void {
		this.scrollTopChange.emit((event.target as HTMLElement).scrollTop);
	}
}
