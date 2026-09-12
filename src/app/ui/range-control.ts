import { Component, input, output } from '@angular/core';

@Component({
	selector: 'app-range-control',
	host: { class: 'range-control relative block min-w-0' },
	template: `
		<span
			class="range-control-track absolute inset-x-0 top-1/2 -translate-y-1/2"
			aria-hidden="true"
			data-range-track
			[style.--md-state-range-progress]="progress()"
		></span>
		<input
			type="range"
			[min]="min()"
			[max]="max()"
			[step]="step()"
			[value]="value()"
			[disabled]="disabled()"
			[attr.aria-label]="label()"
			[attr.aria-valuetext]="valueText()"
			class="range-control-input absolute inset-x-0 top-1/2 z-10 h-hit-target-min w-full -translate-y-1/2"
			(input)="emitInput($event)"
			(change)="emitChange($event)"
		/>
	`
})
export class RangeControl {
	readonly min = input(0);
	readonly max = input.required<number>();
	readonly step = input(1);
	readonly value = input.required<number>();
	readonly progress = input(0);
	readonly label = input.required<string>();
	readonly valueText = input<string | null>(null);
	readonly disabled = input(false);
	readonly valueInput = output<number>();
	readonly valueChange = output<number>();

	protected emitInput(event: Event): void {
		this.valueInput.emit(this.readValue(event));
	}

	protected emitChange(event: Event): void {
		this.valueChange.emit(this.readValue(event));
	}

	private readValue(event: Event): number {
		return Number((event.target as HTMLInputElement).value);
	}
}
