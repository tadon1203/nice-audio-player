import { Directive } from '@angular/core';

@Directive({
	selector: '[appScrollRegion]',
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-y-auto [scrollbar-gutter:stable]',
		'data-scroll-region': ''
	}
})
export class ScrollRegion {}
