import { TestBed } from '@angular/core/testing';
import { RangeControl } from './range-control';

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

describe('RangeControl', () => {
	it('adapts scalar slider changes into preview and commit events', async () => {
		await TestBed.configureTestingModule({ imports: [RangeControl] }).compileComponents();
		const fixture = TestBed.createComponent(RangeControl);
		fixture.componentRef.setInput('max', 1);
		fixture.componentRef.setInput('value', 0.25);
		fixture.componentRef.setInput('label', 'Volume');
		fixture.detectChanges();

		const inputValues: number[] = [];
		const commitValues: number[] = [];
		fixture.componentInstance.valueInput.subscribe((value) => inputValues.push(value));
		fixture.componentInstance.valueCommit.subscribe((value) => commitValues.push(value));
		const adapter = fixture.componentInstance as unknown as {
			onValueChange(values: number[]): void;
			commitPending(): void;
		};

		adapter.onValueChange([0.5]);
		expect(inputValues).toEqual([0.5]);
		expect(commitValues).toEqual([]);

		adapter.commitPending();
		expect(commitValues).toEqual([0.5]);
	});

	it('commits keyboard movement keys and preserves muted value text', async () => {
		await TestBed.configureTestingModule({ imports: [RangeControl] }).compileComponents();
		const fixture = TestBed.createComponent(RangeControl);
		fixture.componentRef.setInput('max', 1);
		fixture.componentRef.setInput('value', 0.25);
		fixture.componentRef.setInput('label', 'Volume');
		fixture.componentRef.setInput('valueText', 'Muted');
		fixture.componentRef.setInput('tone', 'subdued');
		fixture.detectChanges();

		const commits: number[] = [];
		fixture.componentInstance.valueCommit.subscribe((value) => commits.push(value));
		const adapter = fixture.componentInstance as unknown as {
			onValueChange(values: number[]): void;
			onKeyup(event: KeyboardEvent): void;
		};
		adapter.onValueChange([0.5]);
		adapter.onKeyup(new KeyboardEvent('keyup', { key: 'ArrowRight' }));

		expect(commits).toEqual([0.5]);
		const root = fixture.nativeElement as HTMLElement;
		expect(root.querySelector('[aria-valuetext="Muted"]')).not.toBeNull();
	});
});
