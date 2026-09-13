import { TestBed } from '@angular/core/testing';
import { SortControl } from './sort-control';

describe('SortControl', () => {
	it('renders the selected key, direction icon, and accessible state', async () => {
		await TestBed.configureTestingModule({ imports: [SortControl] }).compileComponents();
		const fixture = TestBed.createComponent(SortControl);
		fixture.componentRef.setInput('options', [
			{ key: 'title', label: 'Album title' },
			{ key: 'year', label: 'Year' }
		]);
		fixture.componentRef.setInput('selectedKey', 'title');
		fixture.componentRef.setInput('direction', 'ascending');
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		expect((root.querySelector('select') as HTMLSelectElement).value).toBe('title');
		expect(root.querySelector('svg[lucideArrowUp]')).not.toBeNull();
		expect(root.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
	});

	it('resets direction when the key changes and toggles it from the icon button', async () => {
		await TestBed.configureTestingModule({ imports: [SortControl] }).compileComponents();
		const fixture = TestBed.createComponent(SortControl);
		fixture.componentRef.setInput('options', [{ key: 'title', label: 'Title' }]);
		fixture.componentRef.setInput('selectedKey', 'title');
		fixture.componentRef.setInput('direction', 'ascending');
		fixture.detectChanges();
		const changes: unknown[] = [];
		fixture.componentInstance.sortChange.subscribe((change) => changes.push(change));

		const root = fixture.nativeElement as HTMLElement;
		const select = root.querySelector('select') as HTMLSelectElement;
		select.dispatchEvent(new Event('change'));
		(root.querySelector('button') as HTMLButtonElement).click();

		expect(changes).toEqual([
			{ key: 'title', direction: 'ascending' },
			{ key: 'title', direction: 'descending' }
		]);
	});
});
