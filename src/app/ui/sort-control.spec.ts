import { TestBed } from '@angular/core/testing';
import { SortControl } from './sort-control';

class TestResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
	configurable: true,
	value: TestResizeObserver
});

HTMLElement.prototype.scrollIntoView = (): void => {};

describe('SortControl', () => {
	async function createFixture(direction: 'ascending' | 'descending' = 'ascending') {
		await TestBed.configureTestingModule({ imports: [SortControl] }).compileComponents();
		const fixture = TestBed.createComponent(SortControl);
		fixture.componentRef.setInput('options', [
			{ key: 'title', label: 'Album title' },
			{ key: 'year', label: 'Year' },
			{ key: 'disabled', label: 'Disabled', disabled: true }
		]);
		fixture.componentRef.setInput('selectedKey', 'title');
		fixture.componentRef.setInput('direction', direction);
		fixture.detectChanges();
		return fixture;
	}

	it('renders the selected value and accessible trigger association', async () => {
		const fixture = await createFixture();
		const root = fixture.nativeElement as HTMLElement;
		const label = root.querySelector('label');
		const trigger = root.querySelector('[role="combobox"]');

		expect(trigger?.textContent).toContain('Album title');
		expect(label?.getAttribute('for')).toBe(trigger?.getAttribute('id'));
		expect(root.querySelector('ng-icon[name="lucideArrowUp"]')).not.toBeNull();
	});

	it('resets direction when the key changes and toggles it from the icon button', async () => {
		const fixture = await createFixture();
		const changes: unknown[] = [];
		fixture.componentInstance.sortChange.subscribe((change) => changes.push(change));
		const root = fixture.nativeElement as HTMLElement;

		(root.querySelector('[role="combobox"]') as HTMLButtonElement).click();
		fixture.detectChanges();
		(
			Array.from(document.querySelectorAll('[role="option"]')).find((option) =>
				option.textContent?.includes('Year')
			) as HTMLElement
		).click();
		fixture.componentRef.setInput('selectedKey', 'year');
		fixture.detectChanges();
		(root.querySelector('button[hlmBtn]') as HTMLButtonElement).click();

		expect(changes).toEqual([
			{ key: 'year', direction: 'ascending' },
			{ key: 'year', direction: 'descending' }
		]);
	});
});
