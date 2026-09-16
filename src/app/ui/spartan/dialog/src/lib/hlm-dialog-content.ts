import type { BooleanInput } from '@angular/cdk/coercion';
import type { ComponentType } from '@angular/cdk/portal';
import { NgComponentOutlet } from '@angular/common';
import { booleanAttribute, Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@app/ui/spartan/button';

import { classes } from '@app/ui/spartan/utils';
import { HlmDialogClose } from './hlm-dialog-close';

type HlmDialogContentContext = {
	$component?: ComponentType<unknown>;
	$dynamicComponentClass?: string;
	$showCloseButton?: boolean;
};

@Component({
	selector: 'hlm-dialog-content',
	imports: [NgComponentOutlet, HlmButton, HlmDialogClose, NgIcon],
	providers: [provideIcons({ lucideX })],
	host: {
		'data-slot': 'dialog-content',
		'[attr.data-state]': 'state()'
	},
	template: `
		@if (component) {
			<ng-container [ngComponentOutlet]="component" />
		} @else {
			<ng-content />
		}

		@if (showCloseButton()) {
			<button hlmBtn variant="ghost" size="icon-sm" class="end-2 top-2 absolute" hlmDialogClose>
				<span class="sr-only">close</span>
				<ng-icon name="lucideX" class="size-icon-small text-icon-small" />
			</button>
		}
	`
})
export class HlmDialogContent {
	private readonly _dialogRef = inject(BrnDialogRef);
	private readonly _dialogContext = injectBrnDialogContext<HlmDialogContentContext | null>({
		optional: true
	});

	public readonly showCloseButton = input<boolean, BooleanInput>(
		this._dialogContext?.$showCloseButton ?? true,
		{
			transform: booleanAttribute
		}
	);

	public readonly state = computed(() => this._dialogRef?.state() ?? 'closed');

	public readonly component = this._dialogContext?.$component;
	private readonly _dynamicComponentClass = this._dialogContext?.$dynamicComponentClass;

	constructor() {
		classes(() => [
			'bg-surface-chrome text-content-primary data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 grid max-w-[calc(100%-2rem)] gap-related rounded-control p-region text-body shadow-floating duration-spatial relative mx-auto w-full outline-none sm:mx-0',
			this._dynamicComponentClass
		]);
	}
}
