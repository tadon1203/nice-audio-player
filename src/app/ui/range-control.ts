import { Component, computed, input, output, signal } from '@angular/core';
import { HlmSliderImports } from '@app/ui/spartan/slider';

export type RangeControlTone = 'default' | 'subdued';
export type RangeControlLayoutHeight = 'tight' | 'prominent';

const COMMIT_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'PageUp',
	'PageDown',
	'Home',
	'End'
]);

@Component({
	selector: 'app-range-control',
	imports: [...HlmSliderImports],
	host: {
		class: 'relative block min-w-0',
		'[class.h-tight]': "layoutHeight() === 'tight'",
		'[class.h-control-prominent]': "layoutHeight() === 'prominent'"
	},
	template: `
		<hlm-slider
			class="absolute inset-x-0 top-1/2 -translate-y-1/2"
			[min]="min()"
			[max]="max()"
			[step]="step()"
			[value]="sliderValue()"
			[disabled]="disabled()"
			[aria-label]="label()"
			[aria-valuetext]="valueText()"
			[attr.data-tone]="tone()"
			(valueChange)="onValueChange($event)"
			(pointerup)="commitPending()"
			(keyup)="onKeyup($event)"
		></hlm-slider>
	`
})
export class RangeControl {
	readonly min = input(0);
	readonly max = input.required<number>();
	readonly step = input(1);
	readonly value = input.required<number>();
	readonly label = input.required<string>();
	readonly valueText = input<string | null>(null);
	readonly disabled = input(false);
	readonly tone = input<RangeControlTone>('default');
	readonly layoutHeight = input<RangeControlLayoutHeight>('prominent');
	readonly valueInput = output<number>();
	readonly valueCommit = output<number>();

	protected readonly sliderValue = computed(() => [this.value()]);
	private readonly pendingCommit = signal<number | null>(null);

	protected onValueChange(values: number[]): void {
		const value = values[0];
		if (value === undefined || value === this.value()) return;
		this.pendingCommit.set(value);
		this.valueInput.emit(value);
	}

	protected onKeyup(event: KeyboardEvent): void {
		if (COMMIT_KEYS.has(event.key)) this.commitPending();
	}

	protected commitPending(): void {
		const value = this.pendingCommit();
		if (value === null) return;
		this.pendingCommit.set(null);
		this.valueCommit.emit(value);
	}
}
