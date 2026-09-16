import { Component, input } from '@angular/core';
import { BrnSlider, BrnSliderImports, injectBrnSlider } from '@spartan-ng/brain/slider';
import { classes } from '@app/ui/spartan/utils';

@Component({
	selector: 'hlm-slider, brn-slider [hlm]',
	imports: [BrnSliderImports],
	styleUrl: './hlm-slider.css',
	hostDirectives: [
		{
			directive: BrnSlider,
			inputs: [
				'id',
				'value',
				'disabled',
				'min',
				'max',
				'step',
				'minStepsBetweenThumbs',
				'maxStepsBetweenThumbs',
				'preventStepOverThumb',
				'inverted',
				'orientation',
				'showTicks',
				'maxTicks',
				'tickLabelInterval',
				'formatTick',
				'draggableRange',
				'draggableRangeOnly',
				'aria-label',
				'aria-labelledby'
			],
			outputs: ['valueChange']
		}
	],
	template: `
		<div
			class="relative flex h-full w-full items-center group-data-vertical:w-auto group-data-vertical:flex-col"
		>
			<div
				brnSliderTrack
				class="relative grow overflow-hidden rounded-round bg-surface-control transition-[block-size] duration-feedback ease-nap data-horizontal:h-tight data-horizontal:w-full data-vertical:h-full data-vertical:w-tight"
			>
				<div
					class="absolute bg-content-secondary select-none group-data-[tone=subdued]:bg-content-muted data-draggable-range:cursor-move data-horizontal:h-full data-vertical:w-full"
					brnSliderRange
				></div>
			</div>

			@for (i of _slider.thumbIndexes(); track i) {
				<span
					class="after:-inset-2 absolute block size-icon-small shrink-0 rounded-full border-0 bg-transparent select-none after:absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
					[attr.aria-valuetext]="ariaValueText()"
					brnSliderThumb
				></span>
			}
		</div>

		@if (_slider.showTicks()) {
			<div
				class="px-1.5 group-data-vertical:py-1.5 mt-3 gap-1 text-xs font-medium group-data-vertical:ms-3 flex w-full items-start justify-between text-muted-foreground group-data-horizontal:group-data-inverted:flex-row-reverse group-data-vertical:mt-0 group-data-vertical:w-auto group-data-vertical:flex-col-reverse group-data-vertical:px-0 group-data-vertical:group-data-inverted:flex-col"
			>
				<div
					*brnSliderTick="let tick; let formattedTick = formattedTick"
					class="group gap-2 flex w-0 flex-col items-center justify-center group-data-vertical:h-0 group-data-vertical:w-auto group-data-vertical:flex-row"
				>
					<div
						class="h-1 group-data-vertical:w-1 group-data-horizontal:group-data-[skip]:h-0.5 group-data-vertical:group-data-[skip]:w-0.5 w-px bg-muted-foreground/70 group-data-vertical:h-px"
					></div>
					<div class="text-center group-data-[skip]:opacity-0">{{ formattedTick }}</div>
				</div>
			</div>
		}
	`
})
export class HlmSlider {
	protected readonly _slider = injectBrnSlider();
	readonly ariaValueText = input<string | null>(null, { alias: 'aria-valuetext' });

	constructor() {
		classes(() => [
			'group relative flex w-full touch-none flex-col select-none data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-row data-[disabled]:pointer-events-none data-[disabled]:opacity-45'
		]);
	}
}
