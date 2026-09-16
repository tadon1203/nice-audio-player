import { Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { BrnSelectItem } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/spartan/utils';

@Component({
	selector: 'hlm-select-item',
	imports: [NgIcon],
	providers: [provideIcons({ lucideCheck })],
	hostDirectives: [{ directive: BrnSelectItem, inputs: ['id', 'disabled', 'value'] }],
	host: { 'data-slot': 'select-item' },
	template: `
		<ng-content />
		@if (_active()) {
			<ng-icon
				name="lucideCheck"
				class="end-2 absolute flex size-icon-small items-center justify-center text-icon-small"
				aria-hidden="true"
			/>
		}
	`
})
export class HlmSelectItem {
	private readonly _brnSelectItem = inject(BrnSelectItem);

	protected readonly _active = this._brnSelectItem.active;

	constructor() {
		classes(
			() =>
				'data-highlighted:bg-surface-hover data-highlighted:text-content-primary data-selected:bg-surface-selected data-selected:text-content-primary min-h-nav-row gap-control rounded-control px-control text-body *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-control relative flex w-full cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-45 [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0'
		);
	}
}
