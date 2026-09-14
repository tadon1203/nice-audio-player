import { Component, input, output } from '@angular/core';
import { LucideArrowDown, LucideArrowUp, LucidePause, LucidePlay } from '@lucide/angular';
import type {
	LibraryFileAvailability,
	LibrarySortDirection,
	LibraryTrackSortKey
} from '@shared/protocol/types';
import { Button } from '@app/ui/button';
import { FormatDurationPipe } from '@app/ui/format-duration';

export type TrackTableColumn =
	'number' | 'title' | 'artist' | 'album' | 'format' | 'quality' | 'duration';
export type TrackTableLayout = 'library' | 'album';
export type TrackTablePlaybackStatus = 'stopped' | 'playing' | 'paused' | 'failed';
export interface TrackTableSortChange {
	readonly key: LibraryTrackSortKey;
	readonly direction: LibrarySortDirection;
}
export const libraryTrackTableColumns: readonly TrackTableColumn[] = [
	'title',
	'artist',
	'album',
	'duration'
];
export const albumTrackTableColumns: readonly TrackTableColumn[] = [
	'number',
	'title',
	'format',
	'quality',
	'duration'
];

export interface TrackTableRow {
	readonly id: string;
	readonly title: string;
	readonly artist: string | null;
	readonly album: string | null;
	readonly trackNumber: number | null;
	readonly discNumber: number | null;
	readonly format: string | null;
	readonly quality: string | null;
	readonly durationMs: number | null;
	readonly availability: LibraryFileAvailability;
	readonly playable: boolean;
}

@Component({
	selector: 'app-track-table',
	imports: [Button, FormatDurationPipe, LucideArrowDown, LucideArrowUp, LucidePause, LucidePlay],
	templateUrl: './track-table.html'
})
export class TrackTable {
	readonly rows = input.required<readonly TrackTableRow[]>();
	readonly columns = input.required<readonly TrackTableColumn[]>();
	readonly layout = input.required<TrackTableLayout>();
	readonly caption = input('Tracks');
	readonly activeTrackId = input<string | null>(null);
	readonly playbackStatus = input<TrackTablePlaybackStatus>('stopped');
	readonly sortKey = input<LibraryTrackSortKey>('title');
	readonly sortDirection = input<LibrarySortDirection>('ascending');
	readonly playTrack = output<string>();
	readonly sortChange = output<TrackTableSortChange>();

	columnWidth(column: TrackTableColumn): string {
		const width = trackTableColumnWidths[this.layout()][column];
		return width === undefined ? 'auto' : `${width}%`;
	}

	columnLabel(column: TrackTableColumn): string {
		switch (column) {
			case 'number':
				return '#';
			case 'title':
				return 'Title';
			case 'artist':
				return 'Artist';
			case 'album':
				return 'Album';
			case 'format':
				return 'Format';
			case 'quality':
				return 'Quality';
			case 'duration':
				return 'Time';
		}
	}

	sortKeyForColumn(column: TrackTableColumn): LibraryTrackSortKey | null {
		if (column === 'title' || column === 'artist' || column === 'album' || column === 'duration')
			return column;
		return null;
	}

	isSortActive(column: TrackTableColumn): boolean {
		return this.sortKeyForColumn(column) === this.sortKey();
	}

	sortAria(column: TrackTableColumn): 'ascending' | 'descending' | 'none' {
		if (!this.isSortActive(column)) return 'none';
		return this.sortDirection();
	}

	toggleSort(column: TrackTableColumn): void {
		const key = this.sortKeyForColumn(column);
		if (!key) return;
		this.sortChange.emit({
			key,
			direction:
				this.isSortActive(column) && this.sortDirection() === 'ascending'
					? 'descending'
					: 'ascending'
		});
	}

	trackNumberLabel(row: TrackTableRow): string {
		if (row.trackNumber === null) return '—';
		return row.discNumber !== null && row.discNumber > 1
			? `${row.discNumber}.${row.trackNumber}`
			: String(row.trackNumber).padStart(2, '0');
	}

	isActive(row: TrackTableRow): boolean {
		return this.activeTrackId() === row.id;
	}

	playbackState(row: TrackTableRow): TrackTablePlaybackStatus | 'idle' {
		return this.isActive(row) ? this.playbackStatus() : 'idle';
	}

	statusLabel(row: TrackTableRow): string | null {
		if (row.availability === 'missing') return 'Missing';
		if (!row.playable) return 'Unavailable';
		if (!this.isActive(row)) return null;
		if (this.playbackStatus() === 'playing') return 'Playing';
		if (this.playbackStatus() === 'paused') return 'Paused';
		return null;
	}
}

const trackTableColumnWidths: Record<
	TrackTableLayout,
	Partial<Record<TrackTableColumn, number>>
> = {
	library: {
		title: 35,
		artist: 21,
		album: 37,
		duration: 7
	},
	album: {
		number: 7,
		title: 44,
		format: 17,
		quality: 24,
		duration: 8
	}
};
