import { Directive, input } from '@angular/core';

export type ButtonVariant =
	| 'primary'
	| 'secondary'
	| 'icon'
	| 'icon-compact'
	| 'transport'
	| 'danger'
	| 'album'
	| 'table-sort'
	| 'track-title';

@Directive({
	selector: 'button[appButton]',
	host: {
		class:
			'inline-flex shrink-0 items-center justify-center whitespace-nowrap border border-transparent text-label transition-colors hover:bg-surface-hover active:bg-surface-pressed disabled:pointer-events-none disabled:opacity-45 [&>svg]:pointer-events-none [&>svg]:shrink-0 data-[variant=primary]:min-h-control-default data-[variant=primary]:gap-control data-[variant=primary]:rounded-control data-[variant=primary]:px-group data-[variant=primary]:bg-surface-selected data-[variant=primary]:text-content-primary data-[variant=primary]:hover:bg-surface-hover data-[variant=secondary]:min-h-control-default data-[variant=secondary]:gap-control data-[variant=secondary]:rounded-control data-[variant=secondary]:border-stroke-control data-[variant=secondary]:px-group data-[variant=secondary]:text-content-primary data-[variant=danger]:min-h-control-default data-[variant=danger]:gap-control data-[variant=danger]:rounded-control data-[variant=danger]:border-danger data-[variant=danger]:px-group data-[variant=danger]:text-danger data-[variant=icon]:size-control-prominent data-[variant=icon]:rounded-control data-[variant=icon]:p-0 data-[variant=icon-compact]:size-control-compact data-[variant=icon-compact]:rounded-control data-[variant=icon-compact]:p-0 data-[variant=transport]:size-control-compact data-[variant=transport]:rounded-round data-[variant=transport]:p-0 data-[variant=transport]:text-content-secondary data-[variant=album]:min-h-0 data-[variant=album]:w-full data-[variant=album]:items-stretch data-[variant=album]:rounded-none data-[variant=album]:border-0 data-[variant=album]:p-0 data-[variant=album]:text-start data-[variant=album]:hover:bg-transparent data-[variant=album]:active:bg-transparent data-[variant=table-sort]:min-h-control-prominent data-[variant=table-sort]:gap-tight data-[variant=table-sort]:rounded-none data-[variant=table-sort]:border-0 data-[variant=table-sort]:bg-transparent data-[variant=table-sort]:p-0 data-[variant=table-sort]:text-content-secondary data-[variant=table-sort]:hover:bg-transparent data-[variant=table-sort]:hover:text-content-primary data-[variant=table-sort]:active:bg-transparent data-[variant=track-title]:min-h-track-row data-[variant=track-title]:w-full data-[variant=track-title]:gap-control data-[variant=track-title]:justify-start data-[variant=track-title]:truncate data-[variant=track-title]:rounded-none data-[variant=track-title]:border-0 data-[variant=track-title]:px-0 data-[variant=track-title]:text-start data-[variant=track-title]:text-body',
		'[style.width]': "variant() === 'album' ? '100%' : null",
		'[style.padding-inline]': "variant() === 'album' ? '0' : null",
		'[attr.data-variant]': 'variant()'
	}
})
export class Button {
	readonly variant = input<ButtonVariant>('secondary', { alias: 'appButton' });
}
