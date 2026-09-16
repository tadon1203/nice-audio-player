import { Directive } from '@angular/core';
import { BrnSelectPlaceholder } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/spartan/utils';

@Directive({
	selector: '[hlmSelectPlaceholder],hlm-select-placeholder',
	hostDirectives: [BrnSelectPlaceholder],
	host: { 'data-slot': 'select-placeholder' }
})
export class HlmSelectPlaceholder {
	constructor() {
		classes(
			() =>
				'gap-control flex items-center data-hidden:hidden [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0'
		);
	}
}
