import { Directive, input, signal } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { classes } from '@app/ui/spartan/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';
import { injectBrnButtonConfig } from './hlm-button.token';

export const buttonVariants = cva(
	'inline-flex shrink-0 items-center justify-center whitespace-nowrap border border-transparent text-label transition-colors duration-feedback ease-nap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas data-disabled:pointer-events-none data-disabled:opacity-45 disabled:pointer-events-none disabled:opacity-45 [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0',
	{
		variants: {
			variant: {
				default:
					'rounded-control bg-surface-selected px-group text-content-primary hover:bg-surface-hover active:bg-surface-pressed',
				outline:
					'rounded-control border-stroke-control bg-transparent px-group text-content-primary hover:bg-surface-hover active:bg-surface-pressed',
				secondary:
					'rounded-control bg-surface-control px-group text-content-primary hover:bg-surface-hover active:bg-surface-pressed',
				ghost:
					'rounded-control bg-transparent text-content-primary hover:bg-surface-hover active:bg-surface-pressed',
				destructive:
					'rounded-control border-danger bg-transparent px-group text-danger hover:bg-surface-hover active:bg-surface-pressed',
				link: 'rounded-control bg-transparent text-content-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-control-default gap-control',
				xs: 'h-control-compact gap-tight',
				sm: 'h-control-compact gap-tight',
				lg: 'h-control-prominent gap-control',
				icon: 'size-control-prominent',
				'icon-xs': 'size-control-compact',
				'icon-sm': 'size-control-compact',
				'icon-lg': 'size-control-prominent'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

@Directive({
	selector: 'button[hlmBtn], a[hlmBtn]',
	exportAs: 'hlmBtn',
	hostDirectives: [{ directive: BrnButton, inputs: ['disabled'] }],
	host: { 'data-slot': 'button' }
})
export class HlmButton {
	private readonly _config = injectBrnButtonConfig();

	private readonly _additionalClasses = signal<ClassValue>('');

	public readonly variant = input<ButtonVariants['variant']>(this._config.variant);

	public readonly size = input<ButtonVariants['size']>(this._config.size);

	constructor() {
		classes(() => [
			buttonVariants({ variant: this.variant(), size: this.size() }),
			this._additionalClasses()
		]);
	}

	setClass(classes: string): void {
		this._additionalClasses.set(classes);
	}
}
