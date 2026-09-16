import { Directive } from '@angular/core';
import { BrnDialogTitle } from '@spartan-ng/brain/dialog';
import { classes } from '@app/ui/spartan/utils';

@Directive({
	selector: '[hlmDialogTitle]',
	hostDirectives: [BrnDialogTitle],
	host: { 'data-slot': 'dialog-title' }
})
export class HlmDialogTitle {
	constructor() {
		classes(() => 'text-page-title font-normal text-content-primary');
	}
}
