import { Directive } from '@angular/core';
import { classes } from '@app/ui/spartan/utils';

@Directive({ selector: '[hlmSelectValuesContent],hlm-select-values-content' })
export class HlmSelectValuesContent {
	constructor() {
		classes(() => 'gap-2 flex');
	}
}
