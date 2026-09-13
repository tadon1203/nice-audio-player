import { TestBed } from '@angular/core/testing';
import type { LibraryAlbumArtistSummary } from '@shared/native-app-api';
import { AlbumArtistGrid } from './album-artist-grid';
import type { CatalogView } from './library-workspace';

const state: CatalogView<LibraryAlbumArtistSummary> = {
	filter: '',
	scrollTop: 0,
	items: [
		{
			key: { name: 'Radiohead' },
			artwork: null,
			albumCount: 12,
			trackCount: 143
		}
	],
	totalCount: 1,
	nextCursor: null,
	loadState: 'ready',
	error: null,
	loadedFilter: '',
	sortKey: 'artist',
	sortDirection: 'ascending',
	loadedSortKey: 'artist',
	loadedSortDirection: 'ascending'
};

describe('AlbumArtistGrid', () => {
	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [AlbumArtistGrid] }).compileComponents();
	});

	it('renders artist identity, aggregate counts, and an artwork fallback', () => {
		const fixture = TestBed.createComponent(AlbumArtistGrid);
		fixture.componentRef.setInput('state', state);
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		const button = root.querySelector('button') as HTMLButtonElement;
		expect(button).not.toBeNull();
		expect(button.getAttribute('aria-label')).toBe('Browse albums by Radiohead');
		expect(button.textContent).toContain('Radiohead');
		expect(button.textContent).toContain('12 albums · 143 tracks');
		expect(button.querySelector('app-artwork span[aria-hidden="true"]')).not.toBeNull();
	});

	it('emits the selected artist and keeps partial count data readable', () => {
		const fixture = TestBed.createComponent(AlbumArtistGrid);
		fixture.componentRef.setInput('state', {
			...state,
			items: [{ ...state.items[0], trackCount: null }]
		});
		fixture.detectChanges();
		const selected: string[] = [];
		fixture.componentInstance.selectArtist.subscribe((name) => selected.push(name));

		const root = fixture.nativeElement as HTMLElement;
		(root.querySelector('button') as HTMLButtonElement).click();

		expect(selected).toEqual(['Radiohead']);
		expect(root.textContent).toContain('12 albums');
		expect(root.textContent).not.toContain('null tracks');
	});
});
