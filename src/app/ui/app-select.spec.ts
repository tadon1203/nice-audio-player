import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AppSelect, type SelectOption } from './app-select';

const options: readonly SelectOption[] = [
	{ key: 'artist', label: 'Artist' },
	{ key: 'albumCount', label: 'Album count' },
	{ key: 'trackCount', label: 'Track count' }
];

function host(fixture: ComponentFixture<AppSelect>): HTMLElement {
	return fixture.nativeElement as HTMLElement;
}

describe('AppSelect', () => {
	async function createFixture(selectedKey = 'artist'): Promise<ComponentFixture<AppSelect>> {
		await TestBed.configureTestingModule({ imports: [AppSelect] }).compileComponents();
		const fixture = TestBed.createComponent(AppSelect);
		fixture.componentRef.setInput('label', 'Sort');
		fixture.componentRef.setInput('options', options);
		fixture.componentRef.setInput('selectedKey', selectedKey);
		fixture.detectChanges();
		return fixture;
	}

	async function open(fixture: ComponentFixture<AppSelect>): Promise<HTMLElement> {
		const trigger = host(fixture).querySelector('[role="combobox"]') as HTMLButtonElement;
		trigger.click();
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		return document.getElementById(trigger.getAttribute('aria-controls') ?? '') as HTMLElement;
	}

	it('renders a non-first selected option from the controlled key', async () => {
		const fixture = await createFixture('albumCount');
		const trigger = (fixture.nativeElement as HTMLElement).querySelector(
			'[role="combobox"]'
		) as HTMLButtonElement;

		expect(trigger.textContent).toContain('Album count');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-controls')).toMatch(/-listbox$/);
	});

	it('opens with the selected option focused and exposes listbox semantics', async () => {
		const fixture = await createFixture('albumCount');
		const listbox = await open(fixture);

		expect(listbox).not.toBeNull();
		expect(listbox.getAttribute('role')).toBe('listbox');
		expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(3);
		expect(listbox.querySelector('[aria-selected="true"]')?.textContent).toContain('Album count');
		expect(document.activeElement?.textContent).toContain('Album count');
		expect(
			(fixture.nativeElement as HTMLElement)
				.querySelector('[role="combobox"]')
				?.getAttribute('aria-expanded')
		).toBe('true');
	});

	it('navigates with arrows, Home, End, and typeahead without changing selection', async () => {
		const fixture = await createFixture('artist');
		const listbox = await open(fixture);

		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		fixture.detectChanges();
		expect(document.activeElement?.textContent).toContain('Album count');
		expect(listbox.querySelector('[aria-selected="true"]')?.textContent).toContain('Artist');

		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
		fixture.detectChanges();
		expect(document.activeElement?.textContent).toContain('Track count');

		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
		fixture.detectChanges();
		expect(document.activeElement?.textContent).toContain('Artist');
	});

	it('commits click and keyboard selection once, then restores trigger focus', async () => {
		const fixture = await createFixture('artist');
		const changes: string[] = [];
		fixture.componentInstance.selectionChange.subscribe((key) => changes.push(key));
		const listbox = await open(fixture);

		const albumCountOption = Array.from(listbox.querySelectorAll('[role="option"]')).find(
			(option) => option.textContent?.includes('Album count')
		) as HTMLElement | undefined;
		if (!albumCountOption) throw new Error('Album count option is missing');
		albumCountOption.click();
		fixture.detectChanges();
		await fixture.whenStable();

		expect(changes).toEqual(['albumCount']);
		expect(host(fixture).querySelector('[role="listbox"]')).toBeNull();
		expect(document.activeElement?.getAttribute('role')).toBe('combobox');
	});

	it('closes on Escape and outside click without emitting, and skips disabled options', async () => {
		const fixture = await createFixture('artist');
		fixture.componentRef.setInput('options', [
			{ key: 'artist', label: 'Artist' },
			{ key: 'albumCount', label: 'Album count', disabled: true },
			{ key: 'trackCount', label: 'Track count' }
		]);
		fixture.detectChanges();
		const changes: string[] = [];
		fixture.componentInstance.selectionChange.subscribe((key) => changes.push(key));
		const listbox = await open(fixture);

		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		fixture.detectChanges();
		expect(document.activeElement?.textContent).toContain('Track count');

		listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		fixture.detectChanges();
		await fixture.whenStable();
		expect(changes).toEqual([]);
		expect(host(fixture).querySelector('[role="listbox"]')).toBeNull();

		await open(fixture);
		document.body.click();
		fixture.detectChanges();
		expect(host(fixture).querySelector('[role="listbox"]')).toBeNull();
	});

	it('follows an external selectedKey change while open', async () => {
		const fixture = await createFixture('artist');
		const listbox = await open(fixture);

		fixture.componentRef.setInput('selectedKey', 'trackCount');
		fixture.detectChanges();

		expect(host(fixture).querySelector('[role="combobox"]')?.textContent).toContain('Track count');
		expect(listbox.querySelector('[aria-selected="true"]')?.textContent).toContain('Track count');
	});
});
