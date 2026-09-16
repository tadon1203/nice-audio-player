import { TestBed } from '@angular/core/testing';
import { TrackTable, type TrackTableRow } from './track-table';

const row: TrackTableRow = {
	id: 'track-1',
	title: 'Reckoner',
	artist: 'Radiohead',
	album: 'In Rainbows',
	trackNumber: null,
	discNumber: null,
	format: null,
	quality: null,
	durationMs: 290000,
	availability: 'available',
	playable: true
};

describe('TrackTable', () => {
	it('uses library column headers as sort controls and marks only the active column', async () => {
		await TestBed.configureTestingModule({ imports: [TrackTable] }).compileComponents();
		const fixture = TestBed.createComponent(TrackTable);
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('columns', ['title', 'artist', 'album', 'duration']);
		fixture.componentRef.setInput('layout', 'library');
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		const headers = root.querySelectorAll('th');
		expect(headers[0].getAttribute('aria-sort')).toBe('ascending');
		expect(headers[1].getAttribute('aria-sort')).toBe('none');
		expect(headers[0]?.querySelector('ng-icon[name="lucideArrowUp"]')).not.toBeNull();
		expect(root.querySelectorAll('thead button')).toHaveLength(4);
	});

	it('does not make album detail headers sortable', async () => {
		await TestBed.configureTestingModule({ imports: [TrackTable] }).compileComponents();
		const fixture = TestBed.createComponent(TrackTable);
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('columns', ['number', 'title', 'duration']);
		fixture.componentRef.setInput('layout', 'album');
		fixture.detectChanges();

		expect((fixture.nativeElement as HTMLElement).querySelectorAll('thead button')).toHaveLength(0);
	});
});
