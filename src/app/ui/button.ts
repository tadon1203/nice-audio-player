import { Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'icon' | 'transport' | 'danger' | 'album';

@Directive({
	selector: 'button[appButton]',
	host: {
		class:
			'inline-flex min-h-control-default items-center justify-center gap-2 rounded-small border border-transparent px-4 text-label-large outline-none hover:bg-surface-container active:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-45 data-[variant=primary]:bg-primary data-[variant=primary]:text-on-primary data-[variant=primary]:hover:bg-secondary data-[variant=danger]:border-error data-[variant=danger]:text-error data-[variant=icon]:size-control-default data-[variant=icon]:p-0 data-[variant=transport]:size-control-compact data-[variant=transport]:rounded-full data-[variant=transport]:p-0 data-[variant=transport]:text-secondary data-[variant=secondary]:border-outline-variant data-[variant=secondary]:text-on-surface data-[variant=album]:min-h-0 data-[variant=album]:rounded-none data-[variant=album]:border-0 data-[variant=album]:p-0 data-[variant=album]:text-start data-[variant=album]:hover:bg-transparent data-[variant=album]:active:bg-transparent',
		'[attr.data-variant]': 'variant()'
	}
})
export class Button {
	readonly variant = input<ButtonVariant>('secondary', { alias: 'appButton' });
}
