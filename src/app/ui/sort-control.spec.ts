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
		expect(root.querySelector('[role="combobox"]')?.textContent).toContain('Album title');
		expect(root.querySelector('svg[lucideArrowUp]')).not.toBeNull();
		expect(root.querySelector('button[appButton]')?.getAttribute('aria-pressed')).toBe('true');
	});

	it('resets direction when the key changes and toggles it from the icon button', async () => {
		await TestBed.configureTestingModule({ imports: [SortControl] }).compileComponents();
		const fixture = TestBed.createComponent(SortControl);
		fixture.componentRef.setInput('options', [
			{ key: 'title', label: 'Title' },
			{ key: 'year', label: 'Year' }
		]);
		fixture.componentRef.setInput('selectedKey', 'title');
		fixture.componentRef.setInput('direction', 'ascending');
		fixture.componentRef.setInput('selectId', 'sort-control-test');
		fixture.detectChanges();
		const changes: unknown[] = [];
		fixture.componentInstance.sortChange.subscribe((change) => changes.push(change));

		const root = fixture.nativeElement as HTMLElement;
		(root.querySelector('[role="combobox"]') as HTMLButtonElement).click();
		fixture.detectChanges();
		(
			Array.from(
				document.getElementById('sort-control-test-listbox')?.querySelectorAll('[role="option"]') ??
					[]
			).find((option) => option.textContent?.includes('Year')) as HTMLElement
		).click();
		fixture.componentRef.setInput('selectedKey', 'year');
		fixture.detectChanges();
		(root.querySelector('button[appButton]') as HTMLButtonElement).click();

		expect(changes).toEqual([
			{ key: 'year', direction: 'ascending' },
			{ key: 'year', direction: 'descending' }
		]);
	});
});
