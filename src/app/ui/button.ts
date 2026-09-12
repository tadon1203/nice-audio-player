import { Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'icon' | 'transport' | 'danger' | 'album';

@Directive({
	selector: 'button[appButton]',
	host: {
		class:
			'inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-transparent px-4 text-body-md font-medium outline-none hover:bg-surface-hover active:bg-surface-pressed focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:opacity-45 data-[variant=primary]:bg-text-primary data-[variant=primary]:text-canvas data-[variant=primary]:hover:bg-text-secondary data-[variant=danger]:border-error data-[variant=danger]:text-error data-[variant=icon]:h-10 data-[variant=icon]:w-10 data-[variant=icon]:p-0 data-[variant=transport]:h-8 data-[variant=transport]:w-8 data-[variant=transport]:rounded-full data-[variant=transport]:p-0 data-[variant=transport]:text-text-secondary data-[variant=secondary]:border-border-subtle data-[variant=secondary]:text-text-primary data-[variant=album]:min-h-0 data-[variant=album]:rounded-none data-[variant=album]:border-0 data-[variant=album]:p-0 data-[variant=album]:text-start data-[variant=album]:hover:bg-transparent data-[variant=album]:active:bg-transparent',
		'[attr.data-variant]': 'variant()'
	}
})
export class Button {
	readonly variant = input<ButtonVariant>('secondary', { alias: 'appButton' });
}
